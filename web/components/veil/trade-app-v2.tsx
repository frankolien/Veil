"use client";

import { useCallback, useEffect, useState } from "react";
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
import { bytesToHex, parseEventLogs, type Address } from "viem";
import { OrderBook, type Lifecycle } from "./orderbook";
import { Btn, Cipher, EthereumMark, Icon, Pill, Redacted, Wordmark } from "./primitives";
import { VeilNav } from "./nav";
import { LastClearedPanel } from "./last-cleared";
import { ToastView, useToast } from "./toast";
import { StartHere } from "./start-here";
import { WrongChainGate } from "./wrong-chain-gate";
import { AdvanceBatchPanel } from "./advance-batch";
import { Tip } from "./tip";
import { GLOSSARY } from "./glossary";
import { ConnectChip } from "./connect-chip";
import { formatError } from "@/lib/format-error";
import { veilV2Abi, confidentialTokenAbi } from "@/lib/abi-v2";
import { veilLendingVaultAbi } from "@/lib/abi-vault";
import {
  VEIL_V2_ADDRESS,
  VEIL_BASE_ADDRESS,
  VEIL_QUOTE_ADDRESS,
  VEIL_VAULT_ADDRESS,
  hasVeilV2Deployment,
  hasVaultDeployment,
  shortAddr,
} from "@/lib/config";
import { useV2Lifecycle } from "@/lib/use-v2-lifecycle";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const OPERATOR_TTL_SECS = 60 * 60 * 24;

type MyOrderStatus = "sealed" | "fillReady" | "decrypting" | "filled" | "nofill" | "settling" | "settled";

type MyOrder = {
  id: number;
  batchId: number;
  orderIdx?: number;
  side: "buy" | "sell";
  tickIdx: number;
  price: number;
  size: number;
  status: MyOrderStatus;
  revealed: boolean;
  fill?: number;
  txHash?: `0x${string}`;
};

function useOperatorStatus(token: Address, holder: Address | undefined) {
  return useReadContract({
    chainId: sepolia.id,
    address: token,
    abi: confidentialTokenAbi,
    functionName: "isOperator",
    args: holder ? [holder, VEIL_V2_ADDRESS as Address] : undefined,
    query: { enabled: !!holder, refetchInterval: 6000 },
  });
}

function useBalanceHandle(token: Address, holder: Address | undefined) {
  return useReadContract({
    chainId: sepolia.id,
    address: token,
    abi: confidentialTokenAbi,
    functionName: "confidentialBalanceOf",
    args: holder ? [holder] : undefined,
    query: { enabled: !!holder, refetchInterval: 8000 },
  });
}

