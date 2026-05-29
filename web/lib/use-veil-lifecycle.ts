"use client";

import { useMemo } from "react";
import { useBlockNumber, useReadContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { veilAbi } from "./abi";
import { VEIL_ADDRESS } from "./config";
import type { Book, Lifecycle, Phase } from "@/components/veil/orderbook";

const NUM_TICKS = 4;
const TICK_PRICES = [3418, 3419, 3420, 3421];

export function useVeilLifecycle(): Lifecycle {
  const { data: blockNumber } = useBlockNumber({ watch: true, chainId: sepolia.id });

  const { data: batchIdRaw } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_ADDRESS as `0x${string}`,
    abi: veilAbi,
    functionName: "currentBatchId",
    query: {
      enabled: !!VEIL_ADDRESS,
      refetchInterval: 8000,
    },
  });

  const batchId = batchIdRaw ? Number(batchIdRaw) : 1;

  const { data: stateTuple } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_ADDRESS as `0x${string}`,
    abi: veilAbi,
    functionName: "getBatchState",
    args: batchIdRaw !== undefined ? [batchIdRaw] : undefined,
    query: {
      enabled: batchIdRaw !== undefined,
      refetchInterval: 4000,
    },
  });

  const { data: orderCountRaw } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_ADDRESS as `0x${string}`,
    abi: veilAbi,
    functionName: "getOrderCount",
    args: batchIdRaw !== undefined ? [batchIdRaw] : undefined,
    query: {
      enabled: batchIdRaw !== undefined,
      refetchInterval: 4000,
    },
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

    const ticks = TICK_PRICES.map((price, idx) => ({
      idx,
      price,
      buy: 0,
      sell: 0,
    }));

    const book: Book = {
      mid: TICK_PRICES[Math.floor(NUM_TICKS / 2)],
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
  }, [stateTuple, blockNumber, batchId, orderCountRaw]);
}
