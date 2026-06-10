"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  useConfig,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { sepolia } from "wagmi/chains";
import { Btn, EthereumMark, Icon, Pill, Wordmark } from "./primitives";
import { VeilNav } from "./nav";
import { ToastView, useToast } from "./toast";
import { formatError } from "@/lib/format-error";
import { veilRegulatorRegistryAbi } from "@/lib/abi-vault";
import { VEIL_REGULATOR_ADDRESS, hasRegulatorDeployment, shortAddr } from "@/lib/config";
import type { Address } from "viem";

const DEFAULT_TTL_DAYS = 30;

function ConnectChip() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect, isPending: disconnecting } = useDisconnect();
  const chainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== sepolia.id;
  if (isConnected && address) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {wrongChain && (
          <button
            type="button"
            onClick={() => switchChainAsync({ chainId: sepolia.id }).catch(() => {})}
            disabled={switching}
            className="inline-flex items-center gap-1.5 text-[12px] font-[var(--font-mono)] px-2.5 py-1.5 rounded-lg border border-[color-mix(in_oklab,var(--sell)_45%,transparent)] text-[var(--sell)] bg-[color-mix(in_oklab,var(--sell)_8%,transparent)]"
          >
            {switching ? "Switching…" : "Wrong network · switch"}
          </button>
        )}
        <span className="inline-flex items-center gap-2 text-[13px] px-3.5 py-1.5 border border-[var(--line2)] rounded-lg text-[var(--text)]">
          <Icon name="wallet" size={14} />
          <span className="font-[var(--font-mono)]">{shortAddr(address)}</span>
          {chain && <span className="text-[var(--dim)]">· {chain.name}</span>}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          disabled={disconnecting}
          className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg border border-[var(--line2)] text-[var(--dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors disabled:opacity-60"
        >
          {disconnecting ? "…" : "Disconnect"}
        </button>
      </span>
    );
  }
  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
  return (
    <Btn variant="primary" size="sm" disabled={isPending || !injected} onClick={() => injected && connect({ connector: injected })}>
      <Icon name="wallet" size={14} />
      {isPending ? "Connecting…" : "Connect"}
    </Btn>
  );
}

