import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, network } from "hardhat";
import { VeilBatchAuction, VeilBatchAuction__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
  carol: HardhatEthersSigner;
};

const BATCH_BLOCKS = 5;
const BPS_DENOM = 10_000;

async function deployFixture() {
  const factory = (await ethers.getContractFactory("VeilBatchAuction")) as VeilBatchAuction__factory;
  const veil = (await factory.deploy(BATCH_BLOCKS)) as VeilBatchAuction;
  const veilAddress = await veil.getAddress();
  return { veil, veilAddress };
}

async function placeOrder(
  veil: VeilBatchAuction,
  veilAddress: string,
  signer: HardhatEthersSigner,
  isBuy: boolean,
  tick: number,
  size: number,
): Promise<void> {
  const input = await fhevm
    .createEncryptedInput(veilAddress, signer.address)
    .addBool(isBuy)
    .add8(tick)
    .add64(size)
    .encrypt();
  const tx = await veil
    .connect(signer)
    .placeOrder(input.handles[0], input.handles[1], input.handles[2], input.inputProof);
  await tx.wait();
}

async function decryptFill(
  veil: VeilBatchAuction,
  veilAddress: string,
  batchId: number,
  orderIdx: number,
  trader: HardhatEthersSigner,
): Promise<bigint> {
  const handle = await veil.getOrderFill(batchId, orderIdx);
  return fhevm.userDecryptEuint(FhevmType.euint64, handle, veilAddress, trader);
}

async function mineBlocks(n: number) {
  for (let i = 0; i < n; i++) {
    await network.provider.send("evm_mine");
  }
}

