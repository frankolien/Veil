"use client";

import { useEffect, useMemo, useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { sepolia } from "wagmi/chains";
import { usePublicDecrypt } from "@zama-fhe/react-sdk";
import type { Address } from "viem";
import { veilV2Abi } from "@/lib/abi-v2";
import { VEIL_V2_ADDRESS } from "@/lib/config";

const NUM_TICKS = 4;
const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function LastClearedPanel({ currentBatchId }: { currentBatchId: number }) {
  const prevBatchId = currentBatchId > 1 ? BigInt(currentBatchId - 1) : undefined;
  const enabled = prevBatchId !== undefined && !!VEIL_V2_ADDRESS;

  const { data: stateTuple } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as Address,
    abi: veilV2Abi,
    functionName: "getBatchState",
    args: prevBatchId !== undefined ? [prevBatchId] : undefined,
    query: { enabled, refetchInterval: 10_000 },
  });

  const { data: tickPrice0Raw } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as Address,
    abi: veilV2Abi,
    functionName: "tickPrice0",
    query: { enabled },
  });
  const { data: tickStepRaw } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as Address,
    abi: veilV2Abi,
    functionName: "tickStep",
    query: { enabled },
  });

  const stateNum = stateTuple ? Number(stateTuple[2]) : 0;
  const clearingTick = stateTuple ? Number(stateTuple[3]) : 0;
  const isCleared = stateNum === 2;

  const handleCalls = useMemo(() => {
    if (!enabled || prevBatchId === undefined) return [];
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
  }, [enabled, prevBatchId]);

  const { data: handles } = useReadContracts({
    contracts: handleCalls,
    query: { enabled: enabled && stateNum >= 1, refetchInterval: 12_000 },
  });

  const decrypt = usePublicDecrypt();

  const handleList = useMemo<`0x${string}`[]>(() => {
    if (!handles) return [];
    return handles
      .map((r) => r.result as `0x${string}` | undefined)
      .filter((h): h is `0x${string}` => !!h && h !== ZERO_HANDLE);
  }, [handles]);

  const [aggregates, setAggregates] = useState<{ buy: number; sell: number }[]>(
    Array.from({ length: NUM_TICKS }, () => ({ buy: 0, sell: 0 })),
  );
  const [lastDecryptedFor, setLastDecryptedFor] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || prevBatchId === undefined) return;
    if (stateNum < 1) return;
    if (handleList.length === 0) {
      setAggregates(Array.from({ length: NUM_TICKS }, () => ({ buy: 0, sell: 0 })));
      setLastDecryptedFor(Number(prevBatchId));
      return;
    }
    if (lastDecryptedFor === Number(prevBatchId)) return;
    if (decrypt.isPending) return;
    decrypt.mutate(handleList, {
      onSuccess: (result) => {
        if (!handles) return;
        const next = Array.from({ length: NUM_TICKS }, () => ({ buy: 0, sell: 0 }));
        for (let t = 0; t < NUM_TICKS; t++) {
          const buyHandle = handles[t * 2]?.result as `0x${string}` | undefined;
          const sellHandle = handles[t * 2 + 1]?.result as `0x${string}` | undefined;
          const buy = buyHandle && buyHandle !== ZERO_HANDLE ? result.clearValues[buyHandle] : 0n;
          const sell = sellHandle && sellHandle !== ZERO_HANDLE ? result.clearValues[sellHandle] : 0n;
          next[t] = { buy: Number(buy ?? 0), sell: Number(sell ?? 0) };
        }
        setAggregates(next);
        setLastDecryptedFor(Number(prevBatchId));
      },
      onError: (err) => {
        console.warn("publicDecrypt for last cleared failed", err);
      },
    });
  }, [enabled, prevBatchId, stateNum, handleList, decrypt, handles, lastDecryptedFor]);

  if (!enabled || prevBatchId === undefined) return null;

  const p0 = Number(tickPrice0Raw ?? 3400n);
  const step = Number(tickStepRaw ?? 10n);
  const totalBuy = aggregates.reduce((a, t) => a + t.buy, 0);
  const totalSell = aggregates.reduce((a, t) => a + t.sell, 0);

  const stateLabel = stateNum === 2 ? "Cleared" : stateNum === 1 ? "Closed" : "Open";

  return (
    <div className="veil-panel p-[18px]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-[var(--font-mono)] text-[10.5px] tracking-[0.2em] text-[var(--faint)]">
            LAST BATCH
          </span>
          <span className="font-[var(--font-mono)] text-[18px] text-[var(--text)]">
            #{Number(prevBatchId)}
          </span>
        </div>
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--dim)]">
          {stateLabel}
          {isCleared ? ` · @ ${(p0 + clearingTick * step).toLocaleString()}` : ""}
        </span>
      </div>
      {decrypt.isPending && (
        <div className="text-[11px] text-[var(--faint)] font-[var(--font-mono)] mb-2">
          Public-decrypting aggregates via the KMS…
        </div>
      )}
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-1.5 items-center font-[var(--font-mono)] text-[12px]">
        <span className="text-[var(--faint)] uppercase tracking-[0.1em] text-[10px]">Tick</span>
        <span className="text-[var(--faint)] uppercase tracking-[0.1em] text-[10px]">Price</span>
        <span className="text-[var(--buy)] uppercase tracking-[0.1em] text-[10px] text-right">Buy</span>
        <span className="text-[var(--sell)] uppercase tracking-[0.1em] text-[10px] text-right">Sell</span>
        {aggregates.map((row, t) => (
          <FragmentRow
            key={t}
            tick={t}
            price={p0 + t * step}
            buy={row.buy}
            sell={row.sell}
            clearing={isCleared && t === clearingTick}
          />
        ))}
        <span className="text-[var(--faint)]">total</span>
        <span></span>
        <span className="text-[var(--buy)] text-right tabular-nums">{totalBuy.toLocaleString()}</span>
        <span className="text-[var(--sell)] text-right tabular-nums">{totalSell.toLocaleString()}</span>
      </div>
    </div>
  );
}

function FragmentRow({
  tick,
  price,
  buy,
  sell,
  clearing,
}: {
  tick: number;
  price: number;
  buy: number;
  sell: number;
  clearing: boolean;
}) {
  return (
    <>
      <span className={clearing ? "text-[var(--accent)]" : "text-[var(--dim)]"}>{tick}</span>
      <span className={clearing ? "text-[var(--accent)]" : "text-[var(--text)]"}>{price.toLocaleString()}</span>
      <span className="text-[var(--buy)] text-right tabular-nums">{buy.toLocaleString()}</span>
      <span className="text-[var(--sell)] text-right tabular-nums">{sell.toLocaleString()}</span>
    </>
  );
}
