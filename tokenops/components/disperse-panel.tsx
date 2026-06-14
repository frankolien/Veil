"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useZamaSDK } from "@zama-fhe/react-sdk";
import {
  useIsRegistered,
  useRegister,
  usePreflightDisperse,
  useDisperse,
} from "@tokenops/sdk/fhe-disperse/react";
import { isAddress, type Address } from "viem";
import { DISPERSE_TOKEN, hasToken, shortAddr } from "@/lib/config";
import { useTokenInfo, type TokenInfo } from "@/lib/use-token-info";
import { parseAmount, formatAmount } from "@/lib/parse-amount";
import { formatError } from "@/lib/format-error";
import { addrUrl, shortHash, txUrl } from "@/lib/etherscan";
import { Tip } from "./tip";
import { StartHere } from "./start-here";

type Row = { line: number; address: Address; amount: bigint; display: string };
type ParseResult = { rows: Row[]; errors: string[] };

function parseRecipients(input: string, token?: TokenInfo): ParseResult {
  const errors: string[] = [];
  const rows: Row[] = [];
  input
    .split(/\r?\n/)
    .map((s) => s.trim())
    .forEach((line, idx) => {
      if (!line || line.startsWith("#")) return;
      const parts = line.split(/[,\s]+/).filter(Boolean);
      if (parts.length < 2) {
        errors.push(`Line ${idx + 1}: expected "address amount", got "${line}".`);
        return;
      }
      const addr = parts[0];
      const amountPart = parts.slice(1).join(" ");
      if (!isAddress(addr)) {
        errors.push(`Line ${idx + 1}: "${addr}" is not a valid address.`);
        return;
      }
      try {
        if (token) {
          const { raw, display } = parseAmount(amountPart, token.decimals, token.symbol);
          rows.push({ line: idx + 1, address: addr, amount: raw, display });
        } else {
          const raw = BigInt(amountPart.replace(/_/g, ""));
          if (raw <= 0n) throw new Error("must be > 0");
          rows.push({ line: idx + 1, address: addr, amount: raw, display: raw.toString() });
        }
      } catch (err) {
        errors.push(`Line ${idx + 1}: ${(err as Error).message}`);
      }
    });
  return { rows, errors };
}

const STARTER_PLACEHOLDER =
  "# one recipient per line: <address> <amount>\n# amount can be human (1.5) or raw integer\n";

