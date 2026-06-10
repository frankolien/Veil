const REVERT_PATTERNS: Array<{ rx: RegExp; tidy: (m: RegExpMatchArray) => string }> = [
  { rx: /reverted with the following reason:\s*([^\n]+)/, tidy: (m) => m[1].trim() },
  { rx: /reverted with custom error '([^']+)'/, tidy: (m) => `${m[1]} (custom error)` },
  { rx: /execution reverted:\s*([^"\n]+)/, tidy: (m) => m[1].trim() },
];

const FRIENDLY_REPLACEMENTS: Array<[RegExp, string]> = [
  [
    /RPC submit: insufficient funds for gas \* price \+ value: have (\d+) want (\d+)/,
    "Not enough Sepolia ETH to cover the gas reservation. Top up from a faucet.",
  ],
  [/User rejected the request/i, "You rejected the transaction in your wallet."],
  [/User denied transaction/i, "You rejected the transaction in your wallet."],
  [/replacement transaction underpriced/i, "Replacement transaction underpriced — wait for the previous tx to clear."],
  [/nonce too low/i, "Wallet nonce out of sync — reset the account's activity in MetaMask."],
  [/BatchNotOpen/, "This batch is no longer accepting orders."],
  [/BatchNotClosed/, "Batch hasn't closed yet."],
  [/BatchNotCleared/, "Batch hasn't been cleared yet."],
  [/BatchAlreadyCleared/, "Batch is already cleared."],
  [/AlreadySettled/, "This order is already settled."],
  [/NotOrderTrader/, "Only the order owner can settle this."],
  [/not operator/, "Approval missing — set the operator on the token first."],
];

export function formatError(err: unknown): string {
  if (!err) return "Unknown error.";
  const raw = err instanceof Error ? err.message : String(err);

  for (const [rx, friendly] of FRIENDLY_REPLACEMENTS) {
    if (rx.test(raw)) return friendly;
  }

  for (const { rx, tidy } of REVERT_PATTERNS) {
    const m = raw.match(rx);
    if (m) return tidy(m);
  }

  const firstLine = raw.split("\n", 1)[0];
  if (firstLine.length > 180) return firstLine.slice(0, 180) + "…";
  return firstLine;
}
