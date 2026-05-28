import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, network } from "hardhat";
import { VeilBatchAuction, VeilBatchAuction__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner; // buyer
  bob: HardhatEthersSigner; // seller
  carol: HardhatEthersSigner; // marginal buyer
};

const BATCH_BLOCKS = 5;

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

  it("opens batch 1 at construction", async function () {
    expect(await veil.currentBatchId()).to.eq(1);
    const [, , state] = await veil.getBatchState(1);
    expect(state).to.eq(0); // Open
  });

  it("accepts encrypted orders and accumulates per-tick aggregates", async function () {
    // alice buys 100 at tick 2
    await placeOrder(veil, veilAddress, signers.alice, true, 2, 100);
    // bob sells 60 at tick 1
    await placeOrder(veil, veilAddress, signers.bob, false, 1, 60);
    // carol buys 40 at tick 2
    await placeOrder(veil, veilAddress, signers.carol, true, 2, 40);

    expect(await veil.getOrderCount(1)).to.eq(3);
  });

  it("closes batch, publishes aggregates, accepts clearing, and fills crossing orders", async function () {
    // Order book:
    //   buy  100 @ tick 2 (alice)
    //   sell  60 @ tick 1 (bob)
    //   buy   40 @ tick 2 (carol)
    //   sell  50 @ tick 3 (deployer) - won't cross
    await placeOrder(veil, veilAddress, signers.alice, true, 2, 100);
    await placeOrder(veil, veilAddress, signers.bob, false, 1, 60);
    await placeOrder(veil, veilAddress, signers.carol, true, 2, 40);
    await placeOrder(veil, veilAddress, signers.deployer, false, 3, 50);

    await mineBlocks(BATCH_BLOCKS + 1);
    await (await veil.closeBatch()).wait();

    const [, , stateClosed] = await veil.getBatchState(1);
    expect(stateClosed).to.eq(1); // Closed

    // Off-chain: a solver would decrypt aggregates and compute the clearing tick.
    // For this test we set clearingTick = 2 (highest price at which buy demand 140
    // exceeds remaining sell supply 60 from below).
    await (await veil.submitClearing(1, 2)).wait();

    const [, , stateCleared, clearingTick] = await veil.getBatchState(1);
    expect(stateCleared).to.eq(2);
    expect(clearingTick).to.eq(2);

    // Alice (buy @2) fills, Carol (buy @2) fills, Bob (sell @1) fills, deployer (sell @3) does not.
    const aliceFillHandle = await veil.getOrderFill(1, 0);
    const aliceFill = await fhevm.userDecryptEuint(FhevmType.euint64, aliceFillHandle, veilAddress, signers.alice);
    expect(aliceFill).to.eq(100n);

    const bobFillHandle = await veil.getOrderFill(1, 1);
    const bobFill = await fhevm.userDecryptEuint(FhevmType.euint64, bobFillHandle, veilAddress, signers.bob);
    expect(bobFill).to.eq(60n);

    const carolFillHandle = await veil.getOrderFill(1, 2);
    const carolFill = await fhevm.userDecryptEuint(FhevmType.euint64, carolFillHandle, veilAddress, signers.carol);
    expect(carolFill).to.eq(40n);

    const deployerFillHandle = await veil.getOrderFill(1, 3);
    const deployerFill = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      deployerFillHandle,
      veilAddress,
      signers.deployer,
    );
    expect(deployerFill).to.eq(0n);
  });

  it("opens a fresh batch after close", async function () {
    await placeOrder(veil, veilAddress, signers.alice, true, 1, 10);
    await mineBlocks(BATCH_BLOCKS + 1);
    await (await veil.closeBatch()).wait();
    expect(await veil.currentBatchId()).to.eq(2);
  });
});
