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
import type { ReactNode } from "react";
import { Btn, EthereumMark, Icon, Pill, Wordmark } from "./primitives";
import { VeilNav } from "./nav";
import { ToastView, useToast } from "./toast";
import { StartHere } from "./start-here";
import { Tip } from "./tip";
import { GLOSSARY } from "./glossary";
import { ConnectChip } from "./connect-chip";
import { veilLendingVaultAbi } from "@/lib/abi-vault";
import { confidentialTokenAbi } from "@/lib/abi-v2";
import { formatError } from "@/lib/format-error";
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
      <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4">
        <PositionCell label="Collateral (vWETH)" value={collateral} />
        <PositionCell label="Debt (vUSDC)" value={debt} />
        <PositionCell label="Max borrow (vUSDC)" value={maxBorrow} />
        <PositionCell
          label={<Tip label="Utilization">{GLOSSARY.utilization}</Tip>}
          value={utilization === null ? null : `${utilization}%`}
        />
      </div>
      <div className="mt-5 pt-[18px] border-t border-[var(--line)] flex flex-wrap gap-6 items-center">
        <Cell label="Price" value={`${price.toLocaleString()} vUSDC / vWETH`} />
        <Cell label={<Tip label="LTV">{GLOSSARY.ltv}</Tip>} value={`${(ltvBps / 100).toFixed(0)}%`} />
        <Cell
          label={<Tip label="Health">{GLOSSARY.healthFactor}</Tip>}
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

function PositionCell({ label, value }: { label: ReactNode; value: number | string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">{label}</span>
      <span className="font-[var(--font-mono)] text-[18px] text-[var(--text)] tabular-nums">
        {value === null ? "—" : typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

function Cell({ label, value }: { label: ReactNode; value: string }) {
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
  onSuccess: (a: Action, txHash: `0x${string}`) => void;
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
        gas: 2_500_000n,
      });
      setStage("confirming");
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error(`${action} reverted`);
      onSuccess(action, hash);
    } catch (err) {
      console.error(`vault ${action} failed`, err);
      setError(formatError(err));
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
  const { toast, flash } = useToast();

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

  const onSuccess = useCallback(
    (a: Action, txHash: `0x${string}`) => {
      const verb = { deposit: "Deposited", withdraw: "Withdrew", borrow: "Borrowed", repay: "Repaid" }[a];
      flash({ message: `${verb} confidentially. View on Sepolia:`, tone: "success", txHash });
      refetchColl();
      refetchDebt();
      setCollateral(null);
      setDebt(null);
    },
    [flash, refetchColl, refetchDebt],
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 min-h-16 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] backdrop-blur-[16px]">
        <div className="flex items-center gap-3 sm:gap-[18px] flex-wrap">
          <a
            href="/"
            aria-label="Back to site"
            className="inline-flex items-center gap-1.5 bg-transparent border border-[var(--line2)] text-[var(--dim)] rounded-lg h-[34px] px-2.5 sm:px-3 font-[var(--font-display)] text-[13px] hover:text-[var(--text)] hover:border-[var(--accent)] transition-all"
          >
            <Icon name="arrow" size={16} className="rotate-180" />
            <span className="hidden sm:inline">Site</span>
          </a>
          <Wordmark className="text-base" />
          <VeilNav />
        </div>
        <div className="flex items-center gap-3 sm:gap-[18px]">
          <span className="hidden sm:inline-flex items-center gap-2 text-[13px] text-[var(--dim)] font-[var(--font-mono)]">
            <EthereumMark className="text-[var(--accent)] drop-shadow-[0_0_6px_var(--glow)]" />
            Sepolia
          </span>
          <ConnectChip />
        </div>
      </header>

      <div className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 pt-[26px] pb-16 flex flex-col gap-[22px]">
        {address && (
          <StartHere
            storageKey="veil.starthere.vault"
            steps={[
              {
                title: "Approve vWETH (to deposit)",
                body: "One-time operator grant so the vault can pull your encrypted collateral.",
                done: !!baseApproved,
              },
              {
                title: "Approve vUSDC (to repay)",
                body: "Only needed if you plan to repay borrowed vUSDC. Skip if you only deposit and borrow.",
                done: !!quoteApproved,
              },
              {
                title: "Deposit and borrow",
                body: "Deposit vWETH as collateral, borrow vUSDC up to 75% of the encrypted collateral value (price 3,400 vUSDC/vWETH).",
                done: collateral !== null && collateral > 0,
              },
              {
                title: "Reveal your position",
                body: "User-decrypts your encrypted collateral, debt, and computes max-borrow + utilization locally.",
                done: collateral !== null || debt !== null,
              },
            ]}
          />
        )}
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

      <ToastView toast={toast} />
    </div>
  );
}
