import { parseUnits } from "viem";

export type ParsedAmount = { raw: bigint; display: string };

/**
 * Parse a user-typed amount into raw token units. Accepts decimals
 * ("1.5", "0.001"), an optional trailing symbol ("1.5 USDC"), and bare
 * underscores as thousands separators ("1_000_000"). Rejects negative or
 * over-precise values.
 */
export function parseAmount(input: string, decimals: number, symbol?: string): ParsedAmount {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("empty");

  // strip a trailing symbol token like "USDC" — only if it matches the
  // active token's symbol (when provided) or any pure-alpha trailing word.
  const symMatch = trimmed.match(/^(.*?)(?:\s+([A-Za-z][A-Za-z0-9]*))?$/);
  const numericPart = (symMatch?.[1] ?? trimmed).trim();
  const trailingSym = symMatch?.[2]?.toUpperCase();
  if (symbol && trailingSym && trailingSym !== symbol.toUpperCase()) {
    throw new Error(`expected ${symbol}, got ${trailingSym}`);
  }

  const cleaned = numericPart.replace(/_/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) {
    throw new Error("not a number");
  }

  const [intPart, fracPart = ""] = cleaned.split(".");
  if (fracPart.length > decimals) {
    throw new Error(`too many decimals (max ${decimals})`);
  }

  const raw = parseUnits(cleaned, decimals);
  if (raw <= 0n) throw new Error("must be > 0");
  return { raw, display: intPart + (fracPart ? "." + fracPart : "") };
}

/** Format raw token units back to a human string trimmed of trailing zeros. */
export function formatAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const s = raw.toString().padStart(decimals + 1, "0");
  const intPart = s.slice(0, s.length - decimals);
  const fracPart = s.slice(s.length - decimals).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}
