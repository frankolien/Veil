import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { computeClearing } from "./Veil";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

function stateLabel(s: bigint | number): string {
  const n = Number(s);
  return n === 0 ? "Open" : n === 1 ? "Closed" : n === 2 ? "Cleared" : `Unknown(${n})`;
}

async function getV2(hre: any) {
  const { ethers, deployments } = hre;
  const dep = await deployments.get("VeilBatchAuctionV2");
  const veil = await ethers.getContractAt("VeilBatchAuctionV2", dep.address);
  const baseDep = await deployments.get("VeilBase");
  const quoteDep = await deployments.get("VeilQuote");
  const base = await ethers.getContractAt("MockConfidentialToken", baseDep.address);
  const quote = await ethers.getContractAt("MockConfidentialToken", quoteDep.address);
  return {
    veilAddress: dep.address,
    veil,
    baseAddress: baseDep.address,
    base,
    quoteAddress: quoteDep.address,
    quote,
  };
}

task("task:veil-v2:address", "Prints the v2 deployment addresses").setAction(async (_: TaskArguments, hre) => {
  const { veilAddress, baseAddress, quoteAddress } = await getV2(hre);
  console.log("VeilBatchAuctionV2:", veilAddress);
  console.log("VeilBase (vWETH): ", baseAddress);
  console.log("VeilQuote (vUSDC):", quoteAddress);
});

task("task:veil-v2:faucet", "Mints demo balances of vWETH and vUSDC to an address")
  .addParam("to", "Recipient address")
  .addOptionalParam("base", "vWETH amount (default 1000)")
  .addOptionalParam("quote", "vUSDC amount (default 5_000_000)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const baseAmount = args.base ? Number(args.base) : 1000;
    const quoteAmount = args.quote ? Number(args.quote) : 5_000_000;
    const recipient = ethers.getAddress(args.to);

    const { base, baseAddress, quote, quoteAddress } = await getV2(hre);
    const [deployer] = await ethers.getSigners();

    const baseInput = await fhevm.createEncryptedInput(baseAddress, deployer.address).add64(baseAmount).encrypt();
    const qBase = await base.connect(deployer).mint(recipient, baseInput.handles[0], baseInput.inputProof);
    await qBase.wait();

    const quoteInput = await fhevm.createEncryptedInput(quoteAddress, deployer.address).add64(quoteAmount).encrypt();
    const qQuote = await quote.connect(deployer).mint(recipient, quoteInput.handles[0], quoteInput.inputProof);
    await qQuote.wait();

    console.log(`Minted ${baseAmount} vWETH and ${quoteAmount} vUSDC to ${recipient}`);
    console.log(`Reminder: trader must call setOperator on each token before placeOrder.`);
  });

task("task:veil-v2:status", "Prints the current V2 batch state")
  .addOptionalParam("batch", "Batch id (defaults to currentBatchId)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers } = hre;
    const { veilAddress, veil } = await getV2(hre);
    const currentBatchId: bigint = await veil.currentBatchId();
    const batchId = args.batch ? BigInt(args.batch) : currentBatchId;

    const [openBlock, closeBlock, state, clearingTick] = await veil.getBatchState(batchId);
    const orderCount: bigint = await veil.getOrderCount(batchId);
    const nowBlock = await ethers.provider.getBlockNumber();

    console.log("VeilBatchAuctionV2:", veilAddress);
    console.log("Current batchId:   ", currentBatchId.toString());
    console.log("Inspecting:        ", batchId.toString());
    console.log("State:             ", stateLabel(state));
    console.log("Open block:        ", openBlock.toString());
    console.log("Close block:       ", closeBlock.toString(), `(now: ${nowBlock})`);
    if (Number(state) === 0) {
      const left = Number(closeBlock) - nowBlock;
      console.log("Blocks left:       ", left > 0 ? left : 0);
    }
    console.log("Orders:            ", orderCount.toString());
    if (Number(state) === 2) {
      const [tick, buyBps, sellBps] = await veil.getClearing(batchId);
      console.log("Clearing tick:     ", Number(tick));
      console.log("Marginal buyBps:   ", Number(buyBps));
      console.log("Marginal sellBps:  ", Number(sellBps));
    }
  });

