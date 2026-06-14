import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, network } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  VeilLendingVault,
  VeilLendingVault__factory,
  VeilBatchAuctionV2,
  VeilBatchAuctionV2__factory,
  MockConfidentialToken,
  MockConfidentialToken__factory,
} from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  keeper: HardhatEthersSigner;
};

const PRICE = 3400n;
const LTV_BPS = 7500;
const LIQ_BONUS_BPS = 500;
const BPS_DENOM = 10_000n;
const OPERATOR_TTL = 60 * 60 * 24;
const VAULT_QUOTE_SEED = 10_000_000;

async function deployTokens() {
  const tokenFactory = (await ethers.getContractFactory(
    "MockConfidentialToken",
  )) as MockConfidentialToken__factory;
  const base = (await tokenFactory.deploy("Veil Base", "vBASE", 6)) as MockConfidentialToken;
  const quote = (await tokenFactory.deploy("Veil Quote", "vQUOTE", 6)) as MockConfidentialToken;
  return {
    base,
    baseAddress: await base.getAddress(),
    quote,
    quoteAddress: await quote.getAddress(),
  };
}

async function deployVault(baseAddress: string, quoteAddress: string) {
  const vaultFactory = (await ethers.getContractFactory(
    "VeilLendingVault",
  )) as VeilLendingVault__factory;
  const vault = (await vaultFactory.deploy(
    baseAddress,
    quoteAddress,
    PRICE,
    LTV_BPS,
    LIQ_BONUS_BPS,
  )) as VeilLendingVault;
  return { vault, vaultAddress: await vault.getAddress() };
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

async function mintToAddress(
  token: MockConfidentialToken,
  tokenAddress: string,
  funder: HardhatEthersSigner,
  recipient: string,
  amount: number,
) {
  const input = await fhevm.createEncryptedInput(tokenAddress, funder.address).add64(amount).encrypt();
  await (await token.connect(funder).mint(recipient, input.handles[0], input.inputProof)).wait();
}

async function setOperator(
  contractWithOperator: { connect: (s: HardhatEthersSigner) => { setOperator: (a: string, until: number) => Promise<{ wait: () => Promise<unknown> }> } },
  holder: HardhatEthersSigner,
  operatorAddress: string,
) {
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  await (await contractWithOperator.connect(holder).setOperator(operatorAddress, now + OPERATOR_TTL)).wait();
}

async function encryptedAmount(target: string, sender: HardhatEthersSigner, amount: number) {
  return fhevm.createEncryptedInput(target, sender.address).add64(amount).encrypt();
}

async function balanceOf(token: MockConfidentialToken, tokenAddress: string, who: HardhatEthersSigner) {
  const handle = await token.confidentialBalanceOf(who.address);
  if (handle === ethers.ZeroHash) return 0n;
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, who);
}

async function collateralOf(vault: VeilLendingVault, vaultAddress: string, who: HardhatEthersSigner) {
  const handle = await vault.getCollateral(who.address);
  if (handle === ethers.ZeroHash) return 0n;
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, vaultAddress, who);
}

async function debtOf(vault: VeilLendingVault, vaultAddress: string, who: HardhatEthersSigner) {
  const handle = await vault.getDebt(who.address);
  if (handle === ethers.ZeroHash) return 0n;
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, vaultAddress, who);
}

async function mineBlocks(n: number) {
  for (let i = 0; i < n; i++) await network.provider.send("evm_mine");
}

