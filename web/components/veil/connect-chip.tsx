"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import type { Connector } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Btn, Icon } from "./primitives";
import { shortAddr } from "@/lib/config";
import { formatError } from "@/lib/format-error";

// Generous so the user has time to unlock the wallet and click Approve.
// Only fires if wagmi's mutation hangs without the wallet ever responding.
const CONNECT_WATCHDOG_MS = 60_000;

export function ConnectChip() {
  const { address, isConnected, chain } = useAccount();
  const { connectAsync, connectors, isPending, reset, error } = useConnect();
  const { disconnect, isPending: disconnecting } = useDisconnect();
  const chainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== sepolia.id;
  const [localBusy, setLocalBusy] = useState(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!isPending) {
      if (watchdog.current) {
        clearTimeout(watchdog.current);
        watchdog.current = null;
      }
      return;
    }
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = setTimeout(() => {
      console.warn("Connect mutation stuck >60s — resetting wagmi state. Click Connect again.");
      reset();
      setLocalBusy(false);
    }, CONNECT_WATCHDOG_MS);
    return () => {
      if (watchdog.current) clearTimeout(watchdog.current);
    };
  }, [isPending, reset]);

  useEffect(() => {
    if (error) console.error("wagmi connect error:", formatError(error));
  }, [error]);

  // Auto-prompt chain switch once when we land on the wrong chain (e.g. user's
  // wallet defaults to mainnet). Guard so we don't spam if they reject.
  const [autoSwitched, setAutoSwitched] = useState(false);
  useEffect(() => {
    if (wrongChain && !switching && !autoSwitched) {
      setAutoSwitched(true);
      switchChainAsync({ chainId: sepolia.id }).catch(() => {});
    }
    if (!wrongChain) setAutoSwitched(false);
  }, [wrongChain, switching, autoSwitched, switchChainAsync]);

  const [hint, setHint] = useState<string | null>(null);

  async function tryConnect(connector: Connector | undefined) {
    if (!connector || localBusy) return;
    setHint(null);
    setPicking(false);
    setLocalBusy(true);
    try {
      await connectAsync({ connector });
    } catch (err) {
      console.error("connect rejected — raw error:", err);
      const friendly = formatError(err);
      console.error("connect rejected — friendly:", friendly);
      setHint(friendly);
      reset();
    } finally {
      setLocalBusy(false);
    }
  }

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

  // EIP-6963 auto-discovered wallets (MetaMask, Brave, Phantom, etc.)
  // Each shows up as a connector with type "injected" and id = wallet rdns.
  const eipWallets = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  // Static injected as a last-resort fallback when nothing announces via EIP-6963.
  const staticInjected = connectors.find((c) => c.id === "injected");
  const wcConnector = connectors.find((c) => c.id === "walletConnect");

  const browserOptions: Connector[] = eipWallets.length > 0
    ? eipWallets
    : staticInjected
      ? [staticInjected]
      : [];

  const busy = (isPending || localBusy) && !error;
  const showWc = Boolean(wcConnector);
  const noOptions = browserOptions.length === 0 && !showWc;

  return (
    <span className="relative inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        {browserOptions.length === 1 && (
          <Btn
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => tryConnect(browserOptions[0])}
          >
            <Icon name="wallet" size={14} />
            {busy ? "Connecting…" : showWc ? browserOptions[0].name : "Connect"}
          </Btn>
        )}
        {browserOptions.length > 1 && (
          <Btn
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => setPicking((p) => !p)}
          >
            <Icon name="wallet" size={14} />
            {busy ? "Connecting…" : `Browser · ${browserOptions.length}`}
          </Btn>
        )}
        {showWc && (
          <Btn
            variant={browserOptions.length > 0 ? "outline" : "primary"}
            size="sm"
            disabled={busy}
            onClick={() => tryConnect(wcConnector)}
          >
            {busy ? "…" : "Mobile · QR"}
          </Btn>
        )}
        {noOptions && (
          <Btn variant="primary" size="sm" disabled>
            <Icon name="wallet" size={14} />
            No wallet detected
          </Btn>
        )}
      </span>
      {picking && browserOptions.length > 1 && (
        <ul
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] p-1 bg-[var(--bg2)] border border-[var(--line2)] rounded-lg shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)] list-none"
        >
          {browserOptions.map((c) => (
            <li key={c.uid}>
              <button
                type="button"
                onClick={() => tryConnect(c)}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-[var(--text)] hover:bg-[var(--bg3)] transition-colors"
              >
                {c.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className="w-5 h-5 rounded" />
                ) : (
                  <Icon name="wallet" size={16} />
                )}
                <span>{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hint && (
        <span className="font-[var(--font-mono)] text-[10.5px] text-[var(--sell)] max-w-[280px] text-right leading-tight">
          {hint}
        </span>
      )}
    </span>
  );
}