task("task:veil-v2:close", "Calls closeBatch() once the close block is reached").setAction(
  async (_: TaskArguments, hre) => {
    const { ethers } = hre;
    const { veil } = await getV2(hre);
    const [signer] = await ethers.getSigners();
    const tx = await veil.connect(signer).closeBatch();
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  },
);

task("task:veil-v2:clear", "Public-decrypts the V2 aggregates, computes clearing, calls submitClearing()")
  .addOptionalParam("batch", "Batch id (defaults to currentBatchId - 1)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const { veil } = await getV2(hre);
    const currentBatchId: bigint = await veil.currentBatchId();
    const batchId = args.batch ? BigInt(args.batch) : currentBatchId > 0n ? currentBatchId - 1n : 0n;

    const [, , state] = await veil.getBatchState(batchId);
    if (Number(state) !== 1) {
      console.log(`Batch ${batchId} state is ${stateLabel(state)}; clear requires Closed.`);
      return;
    }

    const NUM_TICKS: bigint = await veil.NUM_TICKS();
    const numTicks = Number(NUM_TICKS);
    console.log(`Reading ${numTicks} per-tick aggregate handles for batch ${batchId}...`);
    const buyVol: bigint[] = [];
    const sellVol: bigint[] = [];
    for (let t = 0; t < numTicks; t++) {
      const buyHandle: string = await veil.getBuyVolume(batchId, t);
      const sellHandle: string = await veil.getSellVolume(batchId, t);
      const buy = buyHandle === ZERO_HANDLE ? 0n : await fhevm.publicDecryptEuint(FhevmType.euint64, buyHandle);
      const sell = sellHandle === ZERO_HANDLE ? 0n : await fhevm.publicDecryptEuint(FhevmType.euint64, sellHandle);
      buyVol.push(buy);
      sellVol.push(sell);
      console.log(`  tick ${t}: buy=${buy.toString().padStart(6)} sell=${sell.toString().padStart(6)}`);
    }

    const clearing = computeClearing(buyVol, sellVol);
    console.log(
      `Clearing tick=${clearing.tick}  buyBps=${clearing.buyBps}  sellBps=${clearing.sellBps}  matched=${clearing.matched.toString()}`,
    );

    const [signer] = await ethers.getSigners();
    const tx = await veil
      .connect(signer)
      .submitClearing(batchId, clearing.tick, clearing.buyBps, clearing.sellBps);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:veil-v2:my-fill", "User-decrypts the filled size for an order in a cleared V2 batch")
  .addParam("batch", "Batch id")
  .addParam("idx", "Order index inside the batch")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const { veilAddress, veil } = await getV2(hre);
    const batchId = BigInt(args.batch);
    const idx = BigInt(args.idx);

    const orderCount: bigint = await veil.getOrderCount(batchId);
    if (idx >= orderCount) {
      console.log(`Batch ${batchId} has ${orderCount} orders; index ${idx} is out of range.`);
      return;
    }

    const trader: string = await veil.getOrderTrader(batchId, idx);
    const handle: string = await veil.getOrderFill(batchId, idx);
    console.log(`Order (${batchId}, ${idx}) trader=${trader} fillHandle=${handle}`);

    if (handle === ZERO_HANDLE) {
      console.log("Fill handle is zero — batch not yet cleared.");
      return;
    }

    const [signer] = await ethers.getSigners();
    if (signer.address.toLowerCase() !== trader.toLowerCase()) {
      console.log(`Warning: hardhat signer ${signer.address} != order trader ${trader}.`);
    }

    const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, veilAddress, signer);
    console.log(`Clear fill size: ${clear.toString()}`);
  });

task("task:veil-v2:settle", "Calls settle(batchId, orderIdx) as the deployer signer")
  .addParam("batch", "Batch id")
  .addParam("idx", "Order index inside the batch")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers } = hre;
    const { veil } = await getV2(hre);

    const batchId = BigInt(args.batch);
    const idx = BigInt(args.idx);
    const orderCount: bigint = await veil.getOrderCount(batchId);
    if (idx >= orderCount) {
      console.log(`Batch ${batchId} has ${orderCount} orders; index ${idx} is out of range.`);
      return;
    }

    const [signer] = await ethers.getSigners();
    const tx = await veil.connect(signer).settle(batchId, idx);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });
