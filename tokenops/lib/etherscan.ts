const BASE = "https://sepolia.etherscan.io";

export function txUrl(hash: string | undefined): string | null {
  if (!hash) return null;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) return null;
  return `${BASE}/tx/${hash}`;
}

export function addrUrl(addr: string | undefined): string | null {
  if (!addr) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return null;
  return `${BASE}/address/${addr}`;
}

export function shortHash(hash: string | undefined, len = 6): string {
  if (!hash) return "";
  if (hash.length <= 2 + len * 2) return hash;
  return `${hash.slice(0, 2 + len)}…${hash.slice(-len)}`;
}
