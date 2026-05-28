import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

/**
 * Veil batch-auction lifecycle tasks.
 *
 * Typical Sepolia flow (assumes a deployment exists at deployments/sepolia/VeilBatchAuction.json):
 *
 *   npx hardhat --network sepolia task:veil:status
 *   npx hardhat --network sepolia task:veil:close          # once closeBlock is reached
 *   npx hardhat --network sepolia task:veil:clear          # decrypt aggregates + submitClearing
 *   npx hardhat --network sepolia task:veil:my-fill --batch 1 --idx 0
 */

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function getVeil(hre: any, addressOverride?: string) {
  const { ethers, deployments } = hre;
  const dep = addressOverride
    ? { address: addressOverride }
    : await deployments.get("VeilBatchAuction");
  const contract = await ethers.getContractAt("VeilBatchAuction", dep.address);
  return { address: dep.address, contract };
}

function stateLabel(s: bigint | number): string {
  const n = Number(s);
  return n === 0 ? "Open" : n === 1 ? "Closed" : n === 2 ? "Cleared" : `Unknown(${n})`;
}

task("task:veil:address", "Prints the VeilBatchAuction address").setAction(async (_: TaskArguments, hre) => {
  const { address } = await getVeil(hre);
  console.log("VeilBatchAuction:", address);
});

task("task:veil:status", "Prints the current Veil batch state")
  .addOptionalParam("address", "Override the deployed VeilBatchAuction address")
  .addOptionalParam("batch", "Batch id (defaults to currentBatchId)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers } = hre;
    const { address, contract } = await getVeil(hre, args.address);
    const currentBatchId: bigint = await contract.currentBatchId();
    const batchId = args.batch ? BigInt(args.batch) : currentBatchId;

    const [openBlock, closeBlock, state, clearingTick] = await contract.getBatchState(batchId);
    const orderCount: bigint = await contract.getOrderCount(batchId);
    const nowBlock = await ethers.provider.getBlockNumber();

    console.log("Veil:           ", address);
    console.log("Current batchId:", currentBatchId.toString());
    console.log("Inspecting:     ", batchId.toString());
    console.log("State:          ", stateLabel(state));
    console.log("Open block:     ", openBlock.toString());
    console.log("Close block:    ", closeBlock.toString(), `(now: ${nowBlock})`);
    if (Number(state) === 0) {
      const left = Number(closeBlock) - nowBlock;
      console.log("Blocks left:    ", left > 0 ? left : 0);
    }
    console.log("Orders:         ", orderCount.toString());
    if (Number(state) === 2) {
      const [tick, buyBps, sellBps] = await contract.getClearing(batchId);
      console.log("Clearing tick:  ", Number(tick));
      console.log("Marginal buyBps:", Number(buyBps));
      console.log("Marginal sellBps:", Number(sellBps));
    }
  });

task("task:veil:close", "Calls closeBatch() on the current batch (if its closeBlock is reached)")
  .addOptionalParam("address", "Override the deployed VeilBatchAuction address")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers } = hre;
    const { contract } = await getVeil(hre, args.address);
    const signers = await ethers.getSigners();
    const tx = await contract.connect(signers[0]).closeBatch();
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

/**
 * Computes the uniform-price clearing tick + the two pro-rata ratios.
 *
 *   Demand at tick c   = sum of buyVol[t] for t >= c   (buyers with price >= c fill)
 *   Supply at tick c   = sum of sellVol[t] for t <= c  (sellers with price <= c fill)
 *   Matched(c)         = min(Demand(c), Supply(c))
 *
 * Pick the c that maximises matched volume. At c, buys with tick>c fill in full,
 * sells with tick<c fill in full, and the side with excess at the marginal tick
 * gets pro-rata'd down. The other side at the marginal tick fills in full.
 *
 * The bps multipliers are rounded DOWN so aggregate fills never exceed the
 * matched volume.
 */
