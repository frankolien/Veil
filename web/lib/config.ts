import { sepolia } from "wagmi/chains";
import type { Address, Hex } from "viem";

// Optional overrides — when unset, the Zama SDK's canonical `SepoliaConfig`
// supplies the right values (RPC + relayer URL + protocol contract addresses).
// Set these env vars only if you want to point at a custom RPC or self-hosted relayer.
export const SEPOLIA_RPC_OVERRIDE = process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "";
export const ZAMA_RELAYER_URL_OVERRIDE = process.env.NEXT_PUBLIC_ZAMA_RELAYER_URL ?? "";

// Public fallback RPC used by wagmi (separate from the relayer's RPC channel).
export const SEPOLIA_RPC = SEPOLIA_RPC_OVERRIDE || "https://ethereum-sepolia-rpc.publicnode.com";

export const VEIL_ADDRESS = (process.env.NEXT_PUBLIC_VEIL_ADDRESS ?? "") as Address | "";

export const ACTIVE_CHAIN = sepolia;

export function shortAddr(a?: Address | Hex | string): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function hasVeilDeployment(): boolean {
  return Boolean(VEIL_ADDRESS) && VEIL_ADDRESS.startsWith("0x") && VEIL_ADDRESS.length === 42;
}