describe("VeilBatchAuction", function () {
  let signers: Signers;
  let veil: VeilBatchAuction;
  let veilAddress: string;

  before(async function () {
    const eth = await ethers.getSigners();
    signers = { deployer: eth[0], alice: eth[1], bob: eth[2], carol: eth[3] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("VeilBatchAuction unit tests only run on the FHEVM mock environment");
      this.skip();
    }
    ({ veil, veilAddress } = await deployFixture());
  });

  describe("lifecycle", function () {
    it("opens batch 1 at construction", async function () {
      expect(await veil.currentBatchId()).to.eq(1);
      const [, , state] = await veil.getBatchState(1);
      expect(state).to.eq(0); // Open
    });

    it("accepts encrypted orders and accumulates per-tick aggregates", async function () {
      await placeOrder(veil, veilAddress, signers.alice, true, 2, 100);
      await placeOrder(veil, veilAddress, signers.bob, false, 1, 60);
      await placeOrder(veil, veilAddress, signers.carol, true, 2, 40);
      expect(await veil.getOrderCount(1)).to.eq(3);
    });

    it("opens a fresh batch after close", async function () {
      await placeOrder(veil, veilAddress, signers.alice, true, 1, 10);
      await mineBlocks(BATCH_BLOCKS + 1);
      await (await veil.closeBatch()).wait();
      expect(await veil.currentBatchId()).to.eq(2);
    });
  });

  describe("clearing — balanced (no pro-rata needed)", function () {
    it("fills crossing orders fully when supply == demand at clearing", async function () {
      // demand-at-or-above tick 2: 60 (alice)
      // supply-at-or-below tick 2: 60 (bob 30 @ 1 + deployer 30 @ 2)
      // carol's buy at tick 0 is below clearing, no fill
      await placeOrder(veil, veilAddress, signers.alice, true, 2, 60);
      await placeOrder(veil, veilAddress, signers.bob, false, 1, 30);
      await placeOrder(veil, veilAddress, signers.deployer, false, 2, 30);
      await placeOrder(veil, veilAddress, signers.carol, true, 0, 50);

      await mineBlocks(BATCH_BLOCKS + 1);
      await (await veil.closeBatch()).wait();

      // Balanced at clearing — both marginal sides fill in full.
      await (await veil.submitClearing(1, 2, BPS_DENOM, BPS_DENOM)).wait();

      const [, , state, clearingTick] = await veil.getBatchState(1);
      expect(state).to.eq(2);
      expect(clearingTick).to.eq(2);

      expect(await decryptFill(veil, veilAddress, 1, 0, signers.alice)).to.eq(60n);
      expect(await decryptFill(veil, veilAddress, 1, 1, signers.bob)).to.eq(30n);
      expect(await decryptFill(veil, veilAddress, 1, 2, signers.deployer)).to.eq(30n);
      expect(await decryptFill(veil, veilAddress, 1, 3, signers.carol)).to.eq(0n);
    });
  });

  describe("clearing — buy-side pro-rata", function () {
    it("partial-fills buyers at the marginal tick when demand exceeds supply at C", async function () {
      // demand-at-or-above tick 2: 140 (alice 100 @ 2 + carol 40 @ 2)
      // supply-at-or-below tick 2: 60  (bob only — deployer @ 3 is above C, won't fill)
      // matched = 60 — all sold to buyers at C, pro-rata across 140 of demand at C.
      // marginalBuyBps = floor(60 * 10000 / 140) = 4285
      await placeOrder(veil, veilAddress, signers.alice, true, 2, 100);
      await placeOrder(veil, veilAddress, signers.carol, true, 2, 40);
      await placeOrder(veil, veilAddress, signers.bob, false, 1, 60);
      await placeOrder(veil, veilAddress, signers.deployer, false, 3, 50);

      await mineBlocks(BATCH_BLOCKS + 1);
      await (await veil.closeBatch()).wait();

      // No supply at the marginal tick → sellMarginal ratio is irrelevant; pass 10000.
      await (await veil.submitClearing(1, 2, 4285, BPS_DENOM)).wait();

      // alice (buy @ 2): 100 * 4285 / 10000 = 42
      expect(await decryptFill(veil, veilAddress, 1, 0, signers.alice)).to.eq(42n);
      // carol (buy @ 2): 40 * 4285 / 10000 = 17
      expect(await decryptFill(veil, veilAddress, 1, 1, signers.carol)).to.eq(17n);
      // bob (sell @ 1): below C → full fill
      expect(await decryptFill(veil, veilAddress, 1, 2, signers.bob)).to.eq(60n);
      // deployer (sell @ 3): above C → no fill
      expect(await decryptFill(veil, veilAddress, 1, 3, signers.deployer)).to.eq(0n);
    });
  });

  describe("clearing — sell-side pro-rata", function () {
    it("partial-fills sellers at the marginal tick when supply exceeds demand at C", async function () {
      // demand-at-or-above tick 1: 50 (alice buy 50 @ 1)
      // supply-at-or-below tick 1: 120 (bob 80 @ 1 + carol 40 @ 1)
      // clearing tick = 1
      // strictly-above buys: 0; strictly-below sells: 0 (none below 1)
      // matched at C = 50, supplied by sellers at C totaling 120
      // marginalSellBps = floor(50 * 10000 / 120) = 4166
      await placeOrder(veil, veilAddress, signers.alice, true, 1, 50);
      await placeOrder(veil, veilAddress, signers.bob, false, 1, 80);
      await placeOrder(veil, veilAddress, signers.carol, false, 1, 40);

      await mineBlocks(BATCH_BLOCKS + 1);
      await (await veil.closeBatch()).wait();

      // alice fully fills at C → marginalBuyBps = 10000
      await (await veil.submitClearing(1, 1, BPS_DENOM, 4166)).wait();

      // alice (buy @ 1, marginal but at full ratio): 50
      expect(await decryptFill(veil, veilAddress, 1, 0, signers.alice)).to.eq(50n);
      // bob (sell @ 1, marginal pro-rata): 80 * 4166 / 10000 = 33
      expect(await decryptFill(veil, veilAddress, 1, 1, signers.bob)).to.eq(33n);
      // carol (sell @ 1, marginal pro-rata): 40 * 4166 / 10000 = 16
      expect(await decryptFill(veil, veilAddress, 1, 2, signers.carol)).to.eq(16n);
    });
  });

  describe("clearing — view + reverts", function () {
    it("getClearing returns tick + both marginal bps", async function () {
      await placeOrder(veil, veilAddress, signers.alice, true, 2, 10);
      await placeOrder(veil, veilAddress, signers.bob, false, 2, 10);
      await mineBlocks(BATCH_BLOCKS + 1);
      await (await veil.closeBatch()).wait();
      await (await veil.submitClearing(1, 2, 7500, 8000)).wait();
      const [tick, buyBps, sellBps] = await veil.getClearing(1);
      expect(tick).to.eq(2);
      expect(buyBps).to.eq(7500);
      expect(sellBps).to.eq(8000);
    });

    it("reverts on invalid clearing tick", async function () {
      await mineBlocks(BATCH_BLOCKS + 1);
      await (await veil.closeBatch()).wait();
      await expect(veil.submitClearing(1, 99, BPS_DENOM, BPS_DENOM)).to.be.revertedWithCustomError(
        veil,
        "InvalidClearingTick",
      );
    });

    it("reverts on bps > 10_000", async function () {
      await mineBlocks(BATCH_BLOCKS + 1);
      await (await veil.closeBatch()).wait();
      await expect(veil.submitClearing(1, 0, BPS_DENOM + 1, BPS_DENOM)).to.be.revertedWithCustomError(
        veil,
        "InvalidMarginalBps",
      );
    });

    it("reverts on double clearing", async function () {
      await mineBlocks(BATCH_BLOCKS + 1);
      await (await veil.closeBatch()).wait();
      await (await veil.submitClearing(1, 0, BPS_DENOM, BPS_DENOM)).wait();
      await expect(veil.submitClearing(1, 0, BPS_DENOM, BPS_DENOM)).to.be.revertedWithCustomError(
        veil,
        "BatchAlreadyCleared",
      );
    });
  });
});
