"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useEncrypt, useUserDecrypt } from "@zama-fhe/react-sdk";
import { bytesToHex, type Address } from "viem";
import { Btn, EthereumMark, Icon, Pill, Wordmark } from "./primitives";
import { VeilNav } from "./nav";
import { veilLendingVaultAbi } from "@/lib/abi-vault";
import { confidentialTokenAbi } from "@/lib/abi-v2";
import {
  VEIL_VAULT_ADDRESS,
  VEIL_BASE_ADDRESS,
  VEIL_QUOTE_ADDRESS,
  hasVaultDeployment,
  shortAddr,
} from "@/lib/config";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const OPERATOR_TTL_SECS = 60 * 60 * 24;

type Action = "deposit" | "withdraw" | "borrow" | "repay";

function useOperator(token: Address, holder?: Address) {
  return useReadContract({
    chainId: sepolia.id,
    address: token,
    abi: confidentialTokenAbi,
    functionName: "isOperator",
    args: holder ? [holder, VEIL_VAULT_ADDRESS as Address] : undefined,
    query: { enabled: !!holder, refetchInterval: 6000 },
  });
}

function useHandle(fn: "getCollateral" | "getDebt", user?: Address) {
  return useReadContract({
    chainId: sepolia.id,
    address: VEIL_VAULT_ADDRESS as Address,
    abi: veilLendingVaultAbi,
    functionName: fn,
    args: user ? [user] : undefined,
    query: { enabled: !!user, refetchInterval: 8000 },
  });
}

function ApproveChip({ symbol, token, approved }: { symbol: string; token: Address; approved: boolean }) {
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);

  async function approve() {
    if (busy || approved) return;
    setBusy(true);
    try {
      const until = Math.floor(Date.now() / 1000) + OPERATOR_TTL_SECS;
      const hash = await writeContractAsync({
        chainId: sepolia.id,
        address: token,
        abi: confidentialTokenAbi,
        functionName: "setOperator",
        args: [VEIL_VAULT_ADDRESS as Address, until],
      });
      await waitForTransactionReceipt(config, { hash });
    } catch (err) {
      console.error(`setOperator ${symbol} failed`, err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={approve}
      disabled={approved || busy}
      className={[
        "inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2.5 py-1 rounded-md transition-colors",
        approved
          ? "text-[var(--accent)] border border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]"
          : "text-[var(--text)] border border-[var(--line2)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
        busy ? "opacity-60" : "",
      ].join(" ")}
    >
      <Icon name={approved ? "check" : "lock"} size={11} />
      {busy ? "Signing…" : approved ? `${symbol} approved` : `Approve ${symbol}`}
    </button>
  );
}

function PositionPanel({
  collateral,
  debt,
  ltvBps,
  price,
  onReveal,
  revealing,
}: {
  collateral: number | null;
  debt: number | null;
  ltvBps: number;
  price: number;
  onReveal: () => void;
  revealing: boolean;
}) {
  const collValue = collateral !== null ? collateral * price : null;
  const maxBorrow = collValue !== null ? Math.floor((collValue * ltvBps) / 10_000) : null;
  const utilization =
    debt !== null && maxBorrow !== null && maxBorrow > 0 ? Math.min(100, Math.floor((debt / maxBorrow) * 100)) : null;
  const healthy = utilization === null ? null : utilization < 100;
  return (
    <div className="veil-panel p-[22px]">
      <div className="veil-panel-glow" />
      <div className="relative flex items-center justify-between mb-[18px]">
        <div className="flex items-baseline gap-2.5">
          <span className="font-[var(--font-mono)] text-[11px] tracking-[0.2em] text-[var(--faint)]">POSITION</span>
          <span className="font-[var(--font-mono)] text-[22px] text-[var(--text)]">encrypted</span>
        </div>
        <button
          type="button"
          onClick={onReveal}
          disabled={revealing}
          className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2.5 py-1.5 rounded-md text-[var(--accent)] border border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] transition-colors disabled:opacity-60"
        >
          <Icon name="key" size={11} />
          {revealing ? "Decrypting…" : "Reveal position"}
        </button>
      </div>
      <div className="relative grid grid-cols-4 gap-4">
        <PositionCell label="Collateral (vWETH)" value={collateral} />
        <PositionCell label="Debt (vUSDC)" value={debt} />
        <PositionCell label="Max borrow (vUSDC)" value={maxBorrow} />
        <PositionCell label="Utilization" value={utilization === null ? null : `${utilization}%`} />
      </div>
      <div className="mt-5 pt-[18px] border-t border-[var(--line)] flex flex-wrap gap-6 items-center">
        <Cell label="Price" value={`${price.toLocaleString()} vUSDC / vWETH`} />
        <Cell label="LTV" value={`${(ltvBps / 100).toFixed(0)}%`} />
        <Cell
          label="Health"
          value={
            healthy === null
              ? "—"
              : healthy
                ? "OK"
                : "Liquidatable"
          }
        />
        {healthy === false && <Pill tone="warn" dot>at risk</Pill>}
        {healthy === true && <Pill tone="accent" dot>healthy</Pill>}
      </div>
    </div>
  );
}

