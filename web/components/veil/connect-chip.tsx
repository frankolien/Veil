"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import type { Connector } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Btn, Icon } from "./primitives";
import { shortAddr } from "@/lib/config";
import { formatError } from "@/lib/format-error";

// Generous so the user has time to unlock MetaMask and click Approve.
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

  const [hasInjected, setHasInjected] = useState(false);
  useEffect(() => {
    setHasInjected(
      typeof window !== "undefined" && Boolean((window as unknown as { ethereum?: unknown }).ethereum),
    );
  }, []);

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

  const [hint, setHint] = useState<string | null>(null);

  async function tryConnect(connector: Connector | undefined) {
    if (!connector || localBusy) return;
    setHint(null);
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

  const injectedConnector = connectors.find((c) => c.id === "injected");
  const wcConnector = connectors.find((c) => c.id === "walletConnect");
  const busy = (isPending || localBusy) && !error;
  const showBrowser = hasInjected && injectedConnector;
  const showWc = Boolean(wcConnector);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-1.5">
        {showBrowser && (
          <Btn
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => tryConnect(injectedConnector)}
          >
            <Icon name="wallet" size={14} />
            {busy ? "Connecting…" : showWc ? "Browser" : "Connect"}
          </Btn>
        )}
        {showWc && (
          <Btn
            variant={showBrowser ? "outline" : "primary"}
            size="sm"
            disabled={busy}
            onClick={() => tryConnect(wcConnector)}
          >
            {busy ? "…" : "Mobile · QR"}
          </Btn>
        )}
        {!showBrowser && !showWc && (
          <Btn variant="primary" size="sm" disabled>
            <Icon name="wallet" size={14} />
            No wallet detected
          </Btn>
        )}
      </span>
      {hint && (
        <span className="font-[var(--font-mono)] text-[10.5px] text-[var(--sell)] max-w-[280px] text-right leading-tight">
          {hint}
        </span>
      )}
    </span>
  );
}