function ApproveRow({
  symbol,
  token,
  approved,
}: {
  symbol: string;
  token: Address;
  approved: boolean;
}) {
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);

  async function approve() {
    if (busy || approved) return;
    setBusy(true);
    try {
      const until = Math.floor(Date.now() / 1000) + OPERATOR_TTL_SECS;
      const tx = await writeContractAsync({
        chainId: sepolia.id,
        address: token,
        abi: confidentialTokenAbi,
        functionName: "setOperator",
        args: [VEIL_V2_ADDRESS as Address, until],
      });
      await waitForTransactionReceipt(config, { hash: tx });
    } catch (err) {
      console.error("setOperator failed:", err);
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

function BalanceCell({ symbol, value }: { symbol: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-1.5 border border-[var(--line)] rounded-md bg-[var(--bg3)]">
      <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">{symbol}</span>
      <span className="font-[var(--font-mono)] text-[13px] text-[var(--text)] tabular-nums">
        {value === null ? "—" : value.toLocaleString()}
      </span>
    </div>
  );
}

function OperatorBar({
  baseApproved,
  quoteApproved,
  baseBalance,
  quoteBalance,
  onReveal,
  revealing,
  revealed,
}: {
  baseApproved: boolean;
  quoteApproved: boolean;
  baseBalance: number | null;
  quoteBalance: number | null;
  onReveal: () => void;
  revealing: boolean;
  revealed: boolean;
}) {
  return (
    <div className="veil-panel p-4 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 mr-auto">
        <span className="text-[11px] uppercase tracking-[0.1em] text-[var(--faint)]">Account</span>
        <ApproveRow symbol="vWETH" token={VEIL_BASE_ADDRESS as Address} approved={baseApproved} />
        <ApproveRow symbol="vUSDC" token={VEIL_QUOTE_ADDRESS as Address} approved={quoteApproved} />
      </div>
      <BalanceCell symbol="vWETH" value={baseBalance} />
      <BalanceCell symbol="vUSDC" value={quoteBalance} />
      <button
        type="button"
        onClick={onReveal}
        disabled={revealing}
        className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2.5 py-1.5 rounded-md text-[var(--accent)] border border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] transition-colors disabled:opacity-60"
      >
        <Icon name="key" size={11} />
        {revealing ? "Decrypting…" : revealed ? "Refresh" : "Reveal balances"}
      </button>
    </div>
  );
}

function VaultMarginToggle({
  enabled,
  onChange,
  vaultOperator,
  onVaultOperatorChanged,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  vaultOperator: boolean;
  onVaultOperatorChanged: () => void;
}) {
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);

  async function approveVault() {
    if (busy || vaultOperator) return;
    setBusy(true);
    try {
      const until = Math.floor(Date.now() / 1000) + OPERATOR_TTL_SECS;
      const hash = await writeContractAsync({
        chainId: sepolia.id,
        address: VEIL_VAULT_ADDRESS as Address,
        abi: veilLendingVaultAbi,
        functionName: "setOperator",
        args: [VEIL_V2_ADDRESS as Address, until],
      });
      await waitForTransactionReceipt(config, { hash });
      onVaultOperatorChanged();
    } catch (err) {
      console.error("vault setOperator failed", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 px-3.5 py-3 bg-[var(--bg3)] rounded-[9px] border border-[var(--line)]">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer text-[12px] text-[var(--text)] font-[var(--font-mono)]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Use vault collateral
        </label>
        {enabled && !vaultOperator && (
          <button
            type="button"
            onClick={approveVault}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2.5 py-1 rounded-md text-[var(--text)] border border-[var(--line2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-60"
          >
            <Icon name="lock" size={11} />
            {busy ? "Signing…" : "Approve vault"}
          </button>
        )}
        {enabled && vaultOperator && (
          <span className="ml-auto text-[11px] font-[var(--font-mono)] text-[var(--accent)]">vault approved</span>
        )}
      </div>
      <p className="text-[11px] leading-[1.55] text-[var(--dim)] font-[var(--font-mono)] m-0">
        Compose the lending vault into this trade. Your encrypted vWETH collateral is pulled directly from the vault
        and escrowed in Veil — your wallet vWETH balance is untouched. Unfilled size returns straight to vault
        collateral on settle. <span className="text-[var(--accent)]">This is the moat: encrypted state from one
        contract flowing into another, no decrypt in between.</span>
      </p>
    </div>
  );
}

function OrderTicket({
  life,
  baseApproved,
  quoteApproved,
  onPlace,
}: {
  life: Lifecycle;
  baseApproved: boolean;
  quoteApproved: boolean;
  onPlace: (o: {
    side: "buy" | "sell";
    tickIdx: number;
    price: number;
    size: number;
    txHash?: `0x${string}`;
    orderIdx?: number;
  }) => void;
}) {
  const { book, phase } = life;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [tickIdx, setTickIdx] = useState(2);
  const [size, setSize] = useState("100");
  const [useVault, setUseVault] = useState(false);
  const [stage, setStage] = useState<"idle" | "encrypting" | "submitting" | "confirming">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { address } = useAccount();
  const chainId = useChainId();
  const config = useConfig();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const deployed = hasVeilV2Deployment();
  const vaultLive = hasVaultDeployment();
  const encrypt = useEncrypt();
  const { writeContractAsync } = useWriteContract();

  const { data: vaultOperator, refetch: refetchVaultOp } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_VAULT_ADDRESS as Address,
    abi: veilLendingVaultAbi,
    functionName: "isOperator",
    args: address ? [address, VEIL_V2_ADDRESS as Address] : undefined,
    query: { enabled: !!address && vaultLive, refetchInterval: 6000 },
  });

  const open = phase === "open";
  const onSepolia = chainId === sepolia.id;
  const composeSell = side === "sell" && useVault && vaultLive;
  const requiredApproved = composeSell ? !!vaultOperator : side === "buy" ? quoteApproved : baseApproved;
  const busy = stage !== "idle" || switching;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !open || busy || !deployed) return;
    setErrorMsg(null);

    if (!requiredApproved) {
      setErrorMsg(
        composeSell
          ? "Approve Veil to spend your vault collateral first."
          : `Approve ${side === "buy" ? "vUSDC" : "vWETH"} first (top of page).`,
      );
      return;
    }

    if (!onSepolia) {
      try {
        await switchChainAsync({ chainId: sepolia.id });
      } catch (err) {
        setErrorMsg("Switch MetaMask to Sepolia to submit: " + formatError(err));
        return;
      }
    }

    try {
      setStage("encrypting");
      const result = await encrypt.mutateAsync({
        values: [
          { value: side === "buy", type: "ebool" },
          { value: BigInt(tickIdx), type: "euint8" },
          { value: BigInt(size), type: "euint64" },
        ],
        contractAddress: VEIL_V2_ADDRESS as Address,
        userAddress: address,
      });
      setStage("submitting");
      const toHex = (v: Uint8Array | `0x${string}`) =>
        typeof v === "string" ? v : bytesToHex(v);
      const txHash = composeSell
        ? await writeContractAsync({
            chainId: sepolia.id,
            address: VEIL_V2_ADDRESS as Address,
            abi: veilV2Abi,
            functionName: "placeOrderFromVault",
            args: [
              toHex(result.handles[0]),
              toHex(result.handles[1]),
              toHex(result.handles[2]),
              toHex(result.inputProof),
              VEIL_VAULT_ADDRESS as Address,
            ],
            gas: 20_000_000n,
          })
        : await writeContractAsync({
            chainId: sepolia.id,
            address: VEIL_V2_ADDRESS as Address,
            abi: veilV2Abi,
            functionName: "placeOrder",
            args: [
              toHex(result.handles[0]),
              toHex(result.handles[1]),
              toHex(result.handles[2]),
              toHex(result.inputProof),
            ],
            gas: 18_000_000n,
          });
      setStage("confirming");
      const receipt = await waitForTransactionReceipt(config, { hash: txHash });
      if (receipt.status !== "success") {
        throw new Error(`placeOrder reverted on-chain (status=${receipt.status}).`);
      }
      const placed = parseEventLogs({
        abi: veilV2Abi,
        eventName: "OrderPlaced",
        logs: receipt.logs,
      });
      const orderIdx = placed[0] ? Number(placed[0].args.orderIndex) : undefined;
      onPlace({
        side,
        tickIdx,
        price: book.ticks[tickIdx].price,
        size: Number(size) || 0,
        txHash,
        orderIdx,
      });
    } catch (err) {
      console.error("Veil v2 placeOrder failed:", err);
      setErrorMsg(formatError(err));
    } finally {
      setStage("idle");
    }
  }

  const escrowEstimate =
    side === "buy"
      ? Number(size) * (book.ticks[book.ticks.length - 1]?.price ?? 0)
      : Number(size);

  return (
    <form onSubmit={submit} className="veil-panel p-[22px] flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold m-0">Place encrypted order</h3>
        <span className="text-xs text-[var(--faint)] font-[var(--font-mono)] tracking-[0.03em]">
          v2 · side · tick · size sealed locally
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1 bg-[var(--bg3)] rounded-[10px] p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={[
              "h-12 lg:h-10 rounded-[7px] font-[var(--font-display)] font-semibold text-sm capitalize transition-all duration-150",
              side === s
                ? s === "buy"
                  ? "bg-[var(--buy)] text-[var(--accent-ink)]"
                  : "bg-[var(--sell)] text-white"
                : "text-[var(--dim)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {s}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-[13px] text-[var(--dim)]">
          Price <Tip label="tick">{GLOSSARY.tick}</Tip>
        </span>
        <select
          value={tickIdx}
          onChange={(e) => setTickIdx(Number(e.target.value))}
          className="h-12 lg:h-[46px] bg-[var(--bg3)] border border-[var(--line2)] rounded-[10px] text-[var(--text)] font-[var(--font-mono)] text-base lg:text-[15px] px-3.5 outline-none focus:border-[var(--accent)]"
        >
          {life.book.ticks.map((t, i) => (
            <option key={i} value={i}>
              {t.price.toLocaleString()} vUSDC / vWETH
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-[13px] text-[var(--dim)]">Size</span>
        <input
          type="number"
          min="1"
          step="1"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="h-12 lg:h-[46px] bg-[var(--bg3)] border border-[var(--line2)] rounded-[10px] text-[var(--text)] font-[var(--font-mono)] text-base lg:text-[15px] px-3.5 outline-none focus:border-[var(--accent)]"
        />
      </label>

      {side === "sell" && vaultLive && (
        <VaultMarginToggle
          enabled={useVault}
          onChange={setUseVault}
          vaultOperator={!!vaultOperator}
          onVaultOperatorChanged={refetchVaultOp}
        />
      )}

      <div className="flex items-center gap-2 text-xs text-[var(--faint)] font-[var(--font-mono)] px-3.5 py-3 bg-[var(--bg3)] rounded-[9px]">
        <Icon name="lock" size={13} className="text-[var(--accent)] flex-none" />
        <span>escrows</span>
        <span className="text-[var(--text)] tabular-nums">{escrowEstimate.toLocaleString()}</span>
        <span>{side === "buy" ? "vUSDC" : "vWETH"}</span>
        {composeSell && <span className="text-[var(--accent)]">· from vault collateral</span>}
        <span className="text-[var(--faint)]">(at max tick)</span>
      </div>

      <Btn
        type="submit"
        variant="primary"
        size="block"
        disabled={!address || busy || !open || !requiredApproved}
        className={busy ? "opacity-70" : ""}
      >
        {switching
          ? "Switching to Sepolia…"
          : stage === "encrypting"
            ? "Encrypting order…"
            : stage === "submitting"
              ? "Pulling escrow…"
              : stage === "confirming"
                ? "Waiting for confirmation…"
                : !address
                  ? "Connect wallet to trade"
                  : !open
                    ? "Batch closed — wait for next"
                    : !requiredApproved
                      ? `Approve ${side === "buy" ? "vUSDC" : "vWETH"} first`
                      : !onSepolia
                        ? "Switch to Sepolia & submit"
                        : "Encrypt & submit sealed bid"}
      </Btn>

      {errorMsg && (
        <div className="text-[12px] leading-[1.5] text-[var(--sell)] font-[var(--font-mono)] break-all px-3 py-2.5 border border-[color-mix(in_oklab,var(--sell)_35%,transparent)] bg-[color-mix(in_oklab,var(--sell)_8%,transparent)] rounded-[8px]">
          <span className="font-semibold text-[var(--sell)] mr-1.5">Error:</span>
          {errorMsg}
        </div>
      )}
    </form>
  );
}

function OrderRow({
  order,
  onUpdate,
  onBalanceChanged,
  onSettleSuccess,
}: {
  order: MyOrder;
  onUpdate: (id: number, patch: Partial<MyOrder>) => void;
  onBalanceChanged: () => void;
  onSettleSuccess: (txHash: `0x${string}`, fill: number, side: "buy" | "sell") => void;
}) {
  const o = order;
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const hasOnchain = o.orderIdx !== undefined;
  const [decryptArmed, setDecryptArmed] = useState(false);

  const { data: batchStateTuple } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as Address,
    abi: veilV2Abi,
    functionName: "getBatchState",
    args: [BigInt(o.batchId)],
    query: { enabled: hasOnchain, refetchInterval: 4000 },
  });

  const batchState = batchStateTuple
    ? Number((batchStateTuple as readonly [bigint, bigint, number, number])[2])
    : -1;
  const cleared = batchState === 2;

  const { data: fillHandle } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as Address,
    abi: veilV2Abi,
    functionName: "getOrderFill",
    args:
      hasOnchain && cleared && o.orderIdx !== undefined
        ? [BigInt(o.batchId), BigInt(o.orderIdx)]
        : undefined,
    query: { enabled: hasOnchain && cleared && o.orderIdx !== undefined },
  });

  const { data: settledOnChain } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_V2_ADDRESS as Address,
    abi: veilV2Abi,
    functionName: "isOrderSettled",
    args:
      hasOnchain && o.orderIdx !== undefined ? [BigInt(o.batchId), BigInt(o.orderIdx)] : undefined,
    query: { enabled: hasOnchain && o.orderIdx !== undefined, refetchInterval: 5000 },
  });

  const decryptQuery = useUserDecrypt(
    {
      handles:
        decryptArmed && fillHandle && fillHandle !== ZERO_HANDLE
          ? [{ handle: fillHandle as `0x${string}`, contractAddress: VEIL_V2_ADDRESS as Address }]
          : [],
    },
    { enabled: decryptArmed && !!fillHandle && fillHandle !== ZERO_HANDLE },
  );

  useEffect(() => {
    if (cleared && o.status === "sealed") onUpdate(o.id, { status: "fillReady" });
  }, [cleared, o.status, o.id, onUpdate]);

  useEffect(() => {
    if (settledOnChain && o.status !== "settled") onUpdate(o.id, { status: "settled" });
  }, [settledOnChain, o.status, o.id, onUpdate]);

  useEffect(() => {
    if (!decryptArmed) return;
    if (decryptQuery.data && fillHandle) {
      const raw = decryptQuery.data[fillHandle as `0x${string}`];
      const v = typeof raw === "bigint" ? Number(raw) : Number(raw ?? 0);
      onUpdate(o.id, {
        status: v > 0 ? "filled" : "nofill",
        revealed: true,
        fill: v,
      });
      setDecryptArmed(false);
    } else if (decryptQuery.isError) {
      onUpdate(o.id, { status: "fillReady" });
      setDecryptArmed(false);
    }
  }, [decryptArmed, decryptQuery.data, decryptQuery.isError, fillHandle, o.id, onUpdate]);

  function startDecrypt() {
    onUpdate(o.id, { status: "decrypting" });
    setDecryptArmed(true);
  }

  async function startSettle() {
    if (o.orderIdx === undefined) return;
    onUpdate(o.id, { status: "settling" });
    try {
      const tx = await writeContractAsync({
        chainId: sepolia.id,
        address: VEIL_V2_ADDRESS as Address,
        abi: veilV2Abi,
        functionName: "settle",
        args: [BigInt(o.batchId), BigInt(o.orderIdx)],
        gas: 12_000_000n,
      });
      await waitForTransactionReceipt(config, { hash: tx });
      onUpdate(o.id, { status: "settled" });
      onSettleSuccess(tx, o.fill ?? 0, o.side);
      onBalanceChanged();
    } catch (err) {
      console.error("settle failed:", err);
      onUpdate(o.id, { status: o.fill && o.fill > 0 ? "filled" : "nofill" });
    }
  }

  return (
    <div className="veil-order-in grid grid-cols-[auto_auto_1fr_auto] gap-3 items-center px-3.5 py-3 border border-[var(--line)] rounded-[10px] bg-[color-mix(in_oklab,var(--bg3)_60%,transparent)]">
      <span
        className={[
          "font-[var(--font-mono)] text-[11px] uppercase tracking-[0.08em] px-2 py-px rounded-[5px]",
          o.side === "buy"
            ? "text-[var(--buy)] bg-[color-mix(in_oklab,var(--buy)_14%,transparent)]"
            : "text-[var(--sell)] bg-[color-mix(in_oklab,var(--sell)_14%,transparent)]",
        ].join(" ")}
      >
        {o.side}
      </span>
      <span className="font-[var(--font-mono)] text-[13px] text-[var(--text)]">
        {o.price.toLocaleString()}
      </span>
      <span className="font-[var(--font-mono)] text-[13px] text-[var(--dim)]">
        <Redacted revealed={o.revealed} len={4}>
          {o.size}
        </Redacted>
      </span>
      <span className="justify-self-end flex items-center gap-1.5">
        {o.status === "sealed" && (
          <span className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2 py-1 rounded-md text-[var(--dim)] bg-[var(--bg3)]">
            <Icon name="lock" size={11} />
            sealed
          </span>
        )}
        {o.status === "fillReady" && (
          <button
            type="button"
            onClick={startDecrypt}
            className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2 py-1 rounded-md text-[var(--accent)] border border-[color-mix(in_oklab,var(--accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent)_22%,transparent)] transition-colors"
          >
            <Icon name="key" size={11} />
            decrypt fill
          </button>
        )}
        {o.status === "decrypting" && (
          <span className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2 py-1 rounded-md text-[var(--dim)] bg-[var(--bg3)]">
            decrypting
            <Cipher len={3} active className="text-[var(--accent)] ml-0.5" />
          </span>
        )}
        {(o.status === "filled" || o.status === "nofill") && (
          <span
            className={[
              "inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2 py-1 rounded-md",
              o.status === "filled"
                ? "text-[var(--accent-ink)] bg-[var(--accent)]"
                : "text-[var(--faint)] border border-[var(--line2)]",
            ].join(" ")}
          >
            <Icon name={o.status === "filled" ? "check" : "lock"} size={11} />
            {o.status === "filled" ? `filled ${o.fill}` : "no fill"}
          </span>
        )}
        {(o.status === "filled" || o.status === "nofill") && (
          <button
            type="button"
            onClick={startSettle}
            className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2 py-1 rounded-md text-[var(--text)] border border-[var(--line2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            settle
          </button>
        )}
        {o.status === "settling" && (
          <span className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2 py-1 rounded-md text-[var(--dim)] bg-[var(--bg3)]">
            settling…
          </span>
        )}
        {o.status === "settled" && (
          <span className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2 py-1 rounded-md text-[var(--accent-ink)] bg-[var(--accent)]">
            <Icon name="check" size={11} />
            settled
          </span>
        )}
      </span>
    </div>
  );
}

function MyOrders({
  orders,
  onUpdate,
  onBalanceChanged,
  onSettleSuccess,
}: {
  orders: MyOrder[];
  onUpdate: (id: number, patch: Partial<MyOrder>) => void;
  onBalanceChanged: () => void;
  onSettleSuccess: (txHash: `0x${string}`, fill: number, side: "buy" | "sell") => void;
}) {
  if (!orders.length) {
    return (
      <div className="veil-panel px-[22px] py-5">
        <h3 className="text-[15px] font-semibold m-0 mb-2">Your orders</h3>
        <p className="text-[13px] text-[var(--dim)] leading-[1.5] m-0">
          No sealed bids yet. Order intent and fill stay encrypted end-to-end.
        </p>
      </div>
    );
  }
  return (
    <div className="veil-panel px-[22px] py-5">
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="text-[15px] font-semibold m-0">Your orders</h3>
        <span className="font-[var(--font-mono)] text-[13px] text-[var(--faint)]">
          {orders.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {orders.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            onUpdate={onUpdate}
            onBalanceChanged={onBalanceChanged}
            onSettleSuccess={onSettleSuccess}
          />
        ))}
      </div>
    </div>
  );
}