export function DispersePanel() {
  const { address, isConnected } = useAccount();
  const token = (hasToken() ? (DISPERSE_TOKEN as Address) : undefined);
  const tokenInfo = useTokenInfo(token);
  const zamaSDK = useZamaSDK();
  const queryClient = useQueryClient();

  const [input, setInput] = useState<string>(STARTER_PLACEHOLDER);
  const parsed = useMemo(() => parseRecipients(input, tokenInfo.data), [input, tokenInfo.data]);

  const { data: isRegistered } = useIsRegistered({ user: address });
  const register = useRegister();
  const disperse = useDisperse({ encryptor: () => zamaSDK.relayer });

  const preflightArgs = useMemo(
    () =>
      address && token && parsed.rows.length > 0
        ? {
            user: address,
            token,
            recipients: parsed.rows.map((r) => r.address),
            amounts: parsed.rows.map((r) => r.amount),
            mode: "wallet" as const,
          }
        : null,
    [address, token, parsed.rows],
  );
  const { data: report } = usePreflightDisperse(preflightArgs ?? undefined);

  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "info"; text: string }
    | { kind: "success"; text: string; hash: string }
    | { kind: "error"; text: string }
  >({ kind: "idle" });

  const total = parsed.rows.reduce((acc, r) => acc + r.amount, 0n);
  const ready = report?.ready === true && parsed.errors.length === 0 && parsed.rows.length > 0;
  const symbol = tokenInfo.data?.symbol ?? "tokens";
  const totalDisplay = tokenInfo.data ? formatAmount(total, tokenInfo.data.decimals) : total.toString();

  const fileRef = useRef<HTMLInputElement>(null);
  const lastImportName = useRef<string | null>(null);

  function onCsvUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setInput(text);
      lastImportName.current = file.name;
    };
    reader.readAsText(file);
  }

  async function onRegister() {
    if (!token) return;
    setStatus({ kind: "info", text: "Registering wallet pair…" });
    try {
      const { hash } = await register.mutateAsync({ token });
      await queryClient.invalidateQueries({ queryKey: ["tokenops-sdk", "fhe-disperse"] });
      setStatus({ kind: "success", text: "Wallet pair registered.", hash });
    } catch (e) {
      setStatus({ kind: "error", text: formatError(e) });
    }
  }

  async function onDisperse() {
    if (!token || !preflightArgs) return;
    setStatus({ kind: "info", text: "Encrypting amounts and dispatching…" });
    try {
      const { hash } = await disperse.mutateAsync({
        token,
        mode: "wallet",
        recipients: preflightArgs.recipients,
        amounts: preflightArgs.amounts,
      });
      setStatus({
        kind: "success",
        text: `Sent · ${parsed.rows.length} recipients · ${totalDisplay} ${symbol} total.`,
        hash,
      });
    } catch (e) {
      setStatus({ kind: "error", text: formatError(e) });
    }
  }

  const steps = useMemo(
    () => [
      {
        title: "Connect a wallet on Sepolia",
        body: "Mist uses ERC-7984 confidential tokens — only Sepolia is wired today.",
        done: Boolean(isConnected && address),
      },
      {
        title: "Register your dedicated wallet pair (one-time)",
        body: "The SDK deploys two scoped subwallets that hold encrypted balances on your behalf.",
        done: isRegistered === true,
      },
      {
        title: "Paste recipients, encrypt, and disperse",
        body: "Amounts are encrypted client-side. Recipients verifiable on-chain; amounts hidden.",
        done: false,
      },
    ],
    [isConnected, address, isRegistered],
  );

  useEffect(() => {
    // suppress unused-token warning when none configured
    void register.isPending;
  }, [register.isPending]);

  return (
    <div className="flex flex-col gap-6">
      <StartHere storageKey="mist:start-here:v1" steps={steps} />

      <TokenStrip token={token} info={tokenInfo.data} isLoading={tokenInfo.isLoading} />

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">
            <Tip label="Recipients">
              One entry per line. Format: <code>address amount</code>. Amount accepts decimals
              ({tokenInfo.data ? `e.g. 1.5 ${symbol}` : "e.g. 1500000 raw units"}) or bare integers
              with optional <code>_</code> separators.
            </Tip>
          </h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-zinc-500">
              {parsed.rows.length} valid · total {totalDisplay} {symbol}
            </span>
            <label className="cursor-pointer rounded-md border border-zinc-700 px-2.5 py-1 font-mono text-[11px] text-zinc-300 hover:border-violet-500 hover:text-violet-300">
              Upload CSV
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onCsvUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={9}
          spellCheck={false}
          className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 focus:border-violet-500 focus:outline-none"
          placeholder={
            tokenInfo.data
              ? `0xRecipient1 1.5\n0xRecipient2 0.25`
              : `0xRecipient1 1000000\n0xRecipient2 500000`
          }
        />
        {lastImportName.current && (
          <p className="mt-2 font-mono text-[11px] text-zinc-500">Imported from {lastImportName.current}</p>
        )}
        {parsed.errors.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-rose-400">
            {parsed.errors.slice(0, 5).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {parsed.errors.length > 5 && <li>… and {parsed.errors.length - 5} more</li>}
          </ul>
        )}
      </div>

      {parsed.rows.length > 0 && (
        <RecipientsTable rows={parsed.rows} symbol={symbol} totalDisplay={totalDisplay} />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Step 1 · Register
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            One-time setup. The SDK deploys a{" "}
            <Tip label="dedicated wallet pair">
              Two helper smart-wallets owned by you that hold the encrypted intermediate balances
              during a disperse. Required so the singleton can split amounts without exposing
              individual values.
            </Tip>{" "}
            scoped to this token. Required before your first confidential disperse.
          </p>
          <button
            onClick={onRegister}
            disabled={!address || !token || isRegistered === true || register.isPending}
            className="mt-4 w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {!address
              ? "Connect wallet first"
              : !token
                ? "Token not configured"
                : isRegistered
                  ? "Already registered ✓"
                  : register.isPending
                    ? "Registering…"
                    : "Register"}
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Step 2 · Disperse
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            Amounts are encrypted client-side via the Zama relayer, then bundled into a single
            confidential transfer. Recipients are visible; per-recipient amounts are not.
          </p>
          {report && !report.ready && (
            <ul className="mt-3 space-y-1 text-xs text-amber-400">
              {(report.blockerErrors ?? []).slice(0, 4).map((err: { code: string; message: string }) => (
                <li key={err.code + err.message}>{err.message}</li>
              ))}
            </ul>
          )}
          <button
            onClick={onDisperse}
            disabled={!ready || disperse.isPending}
            className="mt-4 w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {disperse.isPending ? "Dispersing…" : "Encrypt & disperse"}
          </button>
        </div>
      </div>

      {status.kind !== "idle" && <StatusBanner status={status} />}
    </div>
  );
}