export function RegulatorApp() {
  const { address } = useAccount();
  const chainId = useChainId();
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [regulatorInput, setRegulatorInput] = useState("");
  const [days, setDays] = useState(String(DEFAULT_TTL_DAYS));
  const [busy, setBusy] = useState<"set" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast, flash } = useToast();

  const { data: current, refetch } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_REGULATOR_ADDRESS as Address,
    abi: veilRegulatorRegistryAbi,
    functionName: "regulatorOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && hasRegulatorDeployment(), refetchInterval: 6000 },
  });

  const grantedRegulator = current ? (current[0] as Address) : "0x0000000000000000000000000000000000000000";
  const grantedUntil = current ? Number(current[1]) : 0;
  const hasGrant = grantedUntil > Math.floor(Date.now() / 1000);

  useEffect(() => {
    if (hasGrant && grantedRegulator) setRegulatorInput(grantedRegulator);
  }, [hasGrant, grantedRegulator]);

  async function ensureSepolia() {
    if (chainId !== sepolia.id) await switchChainAsync({ chainId: sepolia.id });
  }

  async function setRegulator(e: React.FormEvent) {
    e.preventDefault();
    if (!address || busy) return;
    setError(null);
    if (!/^0x[a-fA-F0-9]{40}$/.test(regulatorInput.trim())) {
      setError("Enter a valid 0x-prefixed address.");
      return;
    }
    const ttlDays = Number(days);
    if (!Number.isFinite(ttlDays) || ttlDays <= 0 || ttlDays > 365) {
      setError("Duration must be 1–365 days.");
      return;
    }
    try {
      setBusy("set");
      await ensureSepolia();
      const until = Math.floor(Date.now() / 1000) + Math.floor(ttlDays * 86400);
      const hash = await writeContractAsync({
        chainId: sepolia.id,
        address: VEIL_REGULATOR_ADDRESS as Address,
        abi: veilRegulatorRegistryAbi,
        functionName: "setRegulator",
        args: [regulatorInput.trim() as Address, until],
      });
      await waitForTransactionReceipt(config, { hash });
      flash({ message: "Audit grant updated. View on Sepolia:", tone: "success", txHash: hash });
      refetch();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    if (!address || busy) return;
    setError(null);
    try {
      setBusy("revoke");
      await ensureSepolia();
      const hash = await writeContractAsync({
        chainId: sepolia.id,
        address: VEIL_REGULATOR_ADDRESS as Address,
        abi: veilRegulatorRegistryAbi,
        functionName: "revokeRegulator",
        args: [],
      });
      await waitForTransactionReceipt(config, { hash });
      flash({ message: "Audit grant revoked. View on Sepolia:", tone: "success", txHash: hash });
      refetch();
      setRegulatorInput("");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(null);
    }
  }

  const expiresAt =
    grantedUntil > 0
      ? new Date(grantedUntil * 1000).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 h-16 flex items-center justify-between px-6 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] backdrop-blur-[16px]">
        <div className="flex items-center gap-[18px]">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 bg-transparent border border-[var(--line2)] text-[var(--dim)] rounded-lg h-[34px] px-3 font-[var(--font-display)] text-[13px] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all"
          >
            <Icon name="arrow" size={16} className="rotate-180" />
            Site
          </a>
          <Wordmark className="text-base" />
          <VeilNav />
        </div>
        <div className="flex items-center gap-[18px]">
          <span className="inline-flex items-center gap-2 text-[13px] text-[var(--dim)] font-[var(--font-mono)]">
            <EthereumMark className="text-[var(--accent)] drop-shadow-[0_0_6px_var(--glow)]" />
            Sepolia
          </span>
          <ConnectChip />
        </div>
      </header>

      <div className="flex-1 max-w-[900px] w-full mx-auto px-6 pt-[26px] pb-16 flex flex-col gap-[22px]">
        <div className="veil-panel p-[22px]">
          <div className="veil-panel-glow" />
          <div className="relative flex items-center justify-between mb-[18px]">
            <div className="flex items-baseline gap-2.5">
              <span className="font-[var(--font-mono)] text-[11px] tracking-[0.2em] text-[var(--faint)]">
                AUDIT REGISTRY
              </span>
              <span className="font-[var(--font-mono)] text-[20px] text-[var(--text)]">
                {VEIL_REGULATOR_ADDRESS ? shortAddr(VEIL_REGULATOR_ADDRESS) : "not deployed"}
              </span>
            </div>
            <Pill tone={hasGrant ? "accent" : "warn"} dot>
              {hasGrant ? "audit granted" : "no grant"}
            </Pill>
          </div>
          <div className="relative grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">Current regulator</span>
              <span className="font-[var(--font-mono)] text-[14px] text-[var(--text)] break-all">
                {hasGrant ? grantedRegulator : "—"}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">Expires</span>
              <span className="font-[var(--font-mono)] text-[14px] text-[var(--text)]">{expiresAt}</span>
            </div>
          </div>
        </div>

        <form onSubmit={setRegulator} className="veil-panel p-[22px] flex flex-col gap-4">
          <h3 className="text-base font-semibold m-0">Grant audit access</h3>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">Regulator address</span>
            <input
              type="text"
              value={regulatorInput}
              onChange={(e) => setRegulatorInput(e.target.value)}
              placeholder="0x…"
              className="h-10 px-3 rounded-md bg-[var(--bg3)] border border-[var(--line)] text-[var(--text)] font-[var(--font-mono)] text-[13px] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">Duration (days)</span>
            <input
              type="number"
              min="1"
              max="365"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="h-10 px-3 rounded-md bg-[var(--bg3)] border border-[var(--line)] text-[var(--text)] font-[var(--font-mono)] text-[13px] focus:outline-none focus:border-[var(--accent)]"
            />
          </label>
          <div className="flex gap-3 flex-wrap">
            <Btn type="submit" variant="primary" size="sm" disabled={busy !== null}>
              {busy === "set" ? "Signing…" : hasGrant ? "Update grant" : "Grant access"}
            </Btn>
            <Btn type="button" variant="ghost" size="sm" disabled={busy !== null || !hasGrant} onClick={revoke}>
              {busy === "revoke" ? "Signing…" : "Revoke"}
            </Btn>
          </div>
          {error && <span className="text-[11px] text-[var(--sell)] font-[var(--font-mono)] break-all">{error}</span>}
        </form>

        <div className="veil-panel p-[18px]">
          <h4 className="text-[14px] font-semibold m-0 mb-2">How audit grants work</h4>
          <ul className="text-[12.5px] text-[var(--dim)] leading-[1.6] font-[var(--font-mono)] m-0 pl-4 list-disc">
            <li>Granting a regulator lets that address view your ciphertexts via delegated decryption — without revealing them on-chain.</li>
            <li>The grant is time-bounded; after expiry the regulator loses access automatically.</li>
            <li>You can revoke at any time. Revocation takes effect immediately on new decryption requests.</li>
            <li>The registry is a public source of truth: anyone can look up who is allowed to audit a given account.</li>
          </ul>
        </div>
      </div>

      <ToastView toast={toast} />
    </div>
  );
}
