import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { computeClearing } from "./Veil";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ctx(hre: any) {
  const { ethers, deployments } = hre;
  const v2 = await deployments.get("VeilBatchAuctionV2");
  const vault = await deployments.get("VeilLendingVault");
  const veil = await ethers.getContractAt("VeilBatchAuctionV2", v2.address);
  const vaultC = await ethers.getContractAt("VeilLendingVault", vault.address);
  return { veil, vault: vaultC, veilAddress: v2.address, vaultAddress: vault.address };
}

async function tickV2(hre: any, veil: any, signer: any): Promise<void> {
  const { fhevm, ethers } = hre;
  const batchId: bigint = await veil.currentBatchId();
  const [, closeBlock, state] = await veil.getBatchState(batchId);
  const now = await ethers.provider.getBlockNumber();

  if (Number(state) === 0 && now >= Number(closeBlock)) {
    console.log(`[v2] closing batch ${batchId} (close=${closeBlock} now=${now})`);
    const tx = await veil.connect(signer).closeBatch();
    await tx.wait();
    console.log(`[v2] closed: ${tx.hash}`);
  }

  const prevBatchId = batchId > 0n ? batchId - 1n : 0n;
  if (prevBatchId === 0n) return;
  const [, , prevState] = await veil.getBatchState(prevBatchId);
  if (Number(prevState) !== 1) return;

  console.log(`[v2] clearing batch ${prevBatchId}`);
  const NUM_TICKS = Number(await veil.NUM_TICKS());
  const buyVol: bigint[] = [];
  const sellVol: bigint[] = [];
  for (let t = 0; t < NUM_TICKS; t++) {
    const bh: string = await veil.getBuyVolume(prevBatchId, t);
    const sh: string = await veil.getSellVolume(prevBatchId, t);
    const b = bh === ZERO_HANDLE ? 0n : await fhevm.publicDecryptEuint(FhevmType.euint64, bh);
    const s = sh === ZERO_HANDLE ? 0n : await fhevm.publicDecryptEuint(FhevmType.euint64, sh);
    buyVol.push(b);
    sellVol.push(s);
  }
  const c = computeClearing(buyVol, sellVol);
  const tx = await veil.connect(signer).submitClearing(prevBatchId, c.tick, c.buyBps, c.sellBps);
  await tx.wait();
  console.log(`[v2] cleared batch ${prevBatchId} tick=${c.tick} matched=${c.matched}: ${tx.hash}`);
}

async function tickLiquidations(
  hre: any,
  vault: any,
  vaultAddress: string,
  signer: any,
  fromBlock: bigint,
  borrowers: Set<string>,
): Promise<bigint> {
  const { ethers } = hre;
  const latest = BigInt(await ethers.provider.getBlockNumber());
  if (fromBlock > latest) return fromBlock;

  const opened = await vault.queryFilter(vault.filters.PositionOpened(), Number(fromBlock), Number(latest));
  for (const ev of opened) {
    borrowers.add(ev.args.user.toLowerCase());
  }
  if (opened.length > 0) console.log(`[vault] discovered ${opened.length} new borrowers (total=${borrowers.size})`);

  for (const b of borrowers) {
    try {
      const tx = await vault.connect(signer).liquidate(b);
      await tx.wait();
      console.log(`[vault] liquidate(${b}) tx=${tx.hash}`);
    } catch (e: any) {
      console.log(`[vault] liquidate(${b}) skipped: ${e.shortMessage ?? e.message}`);
    }
  }
  return latest + 1n;
}

task("task:keeper:run", "Long-running keeper: closes/clears V2 batches and runs liquidations")
  .addOptionalParam("intervalMs", "Poll interval (default 12000)")
  .addOptionalParam("liquidate", "Run liquidation pass each tick (default false)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const interval = Number(args.intervalMs ?? 12_000);
    const runLiquidate = args.liquidate === "true";
    const { veil, vault, veilAddress, vaultAddress } = await ctx(hre);
    const [signer] = await ethers.getSigners();
    console.log(`Keeper online. signer=${signer.address}`);
    console.log(`  VeilBatchAuctionV2: ${veilAddress}`);
    console.log(`  VeilLendingVault:   ${vaultAddress}`);
    console.log(`  poll=${interval}ms liquidate=${runLiquidate}`);

    const borrowers = new Set<string>();
    let nextLogBlock = 0n;

    for (;;) {
      try {
        await tickV2(hre, veil, signer);
      } catch (e: any) {
        console.log(`[v2] tick error: ${e.shortMessage ?? e.message}`);
      }
      if (runLiquidate) {
        try {
          nextLogBlock = await tickLiquidations(hre, vault, vaultAddress, signer, nextLogBlock, borrowers);
        } catch (e: any) {
          console.log(`[vault] tick error: ${e.shortMessage ?? e.message}`);
        }
      }
      await sleep(interval);
    }
  });

task("task:keeper:tick", "Run one keeper tick and exit (close+clear V2, optional liquidate)")
  .addOptionalParam("liquidate", "Run liquidation pass once (default false)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const runLiquidate = args.liquidate === "true";
    const { veil, vault, vaultAddress } = await ctx(hre);
    const [signer] = await ethers.getSigners();
    await tickV2(hre, veil, signer);
    if (runLiquidate) {
      const borrowers = new Set<string>();
      await tickLiquidations(hre, vault, vaultAddress, signer, 0n, borrowers);
    }
    console.log("Tick complete.");
  });
