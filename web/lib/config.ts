import { sepolia } from "wagmi/chains";
import type { Address, Hex } from "viem";

export const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";

export const VEIL_ADDRESS = (process.env.NEXT_PUBLIC_VEIL_ADDRESS ?? "") as Address | "";

export const ACTIVE_CHAIN = sepolia;

/**
 * Zama hosts a relayer for Sepolia. Override via env if you self-host.
 * https://docs.zama.ai/protocol/protocol-apps/relayer
 */
export const ZAMA_RELAYER_URL_SEPOLIA =
  process.env.NEXT_PUBLIC_ZAMA_RELAYER_URL ?? "https://relayer.testnet.zama.cloud";

export function shortAddr(a?: Address | Hex | string): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function hasVeilDeployment(): boolean {
  return Boolean(VEIL_ADDRESS) && VEIL_ADDRESS.startsWith("0x") && VEIL_ADDRESS.length === 42;
}