export function computeClearing(buyVol: bigint[], sellVol: bigint[]) {
  const NUM = buyVol.length;
  if (NUM !== sellVol.length) throw new Error("buyVol/sellVol length mismatch");
  const BPS = 10_000n;
  let best = { tick: 0, buyBps: 10_000, sellBps: 10_000, matched: 0n };
  for (let c = 0; c < NUM; c++) {
    let demandAbove = 0n;
    for (let t = c + 1; t < NUM; t++) demandAbove += buyVol[t];
    let supplyBelow = 0n;
    for (let t = 0; t < c; t++) supplyBelow += sellVol[t];
    const buyMargin = buyVol[c];
    const sellMargin = sellVol[c];
    const demandPossible = demandAbove + buyMargin;
    const supplyPossible = supplyBelow + sellMargin;
    const matched = demandPossible < supplyPossible ? demandPossible : supplyPossible;
    if (matched <= best.matched) continue;
    let buyBps = BPS;
    let sellBps = BPS;
    if (matched < demandPossible) {
      const need = matched - demandAbove;
      buyBps = buyMargin > 0n ? (need * BPS) / buyMargin : 0n;
    }
    if (matched < supplyPossible) {
      const need = matched - supplyBelow;
      sellBps = sellMargin > 0n ? (need * BPS) / sellMargin : 0n;
    }
    best = { tick: c, buyBps: Number(buyBps), sellBps: Number(sellBps), matched };
  }
  return best;
}

task("task:veil:clear", "Public-decrypts the per-tick aggregates, computes clearing, and calls submitClearing()")
  .addOptionalParam("address", "Override the deployed VeilBatchAuction address")
  .addOptionalParam("batch", "Batch id to clear (defaults to currentBatchId - 1, the most recently closed one)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const { contract } = await getVeil(hre, args.address);
    const currentBatchId: bigint = await contract.currentBatchId();
    const batchId = args.batch
      ? BigInt(args.batch)
      : currentBatchId > 0n
        ? currentBatchId - 1n
        : 0n;

    const [, , state] = await contract.getBatchState(batchId);
    const stateNum = Number(state);
    if (stateNum !== 1) {
      console.log(`Batch ${batchId} state is ${stateLabel(stateNum)}; clear requires Closed.`);
      return;
    }

    const NUM_TICKS: bigint = await contract.NUM_TICKS();
    const numTicks = Number(NUM_TICKS);
    console.log(`Reading ${numTicks} per-tick aggregate handles for batch ${batchId}...`);
    const buyVol: bigint[] = [];
    const sellVol: bigint[] = [];
    for (let t = 0; t < numTicks; t++) {
      const buyHandle: string = await contract.getBuyVolume(batchId, t);
      const sellHandle: string = await contract.getSellVolume(batchId, t);
      const buy = buyHandle === ZERO_HANDLE ? 0n : await fhevm.publicDecryptEuint(FhevmType.euint64, buyHandle);
      const sell = sellHandle === ZERO_HANDLE ? 0n : await fhevm.publicDecryptEuint(FhevmType.euint64, sellHandle);
      buyVol.push(buy);
      sellVol.push(sell);
      console.log(`  tick ${t}: buy=${buy.toString().padStart(6)} sell=${sell.toString().padStart(6)}`);
    }

    const clearing = computeClearing(buyVol, sellVol);
    console.log(`Clearing tick=${clearing.tick}  buyBps=${clearing.buyBps}  sellBps=${clearing.sellBps}  matched=${clearing.matched.toString()}`);

    const signers = await ethers.getSigners();
    const tx = await contract
      .connect(signers[0])
      .submitClearing(batchId, clearing.tick, clearing.buyBps, clearing.sellBps);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:veil:my-fill", "User-decrypts your filled size for a given order in a cleared batch")
  .addOptionalParam("address", "Override the deployed VeilBatchAuction address")
  .addParam("batch", "Batch id")
  .addParam("idx", "Order index inside the batch")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const { address, contract } = await getVeil(hre, args.address);
    const batchId = BigInt(args.batch);
    const idx = BigInt(args.idx);

    const trader: string = await contract.getOrderTrader(batchId, idx);
    const handle: string = await contract.getOrderFill(batchId, idx);
    console.log(`Order (${batchId}, ${idx}) trader=${trader} fillHandle=${handle}`);

    if (handle === ZERO_HANDLE) {
      console.log("Fill handle is zero — batch not yet cleared.");
      return;
    }

    const signers = await ethers.getSigners();
    const signer = signers[0];
    if (signer.address.toLowerCase() !== trader.toLowerCase()) {
      console.log(`Warning: hardhat signer ${signer.address} != order trader ${trader}.`);
      console.log("Only the order's trader has FHE.allow() permission to decrypt this fill.");
    }

    const clear = await fhevm.userDecryptEuint(FhevmType.euint64, handle, address, signer);
    console.log(`Clear fill size: ${clear.toString()}`);
  });
