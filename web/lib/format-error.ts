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
  [/User rejected the request/i, "You rejected the request in your wallet."],
  [/User denied transaction/i, "You rejected the transaction in your wallet."],
  [/User closed modal/i, "Wallet popup was closed before approving."],
  [/Already processing/i, "A wallet request is already pending — open MetaMask to approve or dismiss it."],
  [/Request of type 'wallet_requestPermissions' already pending/i, "MetaMask has a pending connect request — open the extension."],
  [/connector is already connected/i, "Wallet is already connected."],
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

const CODE_REPLACEMENTS: Record<number, string> = {
  4001: "You rejected the request in your wallet.",
  4100: "Wallet hasn't authorized this app yet — try Connect again.",
  4200: "Wallet doesn't support that operation.",
  4900: "Wallet is disconnected from the network.",
  4901: "Wallet isn't on the requested chain.",
  [-32002]: "A wallet request is already pending — open MetaMask to approve or dismiss it.",
  [-32603]: "Wallet RPC internal error — unlock the wallet and try again.",
};

type ErrorLike = {
  shortMessage?: unknown;
  message?: unknown;
  details?: unknown;
  code?: unknown;
  name?: unknown;
  cause?: unknown;
};

function pullString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function extractMessage(err: unknown, depth = 0): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (depth > 4) return "";
  const e = err as ErrorLike;
  return (
    pullString(e.shortMessage) ??
    pullString(e.message) ??
    pullString(e.details) ??
    extractMessage(e.cause, depth + 1) ??
    pullString(e.name) ??
    ""
  );
}

function extractCode(err: unknown, depth = 0): number | null {
  if (err == null || depth > 4) return null;
  const e = err as ErrorLike;
  if (typeof e.code === "number") return e.code;
  if (typeof e.code === "string" && /^-?\d+$/.test(e.code)) return Number(e.code);
  return extractCode(e.cause, depth + 1);
}

export function formatError(err: unknown): string {
  if (!err) return "Unknown error.";

  const code = extractCode(err);
  if (code !== null && CODE_REPLACEMENTS[code]) return CODE_REPLACEMENTS[code];

  const message = extractMessage(err);
  if (!message) {
    try {
      const stringified = JSON.stringify(err, Object.getOwnPropertyNames(err as object));
      return stringified === "{}" ? "Unknown error." : stringified.slice(0, 180);
    } catch {
      return "Unknown error.";
    }
  }

  for (const [rx, friendly] of FRIENDLY_REPLACEMENTS) {
    if (rx.test(message)) return friendly;
  }

  for (const { rx, tidy } of REVERT_PATTERNS) {
    const m = message.match(rx);
    if (m) return tidy(m);
  }

  const firstLine = message.split("\n", 1)[0];
  if (firstLine.length > 180) return firstLine.slice(0, 180) + "…";
  return firstLine;
}
