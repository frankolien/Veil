"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import type { Connector } from "wagmi";
import { sepolia } from "wagmi/chains";
import { shortAddr } from "@/lib/config";
import { formatError } from "@/lib/format-error";

// Generous so the user has time to unlock MetaMask and click Approve.
// Only fires if wagmi's mutation hangs without the wallet ever responding.
const CONNECT_WATCHDOG_MS = 60_000;

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connectAsync, connectors, isPending, reset, error } = useConnect();
  const { disconnect, isPending: disconnecting } = useDisconnect();
  const chainId = useChainId();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== sepolia.id;

  const [localBusy, setLocalBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
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

  async function tryConnect(connector: Connector | undefined) {
    if (!connector || localBusy) return;
    setHint(null);
    setLocalBusy(true);
    try {
      await connectAsync({ connector });
    } catch (err) {
      setHint(formatError(err));
      reset();
    } finally {
      setLocalBusy(false);
    }
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        {wrongChain && (
          <button
            onClick={() => switchChainAsync({ chainId: sepolia.id }).catch(() => {})}
            disabled={switching}
            className="rounded-full border border-rose-700/60 bg-rose-950/40 px-3 py-2 text-xs font-medium text-rose-300 hover:border-rose-500"
          >
            {switching ? "Switching…" : "Wrong network · switch"}
          </button>
        )}
        <span className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-100">
          <span className="h-2 w-2 rounded-full bg-violet-400" />
          {shortAddr(address)}
          {chain && <span className="text-zinc-500">· {chain.name}</span>}
        </span>
        <button
          onClick={() => disconnect()}
          disabled={disconnecting}
          className="rounded-full border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
        >
          {disconnecting ? "…" : "Disconnect"}
        </button>
      </div>
    );
  }

  const injectedConnector = connectors.find((c) => c.id === "injected");
  const wcConnector = connectors.find((c) => c.id === "walletConnect");
  const busy = (isPending || localBusy) && !error;
  const showBrowser = hasInjected && injectedConnector;
  const showWc = Boolean(wcConnector);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {showBrowser && (
          <button
            onClick={() => tryConnect(injectedConnector)}
            disabled={busy}
            className="rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-violet-400 disabled:opacity-50"
          >
            {busy ? "Connecting…" : showWc ? "Browser wallet" : "Connect wallet"}
          </button>
        )}
        {showWc && (
          <button
            onClick={() => tryConnect(wcConnector)}
            disabled={busy}
            className={
              showBrowser
                ? "rounded-full border border-violet-500/60 px-4 py-2 text-sm font-medium text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
                : "rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-violet-400 disabled:opacity-50"
            }
          >
            {busy ? "…" : "Mobile · QR"}
          </button>
        )}
        {!showBrowser && !showWc && (
          <button
            disabled
            className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-500"
          >
            No wallet detected
          </button>
        )}
      </div>
      {hint && (
        <span className="max-w-[280px] text-right font-mono text-[10.5px] leading-tight text-rose-400">
          {hint}
        </span>
      )}
    </div>
  );
}
