"use client";

import { useMemo } from "react";
import { useBlockNumber, useReadContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { veilV2Abi } from "./abi-v2";
import { VEIL_V2_ADDRESS } from "./config";
import type { Book, Lifecycle, Phase } from "@/components/veil/orderbook";

const NUM_TICKS = 4;

export function useV2Lifecycle(): Lifecycle {
  const { data: blockNumber } = useBlockNumber({ watch: true, chainId: sepolia.id });
  const enabled = !!VEIL_V2_ADDRESS;

  const { data: batchIdRaw } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as `0x${string}`,
    abi: veilV2Abi,
    functionName: "currentBatchId",
    query: { enabled, refetchInterval: 8000 },
  });

  const { data: tickPrice0Raw } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as `0x${string}`,
    abi: veilV2Abi,
    functionName: "tickPrice0",
    query: { enabled },
  });

  const { data: tickStepRaw } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as `0x${string}`,
    abi: veilV2Abi,
    functionName: "tickStep",
    query: { enabled },
  });

  const batchId = batchIdRaw ? Number(batchIdRaw) : 1;

  const { data: stateTuple } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as `0x${string}`,
    abi: veilV2Abi,
    functionName: "getBatchState",
    args: batchIdRaw !== undefined ? [batchIdRaw] : undefined,
    query: { enabled: enabled && batchIdRaw !== undefined, refetchInterval: 4000 },
  });

  const { data: orderCountRaw } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as `0x${string}`,
    abi: veilV2Abi,
    functionName: "getOrderCount",
    args: batchIdRaw !== undefined ? [batchIdRaw] : undefined,
    query: { enabled: enabled && batchIdRaw !== undefined, refetchInterval: 4000 },
  });

  return useMemo(() => {
    const [, closeBlockBig, stateNumRaw, clearingTickRaw] = (stateTuple as
      | readonly [bigint, bigint, number, number]
      | undefined) ?? [0n, 0n, 0, 0];
    const closeBlock = closeBlockBig ?? 0n;
    const stateNum = Number(stateNumRaw ?? 0);
    const clearingTick = Number(clearingTickRaw ?? 0);

    const now = blockNumber ?? 0n;
    let phase: Phase;
    if (stateNum === 2) phase = "cleared";
    else if (stateNum === 1) phase = "clearing";
    else if (stateNum === 0 && now > 0n && now >= closeBlock) phase = "closing";
    else phase = "open";

    const blocksLeft =
      phase === "open" && closeBlock > 0n && now > 0n
        ? Math.max(0, Number(closeBlock - now))
        : 0;

    const p0 = Number(tickPrice0Raw ?? 3400n);
    const step = Number(tickStepRaw ?? 10n);
    const ticks = Array.from({ length: NUM_TICKS }, (_, idx) => ({
      idx,
      price: p0 + idx * step,
      buy: 0,
      sell: 0,
    }));

    const book: Book = {
      mid: p0 + Math.floor(NUM_TICKS / 2) * step,
      ticks,
      clearing: phase === "cleared" ? clearingTick : Math.floor(NUM_TICKS / 2),
      matched: 0,
    };

    return {
      batchId,
      book,
      phase,
      blocksLeft,
      orders: orderCountRaw ? Number(orderCountRaw) : 0,
      flash: null,
    };
  }, [stateTuple, blockNumber, batchId, orderCountRaw, tickPrice0Raw, tickStepRaw]);
}