function PositionCell({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">{label}</span>
      <span className="font-[var(--font-mono)] text-[18px] text-[var(--text)] tabular-nums">
        {value === null ? "—" : typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">{label}</span>
      <span className="font-[var(--font-mono)] text-[13px] text-[var(--text)]">{value}</span>
    </div>
  );
}

function ActionForm({
  action,
  baseApproved,
  quoteApproved,
  onSuccess,
}: {
  action: Action;
  baseApproved: boolean;
  quoteApproved: boolean;
  onSuccess: (a: Action) => void;
}) {
  const config = useConfig();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { address } = useAccount();
  const encrypt = useEncrypt();
  const { writeContractAsync } = useWriteContract();
  const [amount, setAmount] = useState("100");
  const [stage, setStage] = useState<"idle" | "encrypting" | "submitting" | "confirming">("idle");
  const [error, setError] = useState<string | null>(null);

  const needsApproval = action === "deposit" ? !baseApproved : action === "repay" ? !quoteApproved : false;
  const busy = stage !== "idle";
  const deployed = hasVaultDeployment();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || busy || !deployed) return;
    setError(null);
    if (needsApproval) {
      setError(`Approve ${action === "deposit" ? "vWETH" : "vUSDC"} first.`);
      return;
    }
    if (chainId !== sepolia.id) {
      try {
        await switchChainAsync({ chainId: sepolia.id });
      } catch (err) {
        setError("Switch to Sepolia: " + (err as Error).message);
        return;
      }
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a positive number.");
      return;
    }
    try {
      setStage("encrypting");
      const result = await encrypt.mutateAsync({
        values: [{ value: BigInt(Math.floor(n)), type: "euint64" }],
        contractAddress: VEIL_VAULT_ADDRESS as Address,
        userAddress: address,
      });
      const toHex = (v: Uint8Array | `0x${string}`) => (typeof v === "string" ? v : bytesToHex(v));
      setStage("submitting");
      const hash = await writeContractAsync({
        chainId: sepolia.id,
        address: VEIL_VAULT_ADDRESS as Address,
        abi: veilLendingVaultAbi,
        functionName: action,
        args: [toHex(result.handles[0]), toHex(result.inputProof)],
        gas: 5_000_000n,
      });
      setStage("confirming");
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error(`${action} reverted`);
      onSuccess(action);
    } catch (err) {
      console.error(`vault ${action} failed`, err);
      const msg = (err as Error)?.message ?? String(err);
      setError(msg.length > 280 ? msg.slice(0, 280) + "…" : msg);
    } finally {
      setStage("idle");
    }
  }

  const labels: Record<Action, { title: string; cta: string; symbol: string }> = {
    deposit: { title: "Deposit", cta: "Encrypt + deposit", symbol: "vWETH" },
    withdraw: { title: "Withdraw", cta: "Encrypt + withdraw", symbol: "vWETH" },
    borrow: { title: "Borrow", cta: "Encrypt + borrow", symbol: "vUSDC" },
    repay: { title: "Repay", cta: "Encrypt + repay", symbol: "vUSDC" },
  };
  const l = labels[action];

  return (
    <form onSubmit={submit} className="veil-panel p-[18px] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[14px] font-semibold m-0">{l.title}</h4>
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--faint)]">{l.symbol}</span>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">Amount</span>
        <input
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
          className="h-9 px-3 rounded-md bg-[var(--bg3)] border border-[var(--line)] text-[var(--text)] font-[var(--font-mono)] text-[13px] focus:outline-none focus:border-[var(--accent)]"
        />
      </label>
      <Btn type="submit" variant="primary" size="sm" disabled={busy}>
        {stage === "encrypting"
          ? "Encrypting…"
          : stage === "submitting"
            ? "Submitting…"
            : stage === "confirming"
              ? "Confirming…"
              : l.cta}
      </Btn>
      {error && (
        <span className="text-[11px] text-[var(--sell)] font-[var(--font-mono)] break-all">{error}</span>
      )}
    </form>
  );
}

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

