import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, network } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  VeilBatchAuctionV2,
  VeilBatchAuctionV2__factory,
  MockConfidentialToken,
  MockConfidentialToken__factory,
} from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

const BATCH_BLOCKS = 30;
const TICK_PRICE_0 = 100n;
const TICK_STEP = 100n;
const MAX_PRICE = TICK_PRICE_0 + 3n * TICK_STEP;
const OPERATOR_TTL = 60 * 60 * 24;

async function deployFixture() {
  const tokenFactory = (await ethers.getContractFactory("MockConfidentialToken")) as MockConfidentialToken__factory;
  const base = (await tokenFactory.deploy("Veil Base", "vBASE", 6)) as MockConfidentialToken;
  const quote = (await tokenFactory.deploy("Veil Quote", "vQUOTE", 6)) as MockConfidentialToken;
  const baseAddress = await base.getAddress();
  const quoteAddress = await quote.getAddress();

  const veilFactory = (await ethers.getContractFactory("VeilBatchAuctionV2")) as VeilBatchAuctionV2__factory;
  const veil = (await veilFactory.deploy(
    BATCH_BLOCKS,
    baseAddress,
    quoteAddress,
    TICK_PRICE_0,
    TICK_STEP,
  )) as VeilBatchAuctionV2;
  const veilAddress = await veil.getAddress();

  return { veil, veilAddress, base, baseAddress, quote, quoteAddress };
}

async function mintTo(
  token: MockConfidentialToken,
  tokenAddress: string,
  to: HardhatEthersSigner,
  amount: number,
) {
  const input = await fhevm.createEncryptedInput(tokenAddress, to.address).add64(amount).encrypt();
  await (await token.connect(to).mint(to.address, input.handles[0], input.inputProof)).wait();
}

async function approveVeil(
  token: MockConfidentialToken,
  holder: HardhatEthersSigner,
  veilAddress: string,
) {
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  await (await token.connect(holder).setOperator(veilAddress, now + OPERATOR_TTL)).wait();
}

async function placeOrder(
  veil: VeilBatchAuctionV2,
  veilAddress: string,
  signer: HardhatEthersSigner,
  isBuy: boolean,
  tick: number,
  size: number,
) {
  const input = await fhevm
    .createEncryptedInput(veilAddress, signer.address)
    .addBool(isBuy)
    .add8(tick)
    .add64(size)
    .encrypt();
  return veil
    .connect(signer)
    .placeOrder(input.handles[0], input.handles[1], input.handles[2], input.inputProof);
}

async function balanceOf(token: MockConfidentialToken, tokenAddress: string, who: HardhatEthersSigner) {
  const handle = await token.confidentialBalanceOf(who.address);
  if (handle === ethers.ZeroHash) return 0n;
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, who);
}

async function mineBlocks(n: number) {
  for (let i = 0; i < n; i++) await network.provider.send("evm_mine");
}

