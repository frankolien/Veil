"use client";

import { useMemo, useState } from "react";
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
import { DISPERSE_TOKEN, hasToken } from "@/lib/config";

type Row = { line: number; address: Address; amount: bigint };
type ParseResult = { rows: Row[]; errors: string[] };

function parseRecipients(input: string): ParseResult {
  const errors: string[] = [];
  const rows: Row[] = [];
  input
    .split(/\r?\n/)
    .map((s) => s.trim())
    .forEach((line, idx) => {
      if (!line || line.startsWith("#")) return;
      const parts = line.split(/[,\s]+/).filter(Boolean);
      if (parts.length !== 2) {
        errors.push(`Line ${idx + 1}: expected "address amount", got "${line}".`);
        return;
      }
      const [addr, raw] = parts;
      if (!isAddress(addr)) {
        errors.push(`Line ${idx + 1}: "${addr}" is not a valid address.`);
        return;
      }
      let amount: bigint;
      try {
        amount = BigInt(raw);
      } catch {
        errors.push(`Line ${idx + 1}: "${raw}" is not an integer amount (raw token units).`);
        return;
      }
      if (amount <= 0n) {
        errors.push(`Line ${idx + 1}: amount must be > 0.`);
        return;
      }
      rows.push({ line: idx + 1, address: addr, amount });
    });
  return { rows, errors };
}

export function DispersePanel() {
  const { address } = useAccount();
  const token = (hasToken() ? (DISPERSE_TOKEN as Address) : undefined);
  const zamaSDK = useZamaSDK();
  const queryClient = useQueryClient();

  const [input, setInput] = useState<string>("# one recipient per line: address amount\n");
  const parsed = useMemo(() => parseRecipients(input), [input]);

  const { data: isRegistered } = useIsRegistered({ user: address });

  const register = useRegister();
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

  const disperse = useDisperse({ encryptor: () => zamaSDK.relayer });

  const [status, setStatus] = useState<string>("");

  const total = parsed.rows.reduce((acc, r) => acc + r.amount, 0n);
  const ready = report?.ready === true && parsed.errors.length === 0;

  async function onRegister() {
    if (!token) return;
    setStatus("Registering wallet pair…");
    try {
      await register.mutateAsync({ token });
      await queryClient.invalidateQueries({ queryKey: ["tokenops-sdk", "fhe-disperse"] });
      setStatus("Registered.");
    } catch (e) {
      setStatus(`Register error: ${(e as Error).message}`);
    }
  }

  async function onDisperse() {
    if (!token || !preflightArgs) return;
    setStatus("Encrypting amounts + dispersing…");
    try {
      const { hash } = await disperse.mutateAsync({
        token,
        mode: "wallet",
        recipients: preflightArgs.recipients,
        amounts: preflightArgs.amounts,
      });
      setStatus(`Sent · ${hash.slice(0, 10)}…`);
    } catch (e) {
      setStatus(`Disperse error: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-100">Recipients</h2>
          <span className="text-xs text-zinc-500">
            {parsed.rows.length} valid · total {total.toString()}
          </span>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={10}
          spellCheck={false}
          className="mt-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
          placeholder="0xRecipient1 1000000&#10;0xRecipient2 500000"
        />
        {parsed.errors.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-rose-400">
            {parsed.errors.slice(0, 5).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {parsed.errors.length > 5 && <li>… and {parsed.errors.length - 5} more</li>}
          </ul>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Step 1 · Register
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            One-time deployment of your dedicated wallet pair for the chosen token. Required
            before your first confidential disperse.
          </p>
          <button
            onClick={onRegister}
            disabled={!address || !token || isRegistered === true || register.isPending}
            className="mt-4 w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {!address
              ? "Connect wallet"
              : !token
                ? "Token not configured"
                : isRegistered
                  ? "Already registered"
                  : register.isPending
                    ? "Registering…"
                    : "Register"}
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
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
            className="mt-4 w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {disperse.isPending ? "Dispersing…" : "Encrypt & disperse"}
          </button>
        </div>
      </div>

      {status && <p className="break-all text-xs text-zinc-500">{status}</p>}
    </div>
  );
}