describe("VeilLendingVault", function () {
  let signers: Signers;
  let vault: VeilLendingVault;
  let vaultAddress: string;
  let base: MockConfidentialToken;
  let baseAddress: string;
  let quote: MockConfidentialToken;
  let quoteAddress: string;

  before(async function () {
    const eth = await ethers.getSigners();
    signers = { deployer: eth[0], alice: eth[1], bob: eth[2], keeper: eth[3] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("VeilLendingVault unit tests only run on the FHEVM mock environment");
      this.skip();
    }
    ({ base, baseAddress, quote, quoteAddress } = await deployTokens());
    ({ vault, vaultAddress } = await deployVault(baseAddress, quoteAddress));

    await mintTo(base, baseAddress, signers.alice, 1_000);
    await mintToAddress(quote, quoteAddress, signers.deployer, vaultAddress, VAULT_QUOTE_SEED);
    await setOperator(base, signers.alice, vaultAddress);
    await setOperator(quote, signers.alice, vaultAddress);
  });

  async function deposit(signer: HardhatEthersSigner, amount: number) {
    const input = await encryptedAmount(vaultAddress, signer, amount);
    return vault.connect(signer).deposit(input.handles[0], input.inputProof);
  }

  async function withdraw(signer: HardhatEthersSigner, amount: number) {
    const input = await encryptedAmount(vaultAddress, signer, amount);
    return vault.connect(signer).withdraw(input.handles[0], input.inputProof);
  }

  async function borrow(signer: HardhatEthersSigner, amount: number) {
    const input = await encryptedAmount(vaultAddress, signer, amount);
    return vault.connect(signer).borrow(input.handles[0], input.inputProof);
  }

  async function repay(signer: HardhatEthersSigner, amount: number) {
    const input = await encryptedAmount(vaultAddress, signer, amount);
    return vault.connect(signer).repay(input.handles[0], input.inputProof);
  }

  describe("deposit", function () {
    it("moves base from the user's wallet into the vault's encrypted collateral", async function () {
      await (await deposit(signers.alice, 100)).wait();

      expect(await balanceOf(base, baseAddress, signers.alice)).to.equal(900n);
      expect(await collateralOf(vault, vaultAddress, signers.alice)).to.equal(100n);
      expect(await debtOf(vault, vaultAddress, signers.alice)).to.equal(0n);
    });
  });

  describe("borrow", function () {
    beforeEach(async function () {
      await (await deposit(signers.alice, 100)).wait();
    });

    it("pays out quote when the request fits under the LTV cap", async function () {
      const request = 100_000;
      await (await borrow(signers.alice, request)).wait();

      expect(await balanceOf(quote, quoteAddress, signers.alice)).to.equal(BigInt(request));
      expect(await debtOf(vault, vaultAddress, signers.alice)).to.equal(BigInt(request));
    });

    it("silently clamps to zero when the request exceeds the LTV cap", async function () {
      // maxBorrow = 100 * 3400 * 7500 / 10_000 = 255_000
      const overCap = 1_000_000;
      await (await borrow(signers.alice, overCap)).wait();

      expect(await balanceOf(quote, quoteAddress, signers.alice)).to.equal(0n);
      expect(await debtOf(vault, vaultAddress, signers.alice)).to.equal(0n);
    });
  });

  describe("withdraw", function () {
    beforeEach(async function () {
      await (await deposit(signers.alice, 100)).wait();
    });

    it("releases collateral when no debt blocks the withdrawal", async function () {
      await (await withdraw(signers.alice, 30)).wait();

      expect(await balanceOf(base, baseAddress, signers.alice)).to.equal(930n);
      expect(await collateralOf(vault, vaultAddress, signers.alice)).to.equal(70n);
    });

    it("silently clamps to zero when the resulting position would be unhealthy", async function () {
      await (await borrow(signers.alice, 250_000)).wait();
      // maxBorrow drops to 0 if all collateral is pulled; debt 250k > 0 → unhealthy → actual = 0
      await (await withdraw(signers.alice, 100)).wait();

      expect(await balanceOf(base, baseAddress, signers.alice)).to.equal(900n);
      expect(await collateralOf(vault, vaultAddress, signers.alice)).to.equal(100n);
    });
  });

  describe("repay", function () {
    it("reduces debt and pulls quote back from the borrower's wallet", async function () {
      await (await deposit(signers.alice, 100)).wait();
      await (await borrow(signers.alice, 100_000)).wait();

      await (await repay(signers.alice, 60_000)).wait();

      expect(await debtOf(vault, vaultAddress, signers.alice)).to.equal(40_000n);
      expect(await balanceOf(quote, quoteAddress, signers.alice)).to.equal(40_000n);
    });
  });

  describe("liquidate", function () {
    it("is a no-op when the borrower is healthy", async function () {
      await (await deposit(signers.alice, 100)).wait();
      await (await borrow(signers.alice, 100_000)).wait();

      await (await vault.connect(signers.keeper).liquidate(signers.alice.address)).wait();

      expect(await collateralOf(vault, vaultAddress, signers.alice)).to.equal(100n);
      expect(await debtOf(vault, vaultAddress, signers.alice)).to.equal(100_000n);
      expect(await balanceOf(base, baseAddress, signers.keeper)).to.equal(0n);
    });

    // The "unhealthy" branch is unreachable in this contract because `price` is
    // immutable and the borrow path clamps to maxBorrow. A future revision with
    // an oracle (or a setter for tests) would exercise the seize path.
    it.skip("seizes collateral when debt exceeds maxBorrow", async function () {});
  });

  describe("composition with VeilBatchAuctionV2", function () {
    const BATCH_BLOCKS = 30;
    const TICK_PRICE_0 = 100n;
    const TICK_STEP = 100n;
    const MAX_PRICE = TICK_PRICE_0 + 3n * TICK_STEP;

    let veil: VeilBatchAuctionV2;
    let veilAddress: string;

    beforeEach(async function () {
      const veilFactory = (await ethers.getContractFactory(
        "VeilBatchAuctionV2",
      )) as VeilBatchAuctionV2__factory;
      veil = (await veilFactory.deploy(
        BATCH_BLOCKS,
        baseAddress,
        quoteAddress,
        TICK_PRICE_0,
        TICK_STEP,
      )) as VeilBatchAuctionV2;
      veilAddress = await veil.getAddress();
    });

    async function placeOrderFromVault(
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
        .placeOrderFromVault(
          input.handles[0],
          input.handles[1],
          input.handles[2],
          input.inputProof,
          vaultAddress,
        );
    }

    async function placeOrder(
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

    it("routes a sell from vault collateral and credits the unfilled refund back into collateral", async function () {
      await mintTo(quote, quoteAddress, signers.bob, 1_000_000);

      await (await deposit(signers.alice, 200)).wait();
      await setOperator(vault, signers.alice, veilAddress);
      // _pullEscrow runs both transferFrom calls unconditionally; the sell-side
      // quote escrow is encrypted-zero but the token can't see that, so the
      // operator approval still has to exist.
      await setOperator(quote, signers.alice, veilAddress);

      await setOperator(quote, signers.bob, veilAddress);
      await setOperator(base, signers.bob, veilAddress);
      await (await veil.connect(signers.deployer).authorizeMarginVault(vaultAddress)).wait();

      await (await placeOrderFromVault(signers.alice, false, 0, 100)).wait();
      await (await placeOrder(signers.bob, true, 3, 50)).wait();

      await mineBlocks(BATCH_BLOCKS);
      await (await veil.connect(signers.deployer).closeBatch()).wait();
      // partial sell fill: bob takes 50 of alice's 100 at clearing tick 0
      await (await veil.connect(signers.deployer).submitClearing(1, 0, 0, 5000)).wait();

      await (await veil.connect(signers.alice).settle(1, 0)).wait();
      await (await veil.connect(signers.bob).settle(1, 1)).wait();

      // alice's wallet base unchanged since deposit (sell came from vault)
      expect(await balanceOf(base, baseAddress, signers.alice)).to.equal(800n);
      // 50 filled × clearingPrice 100 = 5_000 quote to alice's wallet
      expect(await balanceOf(quote, quoteAddress, signers.alice)).to.equal(50n * TICK_PRICE_0);
      // initial 200 − 100 escrowed + 50 unfilled refund = 150
      expect(await collateralOf(vault, vaultAddress, signers.alice)).to.equal(150n);

      expect(await balanceOf(base, baseAddress, signers.bob)).to.equal(50n);
      const escrowed = 50n * MAX_PRICE;
      const consumed = 50n * TICK_PRICE_0;
      expect(await balanceOf(quote, quoteAddress, signers.bob)).to.equal(
        1_000_000n - escrowed + (escrowed - consumed),
      );
    });

    it("reverts escrowToVeil if the user has not granted the operator", async function () {
      await (await deposit(signers.alice, 200)).wait();
      // intentionally skip vault.setOperator(veil)
      await setOperator(quote, signers.bob, veilAddress);
      await setOperator(base, signers.bob, veilAddress);
      await (await veil.connect(signers.deployer).authorizeMarginVault(vaultAddress)).wait();

      await expect(placeOrderFromVault(signers.alice, false, 0, 100)).to.be.revertedWith(
        "not operator",
      );
    });
  });
});