export function VaultApp() {
  const { address } = useAccount();
  const { data: baseApproved } = useOperator(VEIL_BASE_ADDRESS as Address, address);
  const { data: quoteApproved } = useOperator(VEIL_QUOTE_ADDRESS as Address, address);
  const { data: collateralHandle, refetch: refetchColl } = useHandle("getCollateral", address);
  const { data: debtHandle, refetch: refetchDebt } = useHandle("getDebt", address);

  const { data: priceRaw } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_VAULT_ADDRESS as Address,
    abi: veilLendingVaultAbi,
    functionName: "price",
    query: { enabled: hasVaultDeployment() },
  });
  const { data: ltvRaw } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_VAULT_ADDRESS as Address,
    abi: veilLendingVaultAbi,
    functionName: "ltvBps",
    query: { enabled: hasVaultDeployment() },
  });

  const price = priceRaw ? Number(priceRaw) : 3400;
  const ltvBps = ltvRaw ? Number(ltvRaw) : 7500;

  const [revealArmed, setRevealArmed] = useState(false);
  const [collateral, setCollateral] = useState<number | null>(null);
  const [debt, setDebt] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handles = useMemo(() => {
    if (!revealArmed) return [];
    const acc: Array<{ handle: `0x${string}`; contractAddress: Address }> = [];
    if (collateralHandle && collateralHandle !== ZERO_HANDLE) {
      acc.push({ handle: collateralHandle as `0x${string}`, contractAddress: VEIL_VAULT_ADDRESS as Address });
    }
    if (debtHandle && debtHandle !== ZERO_HANDLE) {
      acc.push({ handle: debtHandle as `0x${string}`, contractAddress: VEIL_VAULT_ADDRESS as Address });
    }
    return acc;
  }, [revealArmed, collateralHandle, debtHandle]);

  const decryptQuery = useUserDecrypt({ handles }, { enabled: revealArmed && handles.length > 0 });

  useEffect(() => {
    if (!revealArmed) return;
    if (decryptQuery.data) {
      const c =
        collateralHandle && collateralHandle !== ZERO_HANDLE
          ? decryptQuery.data[collateralHandle as `0x${string}`]
          : 0n;
      const d =
        debtHandle && debtHandle !== ZERO_HANDLE ? decryptQuery.data[debtHandle as `0x${string}`] : 0n;
      setCollateral(typeof c === "bigint" ? Number(c) : Number(c ?? 0));
      setDebt(typeof d === "bigint" ? Number(d) : Number(d ?? 0));
      setRevealArmed(false);
    } else if (decryptQuery.isError) {
      setRevealArmed(false);
    }
  }, [revealArmed, decryptQuery.data, decryptQuery.isError, collateralHandle, debtHandle]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const onSuccess = useCallback(
    (a: Action) => {
      flash(`${a[0].toUpperCase()}${a.slice(1)} sealed in vault`);
      refetchColl();
      refetchDebt();
      setCollateral(null);
      setDebt(null);
    },
    [flash, refetchColl, refetchDebt],
  );

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

      <div className="flex-1 max-w-[1200px] w-full mx-auto px-6 pt-[26px] pb-16 flex flex-col gap-[22px]">
        {address && (
          <div className="veil-panel p-4 flex flex-wrap items-center gap-3">
            <span className="text-[11px] uppercase tracking-[0.1em] text-[var(--faint)] mr-auto">Vault operator</span>
            <ApproveChip symbol="vWETH" token={VEIL_BASE_ADDRESS as Address} approved={!!baseApproved} />
            <ApproveChip symbol="vUSDC" token={VEIL_QUOTE_ADDRESS as Address} approved={!!quoteApproved} />
          </div>
        )}

        <PositionPanel
          collateral={collateral}
          debt={debt}
          ltvBps={ltvBps}
          price={price}
          onReveal={() => setRevealArmed(true)}
          revealing={revealArmed}
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ActionForm action="deposit" baseApproved={!!baseApproved} quoteApproved={!!quoteApproved} onSuccess={onSuccess} />
          <ActionForm action="withdraw" baseApproved={!!baseApproved} quoteApproved={!!quoteApproved} onSuccess={onSuccess} />
          <ActionForm action="borrow" baseApproved={!!baseApproved} quoteApproved={!!quoteApproved} onSuccess={onSuccess} />
          <ActionForm action="repay" baseApproved={!!baseApproved} quoteApproved={!!quoteApproved} onSuccess={onSuccess} />
        </div>

        <div className="veil-panel p-[18px]">
          <h4 className="text-[14px] font-semibold m-0 mb-2">How this works</h4>
          <ul className="text-[12.5px] text-[var(--dim)] leading-[1.6] font-[var(--font-mono)] m-0 pl-4 list-disc">
            <li>Deposit vWETH as collateral. Borrow vUSDC up to {(ltvBps / 100).toFixed(0)}% of the encrypted collateral value at {price} vUSDC/vWETH.</li>
            <li>Each call encrypts the amount in the browser. The vault tracks your collateral and debt as ciphertexts.</li>
            <li>If the request exceeds your encrypted limits, the contract silently clamps the move to 0 — no leakage about your position.</li>
            <li>Liquidation is permissionless: a keeper calls <code>liquidate(borrower)</code>; the vault does the unhealthy check homomorphically.</li>
          </ul>
        </div>
      </div>

      {toast && (
        <div className="veil-toast-in fixed bottom-7 left-1/2 -translate-x-1/2 z-[200] inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--line2)] text-sm shadow-[0_20px_50px_-16px_rgba(0,0,0,0.7)]">
          <Icon name="lock" size={14} className="text-[var(--accent)]" />
          {toast}
        </div>
      )}
    </div>
  );
}
