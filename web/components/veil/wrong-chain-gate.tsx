"use client";

import { useEffect, useState } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { Btn } from "./primitives";

export function WrongChainGate() {
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const [error, setError] = useState<string | null>(null);

  const wrong = isConnected && chainId !== undefined && chainId !== sepolia.id;

  // Auto-prompt the chain switch once when we detect the wrong chain.
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (wrong && !autoTried) {
      setAutoTried(true);
      switchChainAsync({ chainId: sepolia.id }).catch((e) => {
        setError((e as Error)?.message ?? "Switch rejected.");
      });
    }
    if (!wrong) {
      setAutoTried(false);
      setError(null);
    }
  }, [wrong, autoTried, switchChainAsync]);

  if (!wrong) return null;

  async function trySwitch() {
    setError(null);
    try {
      await switchChainAsync({ chainId: sepolia.id });
    } catch (e) {
      setError((e as Error)?.message ?? "Switch rejected.");
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-[rgba(7,9,18,0.82)] backdrop-blur-md">
      <div className="veil-panel max-w-[440px] w-full p-6 sm:p-8 flex flex-col gap-5 border-[color-mix(in_oklab,var(--sell)_55%,var(--line))] bg-[color-mix(in_oklab,var(--bg2)_85%,transparent)]">
        <div className="flex flex-col gap-2">
          <span className="font-[var(--font-mono)] text-[10.5px] tracking-[0.2em] text-[var(--sell)]">
            WRONG NETWORK
          </span>
          <h3 className="text-[18px] font-semibold m-0">Switch to Sepolia to continue</h3>
          <p className="text-[13.5px] text-[var(--dim)] leading-snug m-0">
            Veil only runs on Sepolia (chain id <code className="font-[var(--font-mono)]">11155111</code>).
            Your wallet is on chain <code className="font-[var(--font-mono)]">{chainId}</code>.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <Btn variant="primary" size="md" onClick={trySwitch} disabled={isPending}>
            {isPending ? "Switching…" : "Switch network"}
          </Btn>
          <Btn variant="ghost" size="md" onClick={() => disconnect()}>
            Disconnect
          </Btn>
        </div>

        {error && (
          <p className="text-[11.5px] text-[var(--sell)] font-[var(--font-mono)] leading-snug m-0 break-words">
            {error.slice(0, 200)}
          </p>
        )}

        <p className="text-[11.5px] text-[var(--faint)] font-[var(--font-mono)] leading-snug m-0">
          Tip: if your wallet doesn&apos;t have Sepolia yet, it will prompt you to add it. Approve once and you&apos;re done.
        </p>
      </div>
    </div>
  );
}