describe("VeilBatchAuctionV2", function () {
  let signers: Signers;
  let veil: VeilBatchAuctionV2;
  let veilAddress: string;
  let base: MockConfidentialToken;
  let baseAddress: string;
  let quote: MockConfidentialToken;
  let quoteAddress: string;

  before(async function () {
    const eth = await ethers.getSigners();
    signers = { deployer: eth[0], alice: eth[1], bob: eth[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("VeilBatchAuctionV2 unit tests only run on the FHEVM mock environment");
      this.skip();
    }
    ({ veil, veilAddress, base, baseAddress, quote, quoteAddress } = await deployFixture());
  });

  describe("configuration", function () {
    it("exposes tick prices", async function () {
      expect(await veil.tickPrice(0)).to.equal(TICK_PRICE_0);
      expect(await veil.tickPrice(3)).to.equal(MAX_PRICE);
      expect(await veil.maxTickPrice()).to.equal(MAX_PRICE);
    });
  });

  describe("escrow on placeOrder", function () {
    beforeEach(async function () {
      await mintTo(base, baseAddress, signers.alice, 1_000);
      await mintTo(quote, quoteAddress, signers.bob, 1_000_000);
      await approveVeil(base, signers.alice, veilAddress);
      await approveVeil(quote, signers.alice, veilAddress);
      await approveVeil(base, signers.bob, veilAddress);
      await approveVeil(quote, signers.bob, veilAddress);
    });

    it("pulls base from a sell order, leaves quote untouched", async function () {
      const tx = await placeOrder(veil, veilAddress, signers.alice, false, 0, 50);
      await tx.wait();
      expect(await balanceOf(base, baseAddress, signers.alice)).to.equal(950n);
      expect(await balanceOf(quote, quoteAddress, signers.alice)).to.equal(0n);
    });

    it("pulls quote at maxPrice from a buy order, leaves base untouched", async function () {
      const tx = await placeOrder(veil, veilAddress, signers.bob, true, 3, 50);
      await tx.wait();
      const expectedQuoteEscrow = 50n * MAX_PRICE;
      expect(await balanceOf(quote, quoteAddress, signers.bob)).to.equal(1_000_000n - expectedQuoteEscrow);
      expect(await balanceOf(base, baseAddress, signers.bob)).to.equal(0n);
    });

    it("reverts if the trader has not set the contract as operator", async function () {
      const eve = (await ethers.getSigners())[4];
      await mintTo(base, baseAddress, eve, 100);
      await expect(placeOrder(veil, veilAddress, eve, false, 0, 50)).to.be.reverted;
    });
  });

  describe("settlement", function () {
    beforeEach(async function () {
      await mintTo(base, baseAddress, signers.alice, 1_000);
      await mintTo(quote, quoteAddress, signers.bob, 1_000_000);
      await approveVeil(base, signers.alice, veilAddress);
      await approveVeil(quote, signers.alice, veilAddress);
      await approveVeil(base, signers.bob, veilAddress);
      await approveVeil(quote, signers.bob, veilAddress);
    });

    async function runFullLifecycle(): Promise<{ batchId: number; clearingTick: number }> {
      await (await placeOrder(veil, veilAddress, signers.alice, false, 0, 50)).wait();
      await (await placeOrder(veil, veilAddress, signers.bob, true, 3, 50)).wait();
      await mineBlocks(BATCH_BLOCKS);
      await (await veil.connect(signers.deployer).closeBatch()).wait();
      const clearingTick = 0;
      const marginalBuyBps = 0;
      const marginalSellBps = BPS_DENOM;
      await (
        await veil.connect(signers.deployer).submitClearing(1, clearingTick, marginalBuyBps, marginalSellBps)
      ).wait();
      return { batchId: 1, clearingTick };
    }

    const BPS_DENOM = 10_000;

    it("pays the sell side filled × clearingPrice in quote and refunds zero base", async function () {
      const { batchId } = await runFullLifecycle();
      await (await veil.connect(signers.alice).settle(batchId, 0)).wait();

      const expectedQuote = 50n * TICK_PRICE_0;
      expect(await balanceOf(quote, quoteAddress, signers.alice)).to.equal(expectedQuote);
      expect(await balanceOf(base, baseAddress, signers.alice)).to.equal(950n);
    });

    it("pays the buy side filled base and refunds (size · maxPrice − filled · clearingPrice) quote", async function () {
      const { batchId } = await runFullLifecycle();
      await (await veil.connect(signers.bob).settle(batchId, 1)).wait();

      const escrowed = 50n * MAX_PRICE;
      const consumed = 50n * TICK_PRICE_0;
      const expectedQuote = 1_000_000n - escrowed + (escrowed - consumed);
      expect(await balanceOf(base, baseAddress, signers.bob)).to.equal(50n);
      expect(await balanceOf(quote, quoteAddress, signers.bob)).to.equal(expectedQuote);
    });

    it("conserves total tokens across the lifecycle", async function () {
      const { batchId } = await runFullLifecycle();
      await (await veil.connect(signers.alice).settle(batchId, 0)).wait();
      await (await veil.connect(signers.bob).settle(batchId, 1)).wait();

      const aliceBase = await balanceOf(base, baseAddress, signers.alice);
      const aliceQuote = await balanceOf(quote, quoteAddress, signers.alice);
      const bobBase = await balanceOf(base, baseAddress, signers.bob);
      const bobQuote = await balanceOf(quote, quoteAddress, signers.bob);

      expect(aliceBase + bobBase).to.equal(1_000n);
      expect(aliceQuote + bobQuote).to.equal(1_000_000n);
    });

    it("reverts when called by a non-trader", async function () {
      const { batchId } = await runFullLifecycle();
      await expect(veil.connect(signers.bob).settle(batchId, 0)).to.be.revertedWithCustomError(
        veil,
        "NotOrderTrader",
      );
    });

    it("reverts on double settle", async function () {
      const { batchId } = await runFullLifecycle();
      await (await veil.connect(signers.alice).settle(batchId, 0)).wait();
      await expect(veil.connect(signers.alice).settle(batchId, 0)).to.be.revertedWithCustomError(
        veil,
        "AlreadySettled",
      );
    });

    it("reverts when batch is not cleared", async function () {
      await (await placeOrder(veil, veilAddress, signers.alice, false, 0, 50)).wait();
      await expect(veil.connect(signers.alice).settle(1, 0)).to.be.revertedWithCustomError(
        veil,
        "BatchNotCleared",
      );
    });
  });
});