export function TradeAppV2() {
  const life = useV2Lifecycle();
  const { phase, batchId, book, blocksLeft, orders: orderCount } = life;
  const { address } = useAccount();

  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const { toast, flash } = useToast();
  const oidRef = useState({ current: 0 })[0];

  const { data: baseApproved } = useOperatorStatus(VEIL_BASE_ADDRESS as Address, address);
  const { data: quoteApproved } = useOperatorStatus(VEIL_QUOTE_ADDRESS as Address, address);
  const { data: baseBalanceHandle, refetch: refetchBaseBalance } = useBalanceHandle(
    VEIL_BASE_ADDRESS as Address,
    address,
  );
  const { data: quoteBalanceHandle, refetch: refetchQuoteBalance } = useBalanceHandle(
    VEIL_QUOTE_ADDRESS as Address,
    address,
  );

  const [revealArmed, setRevealArmed] = useState(false);
  const [baseBalance, setBaseBalance] = useState<number | null>(null);
  const [quoteBalance, setQuoteBalance] = useState<number | null>(null);

  const balanceDecryptHandles = revealArmed
    ? [
        ...(baseBalanceHandle && baseBalanceHandle !== ZERO_HANDLE
          ? [{ handle: baseBalanceHandle as `0x${string}`, contractAddress: VEIL_BASE_ADDRESS as Address }]
          : []),
        ...(quoteBalanceHandle && quoteBalanceHandle !== ZERO_HANDLE
          ? [{ handle: quoteBalanceHandle as `0x${string}`, contractAddress: VEIL_QUOTE_ADDRESS as Address }]
          : []),
      ]
    : [];

  const balanceQuery = useUserDecrypt(
    { handles: balanceDecryptHandles },
    { enabled: revealArmed && balanceDecryptHandles.length > 0 },
  );

  // Empty-handles short-circuit: if reveal armed but no balances yet, skip the
  // SDK call (it would never fire) and just write zeros.
  useEffect(() => {
    if (!revealArmed) return;
    const baseEmpty = !baseBalanceHandle || baseBalanceHandle === ZERO_HANDLE;
    const quoteEmpty = !quoteBalanceHandle || quoteBalanceHandle === ZERO_HANDLE;
    if (baseEmpty && quoteEmpty) {
      setBaseBalance(0);
      setQuoteBalance(0);
      setRevealArmed(false);
    }
  }, [revealArmed, baseBalanceHandle, quoteBalanceHandle]);

  useEffect(() => {
    if (!revealArmed) return;
    if (balanceQuery.data) {
      const baseRaw =
        baseBalanceHandle && baseBalanceHandle !== ZERO_HANDLE
          ? balanceQuery.data[baseBalanceHandle as `0x${string}`]
          : 0n;
      const quoteRaw =
        quoteBalanceHandle && quoteBalanceHandle !== ZERO_HANDLE
          ? balanceQuery.data[quoteBalanceHandle as `0x${string}`]
          : 0n;
      setBaseBalance(typeof baseRaw === "bigint" ? Number(baseRaw) : Number(baseRaw ?? 0));
      setQuoteBalance(typeof quoteRaw === "bigint" ? Number(quoteRaw) : Number(quoteRaw ?? 0));
      setRevealArmed(false);
    } else if (balanceQuery.isError) {
      console.error("useUserDecrypt (balances) failed:", balanceQuery.error);
      flash({ message: `Reveal failed: ${formatError(balanceQuery.error)}`, tone: "error" });
      setRevealArmed(false);
    }
  }, [revealArmed, balanceQuery.data, balanceQuery.isError, balanceQuery.error, baseBalanceHandle, quoteBalanceHandle, flash]);

  // 45s safety timeout in case the SDK hangs (relayer down / sig stuck).
  useEffect(() => {
    if (!revealArmed) return;
    const timer = setTimeout(() => {
      console.warn("useUserDecrypt (balances) timed out after 45s — resetting.");
      flash({ message: "Reveal timed out. Check the Zama relayer and try again.", tone: "error" });
      setRevealArmed(false);
    }, 45_000);
    return () => clearTimeout(timer);
  }, [revealArmed, flash]);

  function place(o: {
    side: "buy" | "sell";
    tickIdx: number;
    price: number;
    size: number;
    txHash?: `0x${string}`;
    orderIdx?: number;
  }) {
    oidRef.current += 1;
    setMyOrders((prev) =>
      [
        {
          id: oidRef.current,
          batchId,
          status: "sealed" as MyOrderStatus,
          revealed: false,
          ...o,
        },
        ...prev,
      ].slice(0, 6),
    );
    flash({
      message: `Sealed bid escrowed in batch #${batchId}. View on Sepolia:`,
      tone: "success",
      txHash: o.txHash,
    });
    refetchBaseBalance();
    refetchQuoteBalance();
    setBaseBalance(null);
    setQuoteBalance(null);
  }

  const updateOrder = useCallback((id: number, patch: Partial<MyOrder>) => {
    setMyOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  function onBalanceChanged() {
    refetchBaseBalance();
    refetchQuoteBalance();
    setBaseBalance(null);
    setQuoteBalance(null);
  }

  function onSettleSuccess(txHash: `0x${string}`, fill: number, side: "buy" | "sell") {
    const symbol = side === "buy" ? "vWETH" : "vUSDC";
    const msg =
      fill > 0
        ? `Settled — received ${fill.toLocaleString()} ${symbol}. View on Sepolia:`
        : "Settled — no fill, escrow refunded. View on Sepolia:";
    flash({ message: msg, tone: "success", txHash });
  }

  const statusTone = phase === "open" ? "buy" : phase === "cleared" ? "accent" : "warn";

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
          <span className="hidden md:inline-flex font-[var(--font-mono)] text-[13px] text-[var(--dim)] px-3 py-1.5 border border-[var(--line)] rounded-md">
            vWETH / vUSDC
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-[18px]">
          <span className="hidden sm:inline-flex items-center gap-2 text-[13px] text-[var(--dim)] font-[var(--font-mono)]">
            <EthereumMark className="text-[var(--accent)] drop-shadow-[0_0_6px_var(--glow)]" />
            Sepolia
          </span>
          <ConnectChip />
        </div>
      </header>

      <div className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 pt-[26px] pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-16 flex flex-col gap-[22px]">
        <WrongChainGate />
        <AdvanceBatchPanel batchId={batchId} />
        {address && (
          <StartHere
            storageKey="veil.starthere.trade"
            steps={[
              {
                title: "Approve vWETH and vUSDC",
                body: "One-time operator grant so Veil can pull your encrypted escrow when you place an order.",
                done: !!baseApproved && !!quoteApproved,
              },
              {
                title: "Reveal your encrypted balances",
                body: "Decrypts the ERC-7984 balance handles locally so you can size orders sensibly. Nothing is revealed on-chain.",
                done: baseBalance !== null || quoteBalance !== null,
              },
              {
                title: "Place a sealed order",
                body: "Side, tick, and size are encrypted in the browser. Escrow is pulled inside the same tx.",
                done: myOrders.length > 0,
              },
              {
                title: "Settle after the batch clears",
                body: "Once the keeper closes + clears the batch, hit Settle on your order row to release filled + unfilled sides.",
                done: myOrders.some((o) => o.status === "settled"),
              },
            ]}
          />
        )}
        {address && (
          <OperatorBar
            baseApproved={!!baseApproved}
            quoteApproved={!!quoteApproved}
            baseBalance={baseBalance}
            quoteBalance={quoteBalance}
            revealing={revealArmed}
            revealed={baseBalance !== null || quoteBalance !== null}
            onReveal={() => setRevealArmed(true)}
          />
        )}

        <div className="flex flex-col-reverse gap-[22px] lg:grid lg:grid-cols-[1fr_380px] lg:items-start">
          <section>
            <div className="veil-panel p-[22px]">
              <div className="veil-panel-glow" />
              <div className="relative flex items-center justify-between mb-[18px]">
                <div className="flex items-baseline gap-2.5">
                  <span className="font-[var(--font-mono)] text-[11px] tracking-[0.2em] text-[var(--faint)]">
                    BATCH
                  </span>
                  <span className="font-[var(--font-mono)] text-[26px] font-medium text-[var(--text)]">
                    #{batchId}
                  </span>
                </div>
                <Pill tone={statusTone} dot>
                  {phase === "open"
                    ? `Open · ${blocksLeft} blocks`
                    : phase === "closing"
                      ? "Closed"
                      : phase === "clearing"
                        ? "Clearing"
                        : `Cleared @ ${book.ticks[book.clearing].price.toLocaleString()}`}
                </Pill>
              </div>
              <OrderBook life={life} rowHeight={46} />
              <div className="relative mt-5 pt-[18px] border-t border-[var(--line)] flex flex-wrap gap-5 sm:gap-10">
                {[
                  ["Orders", String(orderCount)],
                  ["Window", "10 blocks"],
                  ["Tick prices", book.ticks.map((t) => t.price).join(" · ")],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-1.5">
                    <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">
                      {k}
                    </span>
                    <b className="font-[var(--font-mono)] text-base font-medium text-[var(--text)]">
                      {v}
                    </b>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-[18px]">
            <OrderTicket
              life={life}
              baseApproved={!!baseApproved}
              quoteApproved={!!quoteApproved}
              onPlace={place}
            />
            <LastClearedPanel currentBatchId={batchId} />
            <MyOrders
              orders={myOrders}
              onUpdate={updateOrder}
              onBalanceChanged={onBalanceChanged}
              onSettleSuccess={onSettleSuccess}
            />
          </aside>
        </div>
      </div>

      <ToastView toast={toast} />
    </div>
  );
}
