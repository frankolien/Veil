"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useConfig, useConnect, useDisconnect, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { sepolia } from "wagmi/chains";
import { useEncrypt, useUserDecrypt } from "@zama-fhe/react-sdk";
import { bytesToHex, parseEventLogs } from "viem";
import { BatchPanel, OrderBook, type Lifecycle } from "./orderbook";
import { Btn, Cipher, EthereumMark, Icon, Pill, Redacted, Wordmark } from "./primitives";
import { veilAbi } from "@/lib/abi";
import { VEIL_ADDRESS, hasVeilDeployment, shortAddr } from "@/lib/config";
import { useVeilLifecycle } from "@/lib/use-veil-lifecycle";

type MyOrderStatus = "sealed" | "fillReady" | "decrypting" | "filled" | "nofill";
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
  fillAmt?: number;
  fill?: number;
  txHash?: `0x${string}`;
};

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

function OrderTicket({
  life,
  onPlace,
}: {
  life: Lifecycle;
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
  const [tickIdx, setTickIdx] = useState(3);
  const [size, setSize] = useState("100");
  const [stage, setStage] = useState<"idle" | "encrypting" | "submitting" | "confirming">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { address } = useAccount();
  const chainId = useChainId();
  const config = useConfig();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const deployed = hasVeilDeployment();
  const encrypt = useEncrypt();
  const { writeContractAsync } = useWriteContract();

  const open = phase === "open";
  const onSepolia = chainId === sepolia.id;
  const busy = stage !== "idle" || switching;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!address || !open || busy) return;
    setErrorMsg(null);
    if (deployed && !onSepolia) {
      try {
        await switchChainAsync({ chainId: sepolia.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg("Switch MetaMask to Sepolia to submit: " + msg);
        return;
      }
    }
    if (!deployed) {
      setStage("encrypting");
      await new Promise((r) => setTimeout(r, 1200));
      setStage("submitting");
      await new Promise((r) => setTimeout(r, 900));
      onPlace({ side, tickIdx, price: book.ticks[tickIdx].price, size: Number(size) || 0 });
      setStage("idle");
      return;
    }
    try {
      setStage("encrypting");
      const sizeBig = BigInt(size);
      const result = await encrypt.mutateAsync({
        values: [
          { value: side === "buy", type: "ebool" },
          { value: BigInt(tickIdx), type: "euint8" },
          { value: sizeBig, type: "euint64" },
        ],
        contractAddress: VEIL_ADDRESS as `0x${string}`,
        userAddress: address,
      });
      setStage("submitting");
      const toHex = (v: Uint8Array | `0x${string}`) =>
        typeof v === "string" ? v : bytesToHex(v);
      const txHash = await writeContractAsync({
        chainId: sepolia.id,
        address: VEIL_ADDRESS as `0x${string}`,
        abi: veilAbi,
        functionName: "placeOrder",
        args: [
          toHex(result.handles[0]),
          toHex(result.handles[1]),
          toHex(result.handles[2]),
          toHex(result.inputProof),
        ],
        // eth_estimateGas overshoots block-limit on FHE precompiles; ADR-009.
        gas: 15_000_000n,
      });
      setStage("confirming");
      const receipt = await waitForTransactionReceipt(config, { hash: txHash });
      if (receipt.status !== "success") {
        throw new Error(
          `placeOrder reverted on-chain (status=${receipt.status}). ` +
            `The batch may have closed before your tx landed — refresh and retry.`,
        );
      }
      const placed = parseEventLogs({
        abi: veilAbi,
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
      // Zama SDK wraps the real error in `cause`.
      const chain: string[] = [];
      let cur: unknown = err;
      while (cur && chain.length < 5) {
        const m = cur instanceof Error ? cur.message : String(cur);
        chain.push(m);
        cur = cur instanceof Error ? (cur as Error & { cause?: unknown }).cause : undefined;
      }
      const msg = chain.join(" ← ");
      console.error("Veil placeOrder failed:", err);
      setErrorMsg(msg.length > 320 ? msg.slice(0, 320) + "…" : msg);
    } finally {
      setStage("idle");
    }
  }

  return (
    <form
      onSubmit={submit}
      className="veil-panel p-[22px] flex flex-col gap-4"
    >
      <div className="relative">
        <h3 className="text-base font-semibold m-0">Place encrypted order</h3>
        <span className="text-xs text-[var(--faint)] font-[var(--font-mono)] tracking-[0.03em]">
          side · tick · size sealed locally
        </span>
      </div>

      <div className="relative grid grid-cols-2 gap-1 bg-[var(--bg3)] rounded-[10px] p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={[
              "h-10 rounded-[7px] font-[var(--font-display)] font-semibold text-sm capitalize transition-all duration-150",
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

      <label className="relative flex flex-col gap-2">
        <span className="text-[13px] text-[var(--dim)]">Price tick</span>
        <div className="relative flex items-center">
          <select
            value={tickIdx}
            onChange={(e) => setTickIdx(Number(e.target.value))}
            className="w-full h-[46px] bg-[var(--bg3)] border border-[var(--line2)] rounded-[10px] text-[var(--text)] font-[var(--font-mono)] text-[15px] px-3.5 outline-none appearance-none focus:border-[var(--accent)]"
          >
            {book.ticks.map((t, i) => (
              <option key={i} value={i}>
                ${t.price.toLocaleString()}
                {i === book.clearing ? "  · mid" : ""}
              </option>
            ))}
          </select>
          <span className="absolute right-3.5 text-[var(--dim)] pointer-events-none text-xs">▾</span>
        </div>
      </label>

      <label className="relative flex flex-col gap-2">
        <span className="text-[13px] text-[var(--dim)]">Size</span>
        <div className="relative flex items-center">
          <input
            type="number"
            min="1"
            step="1"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="w-full h-[46px] bg-[var(--bg3)] border border-[var(--line2)] rounded-[10px] text-[var(--text)] font-[var(--font-mono)] text-[15px] px-3.5 outline-none focus:border-[var(--accent)]"
          />
          <span className="absolute right-3.5 font-[var(--font-mono)] text-[13px] text-[var(--faint)]">
            cWETH
          </span>
        </div>
      </label>

      <div className="relative flex items-center gap-2 text-xs text-[var(--faint)] font-[var(--font-mono)] px-3.5 py-3 bg-[var(--bg3)] rounded-[9px] overflow-hidden">
        <span className="text-[var(--accent)] flex-none">
          <Icon name="lock" size={13} />
        </span>
        <span>encrypts to</span>
        <span className="veil-enc-blob">
          <Cipher len={18} active />
        </span>
      </div>

      <Btn
        type="submit"
        variant="primary"
        size="block"
        disabled={!address || busy || !open}
        className={busy ? "opacity-70" : ""}
      >
        {switching
          ? "Switching to Sepolia…"
          : stage === "encrypting"
            ? "Encrypting order…"
            : stage === "submitting"
              ? "Sealing on-chain…"
              : stage === "confirming"
                ? "Waiting for confirmation…"
                : !address
                  ? "Connect wallet to trade"
                  : !open
                    ? "Batch closed — wait for next"
                    : deployed && !onSepolia
                      ? "Switch to Sepolia & submit"
                      : "Encrypt & submit sealed bid"}
      </Btn>

      {errorMsg && (
        <div className="relative text-[12px] leading-[1.5] text-[var(--sell)] font-[var(--font-mono)] break-all px-3 py-2.5 border border-[color-mix(in_oklab,var(--sell)_35%,transparent)] bg-[color-mix(in_oklab,var(--sell)_8%,transparent)] rounded-[8px]">
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
}: {
  order: MyOrder;
  onUpdate: (id: number, patch: Partial<MyOrder>) => void;
}) {
  const o = order;
  const hasOnchain = o.orderIdx !== undefined && hasVeilDeployment();
  const [decryptArmed, setDecryptArmed] = useState(false);

  const { data: batchStateTuple } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_ADDRESS as `0x${string}`,
    abi: veilAbi,
    functionName: "getBatchState",
    args: [BigInt(o.batchId)],
    query: {
      enabled: hasOnchain,
      refetchInterval: 4000,
    },
  });

  const batchState = batchStateTuple ? Number((batchStateTuple as readonly [bigint, bigint, number, number])[2]) : -1;
  const cleared = batchState === 2;

  const { data: fillHandle } = useReadContract({
    chainId: sepolia.id,
    address: VEIL_ADDRESS as `0x${string}`,
    abi: veilAbi,
    functionName: "getOrderFill",
    args: hasOnchain && cleared && o.orderIdx !== undefined ? [BigInt(o.batchId), BigInt(o.orderIdx)] : undefined,
    query: { enabled: hasOnchain && cleared && o.orderIdx !== undefined },
  });

  const decryptQuery = useUserDecrypt(
    {
      handles:
        decryptArmed && fillHandle && fillHandle !== ZERO_HANDLE
          ? [{ handle: fillHandle as `0x${string}`, contractAddress: VEIL_ADDRESS as `0x${string}` }]
          : [],
    },
    { enabled: decryptArmed && !!fillHandle && fillHandle !== ZERO_HANDLE },
  );

  useEffect(() => {
    if (!hasOnchain) return;
    if (cleared && o.status === "sealed") {
      onUpdate(o.id, { status: "fillReady" });
    }
  }, [hasOnchain, cleared, o.status, o.id, onUpdate]);

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
        ${o.price.toLocaleString()}
      </span>
      <span className="font-[var(--font-mono)] text-[13px] text-[var(--dim)]">
        <Redacted revealed={o.revealed} len={4}>
          {o.size}
        </Redacted>
      </span>
      <span className="justify-self-end">
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
        {o.status === "filled" && (
          <span className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2 py-1 rounded-md text-[var(--accent-ink)] bg-[var(--accent)]">
            <Icon name="check" size={11} />
            filled {o.fill}
          </span>
        )}
        {o.status === "nofill" && (
          <span className="inline-flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] px-2 py-1 rounded-md text-[var(--faint)] border border-[var(--line2)]">
            no fill
          </span>
        )}
      </span>
    </div>
  );
}

function MyOrders({
  orders,
  onUpdate,
}: {
  orders: MyOrder[];
  onUpdate: (id: number, patch: Partial<MyOrder>) => void;
}) {
  if (!orders.length) {
    return (
      <div className="veil-panel px-[22px] py-5">
        <h3 className="text-[15px] font-semibold m-0 mb-2">Your orders</h3>
        <p className="text-[13px] text-[var(--dim)] leading-[1.5] m-0">
          No sealed bids yet. Your orders stay encrypted and visible only to you.
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
          <OrderRow key={o.id} order={o} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
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
            className="inline-flex items-center gap-1.5 text-[12px] font-[var(--font-mono)] px-2.5 py-1.5 rounded-lg border border-[color-mix(in_oklab,var(--sell)_45%,transparent)] text-[var(--sell)] bg-[color-mix(in_oklab,var(--sell)_8%,transparent)] hover:bg-[color-mix(in_oklab,var(--sell)_16%,transparent)] transition-colors disabled:opacity-60"
            title="Switch wallet network to Sepolia"
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
          title="Disconnect wallet"
        >
          {disconnecting ? "…" : "Disconnect"}
        </button>
      </span>
    );
  }
  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
  return (
    <Btn
      variant="primary"
      size="sm"
      disabled={isPending || !injected}
      onClick={() => injected && connect({ connector: injected })}
    >
      <Icon name="wallet" size={14} />
      {isPending ? "Connecting…" : "Connect"}
    </Btn>
  );
}

export function TradeApp() {
  const life = useVeilLifecycle();
  const { phase, batchId, book, blocksLeft, orders: orderCount } = life;
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const oidRef = useState({ current: 0 })[0];

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

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
    flash("Sealed bid submitted to batch #" + batchId);
  }

  const updateOrder = useCallback((id: number, patch: Partial<MyOrder>) => {
    setMyOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  // Mock-mode fill flow; the real flow lives in <OrderRow />.
  useEffect(() => {
    if (hasVeilDeployment()) return;
    if (phase !== "cleared") return;
    setMyOrders((prev) =>
      prev.map((o) => {
        if (o.batchId !== batchId || o.status !== "sealed") return o;
        const eligible = o.side === "buy" ? o.tickIdx >= book.clearing : o.tickIdx <= book.clearing;
        if (!eligible) return { ...o, status: "nofill" };
        const ratio = o.tickIdx === book.clearing ? 0.6 : 1;
        return { ...o, status: "fillReady", fillAmt: Math.max(1, Math.round(o.size * ratio)) };
      }),
    );
  }, [phase, batchId, book]);

  const statusTone = phase === "open" ? "buy" : phase === "cleared" ? "accent" : "warn";

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
          <span className="font-[var(--font-mono)] text-[13px] text-[var(--dim)] px-3 py-1.5 border border-[var(--line)] rounded-md">
            cWETH / cUSDC
          </span>
        </div>
        <div className="flex items-center gap-[18px]">
          <span className="inline-flex items-center gap-2 text-[13px] text-[var(--dim)] font-[var(--font-mono)]">
            <EthereumMark className="text-[var(--accent)] drop-shadow-[0_0_6px_var(--glow)]" />
            Sepolia
          </span>
          <ConnectChip />
        </div>
      </header>

      <div className="flex-1 max-w-[1200px] w-full mx-auto px-6 pt-[26px] pb-16 grid lg:grid-cols-[1fr_380px] gap-[22px] items-start">
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
                      : `Cleared @ $${book.ticks[book.clearing].price.toLocaleString()}`}
              </Pill>
            </div>
            <OrderBook life={life} rowHeight={46} />
            <div className="relative mt-5 pt-[18px] border-t border-[var(--line)] flex gap-10">
              {[
                ["Orders", String(orderCount)],
                ["Window", "12 blocks"],
                ["Matched", phase === "cleared" ? book.matched.toLocaleString() : "———"],
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
          <OrderTicket life={life} onPlace={place} />
          <MyOrders orders={myOrders} onUpdate={updateOrder} />
        </aside>
      </div>

      {toast && (
        <div className="veil-toast-in fixed bottom-7 left-1/2 -translate-x-1/2 z-[200] inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-[var(--bg2)] border border-[var(--line2)] text-sm shadow-[0_20px_50px_-16px_rgba(0,0,0,0.7)]">
          <span className="text-[var(--accent)]">
            <Icon name="lock" size={14} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}
