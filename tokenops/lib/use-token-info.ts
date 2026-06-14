"use client";

import { useReadContracts } from "wagmi";
import type { Address } from "viem";

const ERC20_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export type TokenInfo = {
  address: Address;
  symbol: string;
  decimals: number;
  name: string;
};

export function useTokenInfo(token: Address | undefined): {
  data: TokenInfo | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const result = useReadContracts({
    contracts: token
      ? ([
          { address: token, abi: ERC20_ABI, functionName: "symbol" },
          { address: token, abi: ERC20_ABI, functionName: "decimals" },
          { address: token, abi: ERC20_ABI, functionName: "name" },
        ] as const)
      : [],
    query: { enabled: Boolean(token), staleTime: 60_000 },
  });

  const [symbolRes, decimalsRes, nameRes] = result.data ?? [];
  const allOk =
    symbolRes?.status === "success" && decimalsRes?.status === "success" && nameRes?.status === "success";

  return {
    data:
      token && allOk
        ? {
            address: token,
            symbol: symbolRes.result as string,
            decimals: decimalsRes.result as number,
            name: nameRes.result as string,
          }
        : undefined,
    isLoading: result.isLoading,
    error: (result.error as Error | null) ?? null,
  };
}
