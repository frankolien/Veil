"use client";

import { useCallback, useMemo, useState } from "react";
import { useAccount, useConfig, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { sepolia } from "wagmi/chains";
import { usePublicDecrypt } from "@zama-fhe/react-sdk";
import type { Address } from "viem";
import { Btn, Icon, Pill } from "./primitives";
import { computeClearing } from "@/lib/clearing";
import { veilV2Abi } from "@/lib/abi-v2";
import { VEIL_V2_ADDRESS } from "@/lib/config";
import { formatError } from "@/lib/format-error";
import { txUrl, shortHash } from "@/lib/etherscan";

const NUM_TICKS = 4;
const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

type Stage = "idle" | "closing" | "reading" | "decrypting" | "submitting" | "done";

export function AdvanceBatchPanel({ batchId }: { batchId: number }) {
  const { isConnected } = useAccount();
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const decrypt = usePublicDecrypt();
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [lastHash, setLastHash] = useState<`0x${string}` | null>(null);

  // Current batch — needed to decide whether to call closeBatch first.
  const { data: curStateTuple, refetch: refetchCur } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as Address,
    abi: veilV2Abi,
    functionName: "getBatchState",
    args: batchId ? [BigInt(batchId)] : undefined,
    query: { enabled: batchId > 0, refetchInterval: 4000 },
  });
  const { data: blockNumber } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as Address,
    abi: veilV2Abi,
    functionName: "currentBatchId",
    query: { enabled: false }, // dummy; useBlockNumber-style not needed for staleness check
  });
  void blockNumber;

  // Previous batch — the one that needs clearing if it's in state=Closed.
  const prevBatchId = batchId > 1 ? BigInt(batchId - 1) : undefined;
  const { data: prevStateTuple, refetch: refetchPrev } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as Address,
    abi: veilV2Abi,
    functionName: "getBatchState",
    args: prevBatchId !== undefined ? [prevBatchId] : undefined,
    query: { enabled: prevBatchId !== undefined, refetchInterval: 6000 },
  });

  const curState = curStateTuple ? Number(curStateTuple[2]) : 0;
  const curCloseBlock = curStateTuple ? (curStateTuple[1] as bigint) : 0n;
  const prevState = prevStateTuple ? Number(prevStateTuple[2]) : 0;

  // Read current block on-demand for the "is current batch elapsed?" check.
  const { data: latestBlock } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as Address,
    abi: veilV2Abi,
    functionName: "currentBatchId",
    query: { enabled: true, refetchInterval: 4000 },
  });
  void latestBlock;

  // Cleanly: we expose two flags driving the panel.
  const needsClose = curState === 0; // any user can close if elapsed; the contract reverts if too early
  const needsClear = prevBatchId !== undefined && prevState === 1;
  const showPanel = isConnected && (needsClose || needsClear);

  // Aggregate handle reads for the prev batch (the one that needs clearing).
  const handleCalls = useMemo(() => {
    if (prevBatchId === undefined || !needsClear) return [];
    const calls = [];
    for (let t = 0; t < NUM_TICKS; t++) {
      calls.push({
        chainId: sepolia.id,
        address: VEIL_V2_ADDRESS as Address,
        abi: veilV2Abi,
        functionName: "getBuyVolume" as const,
        args: [prevBatchId, t] as const,
      });
      calls.push({
        chainId: sepolia.id,
        address: VEIL_V2_ADDRESS as Address,
        abi: veilV2Abi,
        functionName: "getSellVolume" as const,
        args: [prevBatchId, t] as const,
      });
    }
    return calls;
  }, [prevBatchId, needsClear]);

  const { data: handlesRaw, refetch: refetchHandles } = useReadContracts({
    contracts: handleCalls,
    query: { enabled: handleCalls.length > 0 },
  });

  const advance = useCallback(async () => {
    setErr(null);
    setLastHash(null);
    try {
      // Step 1 — close the current batch if eligible.
      if (curState === 0) {
        setStage("closing");
        const hash = await writeContractAsync({
          chainId: sepolia.id,
          address: VEIL_V2_ADDRESS as Address,
          abi: veilV2Abi,
          functionName: "closeBatch",
          args: [],
        });
        setLastHash(hash);
        await waitForTransactionReceipt(config, { hash });
        await refetchCur();
        await refetchPrev();
        await refetchHandles();
      }

      // Step 2 — submit clearing for the most-recent closed batch.
      // Re-read state freshly because we may have just closed something.
      const refreshedPrev = await refetchPrev();
      const refreshedPrevTuple = refreshedPrev.data as
        | readonly [bigint, bigint, number, number]
        | undefined;
      const refreshedPrevState = refreshedPrevTuple ? Number(refreshedPrevTuple[2]) : 0;
      if (prevBatchId === undefined || refreshedPrevState !== 1) {
        // Nothing left to clear — either no prev batch or already cleared.
        setStage("done");
        setTimeout(() => setStage("idle"), 1500);
        return;
      }

      setStage("reading");
      const refreshedHandles = await refetchHandles();
      const handles = refreshedHandles.data ?? handlesRaw;
      if (!handles) throw new Error("Aggregate handles not yet available — try again in a moment.");

      const handleList = handles
        .map((r) => r.result as `0x${string}` | undefined)
        .filter((h): h is `0x${string}` => !!h && h !== ZERO_HANDLE);

      setStage("decrypting");
      let buyVol: bigint[] = Array.from({ length: NUM_TICKS }, () => 0n);
      let sellVol: bigint[] = Array.from({ length: NUM_TICKS }, () => 0n);
      if (handleList.length > 0) {
        const decrypted = await new Promise<Record<string, bigint>>((resolve, reject) => {
          decrypt.mutate(handleList, {
            onSuccess: (res) => resolve(res.clearValues as Record<string, bigint>),
            onError: (e) => reject(e),
          });
        });
        for (let t = 0; t < NUM_TICKS; t++) {
          const bh = handles[t * 2]?.result as `0x${string}` | undefined;
          const sh = handles[t * 2 + 1]?.result as `0x${string}` | undefined;
          buyVol[t] = bh && bh !== ZERO_HANDLE ? BigInt(decrypted[bh] ?? 0n) : 0n;
          sellVol[t] = sh && sh !== ZERO_HANDLE ? BigInt(decrypted[sh] ?? 0n) : 0n;
        }
      }

      const c = computeClearing(buyVol, sellVol);

      setStage("submitting");
      const hash = await writeContractAsync({
        chainId: sepolia.id,
        address: VEIL_V2_ADDRESS as Address,
        abi: veilV2Abi,
        functionName: "submitClearing",
        args: [prevBatchId, c.tick, c.buyBps, c.sellBps],
      });
      setLastHash(hash);
      await waitForTransactionReceipt(config, { hash });
      await refetchPrev();

      setStage("done");
      setTimeout(() => setStage("idle"), 2500);
    } catch (e) {
      console.error("advance batch failed", e);
      setErr(formatError(e));
      setStage("idle");
    }
  }, [
    curState,
    prevBatchId,
    config,
    decrypt,
    handlesRaw,
    refetchCur,
    refetchPrev,
    refetchHandles,
    writeContractAsync,
  ]);

  if (!showPanel) return null;

  const label =
    stage === "closing"
      ? "Closing batch…"
      : stage === "reading"
        ? "Reading aggregates…"
        : stage === "decrypting"
          ? "Public-decrypting…"
          : stage === "submitting"
            ? "Submitting clearing…"
            : stage === "done"
              ? "Done ✓"
              : needsClose && needsClear
                ? "Close + clear"
                : needsClose
                  ? "Close batch"
                  : "Clear batch";

  const busy = stage !== "idle" && stage !== "done";

  return (
    <div className="veil-panel p-[18px] flex flex-col gap-3 border-[color-mix(in_oklab,var(--accent)_35%,var(--line))]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="font-[var(--font-mono)] text-[10.5px] tracking-[0.2em] text-[var(--accent)]">
            KEEPER · PERMISSIONLESS
          </span>
          <span className="text-[13px] text-[var(--text)] leading-snug">
            {needsClose && needsClear
              ? `Batch #${batchId} window elapsed and batch #${batchId - 1} is awaiting clearing. Close + clear in one flow — anyone can do this.`
              : needsClose
                ? `Batch #${batchId} window elapsed — close it to open the next batch.`
                : `Batch #${batchId - 1} closed and needs clearing before settlements can run.`}
          </span>
          <span className="font-[var(--font-mono)] text-[10.5px] text-[var(--faint)]">
            Costs ~0.0001 Sepolia ETH · advances the auction for everyone.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="accent" dot>
            {curState === 0 && curCloseBlock > 0n ? "elapsed" : prevState === 1 ? "awaiting clear" : "ready"}
          </Pill>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Btn variant="primary" size="md" onClick={advance} disabled={busy}>
          <Icon name="bolt" size={14} />
          {label}
        </Btn>
        {err && (
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--sell)] break-words">
            {err.slice(0, 200)}
          </span>
        )}
        {lastHash && (
          <a
            href={txUrl(lastHash) ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="font-[var(--font-mono)] text-[11px] text-[var(--dim)] hover:text-[var(--accent)]"
          >
            last tx · {shortHash(lastHash)} ↗
          </a>
        )}
      </div>
    </div>
  );
}