function TokenStrip({
  token,
  info,
  isLoading,
}: {
  token: Address | undefined;
  info: TokenInfo | undefined;
  isLoading: boolean;
}) {
  if (!token) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-5 text-sm text-zinc-400">
        <p className="font-medium text-zinc-200">No token configured.</p>
        <p className="mt-2">
          Set <code className="rounded bg-zinc-800 px-1.5 py-0.5">NEXT_PUBLIC_DISPERSE_TOKEN</code>{" "}
          in <code className="rounded bg-zinc-800 px-1.5 py-0.5">tokenops/.env.local</code> to any
          ERC-7984 token — e.g. cUSDC on Sepolia from the Confidential Wrappers Registry.
        </p>
      </div>
    );
  }
  const link = addrUrl(token);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-5 py-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-2 w-2 rounded-full bg-violet-400" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-zinc-100">
            {isLoading ? "Loading…" : info ? `${info.name} (${info.symbol})` : "Unknown token"}
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            {info ? `${info.decimals} decimals · ` : ""}
            {link ? (
              <a className="hover:text-violet-300" href={link} target="_blank" rel="noreferrer">
                {shortAddr(token)} ↗
              </a>
            ) : (
              shortAddr(token)
            )}
          </span>
        </div>
      </div>
      {!isLoading && !info && (
        <span className="text-[11px] text-amber-400">
          Couldn&apos;t read symbol/decimals — is this an ERC-7984 on Sepolia?
        </span>
      )}
    </div>
  );
}

function RecipientsTable({
  rows,
  symbol,
  totalDisplay,
}: {
  rows: Row[];
  symbol: string;
  totalDisplay: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const SHOW = expanded ? rows.length : Math.min(rows.length, 5);
  const visible = rows.slice(0, SHOW);
  const overflow = rows.length - SHOW;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Preview
        </span>
        <span className="font-mono text-[11px] text-zinc-500">
          {rows.length} {rows.length === 1 ? "recipient" : "recipients"} · {totalDisplay} {symbol}
        </span>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-left text-[12.5px]">
        <thead className="bg-zinc-950/40 font-mono text-[10.5px] uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-5 py-2">#</th>
            <th className="px-2 py-2">Recipient</th>
            <th className="px-5 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="font-mono text-zinc-300">
          {visible.map((r) => (
            <tr key={r.line} className="border-t border-zinc-900">
              <td className="px-5 py-1.5 text-zinc-500">{r.line}</td>
              <td className="px-2 py-1.5">
                <a
                  href={addrUrl(r.address) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-violet-300"
                >
                  {shortAddr(r.address)} ↗
                </a>
              </td>
              <td className="px-5 py-1.5 text-right text-zinc-100">
                {r.display} {symbol}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {overflow > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="block w-full border-t border-zinc-800 bg-zinc-950/40 py-2 font-mono text-[11px] text-zinc-400 hover:text-violet-300"
        >
          Show {overflow} more
        </button>
      )}
      {expanded && rows.length > 5 && (
        <button
          onClick={() => setExpanded(false)}
          className="block w-full border-t border-zinc-800 bg-zinc-950/40 py-2 font-mono text-[11px] text-zinc-400 hover:text-violet-300"
        >
          Collapse
        </button>
      )}
    </div>
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "info"; text: string }
  | { kind: "success"; text: string; hash: string }
  | { kind: "error"; text: string };

function StatusBanner({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  const styleByKind = {
    info: "border-zinc-700 bg-zinc-900/60 text-zinc-300",
    success: "border-emerald-700/50 bg-emerald-950/30 text-emerald-300",
    error: "border-rose-700/50 bg-rose-950/30 text-rose-300",
  } as const;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styleByKind[status.kind]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span>{status.text}</span>
        {status.kind === "success" && (() => {
          const link = txUrl(status.hash);
          if (!link) return null;
          return (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-emerald-200 hover:text-emerald-100"
            >
              {shortHash(status.hash)} ↗
            </a>
          );
        })()}
      </div>
    </div>
  );
}
