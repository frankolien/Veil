import { sepolia } from "wagmi/chains";
import type { Address, Hex } from "viem";

export const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";

/**
 * Confidential ERC-7984 token to disperse. Default points at Zama's cUSDC mock
 * on Sepolia (override in .env.local). Any ERC-7984 from the Confidential
 * Wrappers Registry works.
 */
export const DISPERSE_TOKEN = (process.env.NEXT_PUBLIC_DISPERSE_TOKEN ?? "") as Address | "";

export const ACTIVE_CHAIN = sepolia;

export const ZAMA_RELAYER_URL_SEPOLIA =
  process.env.NEXT_PUBLIC_ZAMA_RELAYER_URL ?? "https://relayer.testnet.zama.cloud";

export function shortAddr(a?: Address | Hex | string): string {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function hasToken(): boolean {
  return Boolean(DISPERSE_TOKEN) && DISPERSE_TOKEN.startsWith("0x") && DISPERSE_TOKEN.length === 42;
}
