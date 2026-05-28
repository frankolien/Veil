"use client";

import { useEffect, useRef, useState } from "react";
import { Cipher, CountUp, GlowDot, Pill, Redacted } from "./primitives";

export type Phase = "open" | "closing" | "clearing" | "cleared";

export type BookTick = { idx: number; price: number; buy: number; sell: number };
export type Book = { mid: number; ticks: BookTick[]; clearing: number; matched: number };

function makeBook(seed: number): Book {
  const mid = 3420 + Math.round((seed % 7) - 3);
  const ticks: BookTick[] = [];
  for (let i = 0; i < 7; i++) {
    const price = mid + (i - 3);
    const distLow = i;
    const distHigh = 6 - i;
    const buy = Math.max(
      0,
      Math.round((140 + distHigh * 70 + ((seed * (i + 3)) % 90)) * (distHigh > 4 ? 0.4 : 1)),
    );
    const sell = Math.max(
      0,
      Math.round((140 + distLow * 70 + ((seed * (i + 5)) % 90)) * (distLow > 4 ? 0.4 : 1)),
    );
    ticks.push({ idx: i, price, buy, sell });
  }
  let clearing = 3;
  for (let i = 0; i < ticks.length; i++) {
    let dem = 0;
    let sup = 0;
    for (let j = i; j < ticks.length; j++) dem += ticks[j].buy;
    for (let j = 0; j <= i; j++) sup += ticks[j].sell;
    if (sup >= dem) {
      clearing = i;
      break;
    }
    clearing = i;
  }
  const matched = Math.min(
    ticks.reduce((a, t, i) => a + (i <= clearing ? t.sell : 0), 0),
    ticks.reduce((a, t, i) => a + (i >= clearing ? t.buy : 0), 0),
  );
  return { mid, ticks, clearing, matched: Math.max(matched, 240) };
}

export type Lifecycle = {
  batchId: number;
  book: Book;
  phase: Phase;
  blocksLeft: number;
  orders: number;
  flash: { idx: number; side: "buy" | "sell"; id: number } | null;
};

export function useBatchLifecycle(running = true): Lifecycle {
  const [batchId, setBatchId] = useState(1247);
  const [book, setBook] = useState<Book>(() => makeBook(1247));
  const [phase, setPhase] = useState<Phase>("open");
  const [blocksLeft, setBlocksLeft] = useState(12);
  const [orders, setOrders] = useState(28);
  const [flash, setFlash] = useState<Lifecycle["flash"]>(null);
  const flashId = useRef(0);
  const timers = useRef<Array<{ kill: () => void } | ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    if (!running) return;
    let alive = true;

    const clearAll = () => {
      timers.current.forEach((t) => {
        if (typeof t === "object" && t && "kill" in t) (t as { kill: () => void }).kill();
        else clearTimeout(t as ReturnType<typeof setTimeout>);
      });
      timers.current = [];
    };
    const after = (ms: number, fn: () => void) =>
      timers.current.push(setTimeout(fn, ms));

    function runBatch(id: number) {
      if (!alive) return;
      const b = makeBook(id);
      setBook(b);
      setBatchId(id);
      setPhase("open");
      setBlocksLeft(12);
      setOrders(20 + (id % 17));

      let bl = 12;
      const blkTimer = setInterval(() => {
        bl -= 1;
        setBlocksLeft(Math.max(0, bl));
        if (bl <= 0) clearInterval(blkTimer);
      }, 430);
      timers.current.push({ kill: () => clearInterval(blkTimer) });

      const ordTimer = setInterval(() => {
        const idx = (Math.random() * 7) | 0;
        const side: "buy" | "sell" = Math.random() > 0.5 ? "buy" : "sell";
        flashId.current += 1;
        setFlash({ idx, side, id: flashId.current });
        setOrders((o) => o + 1);
      }, 620);
      timers.current.push({ kill: () => clearInterval(ordTimer) });

      after(5400, () => {
        clearInterval(blkTimer);
        clearInterval(ordTimer);
        setBlocksLeft(0);
        setPhase("closing");
        after(900, () => {
          setPhase("clearing");
          after(1500, () => {
            setPhase("cleared");
            after(4200, () => runBatch(id + 1));
          });
        });
      });
    }

    runBatch(batchId);
    return () => {
      alive = false;
      clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return { batchId, book, phase, blocksLeft, orders, flash };
}

const ROW_H = 34;

export function OrderBook({
  life,
  rowHeight = ROW_H,
}: {
  life: Lifecycle;
  rowHeight?: number;
}) {
  const { book, phase, flash } = life;
  const revealed = phase === "cleared";
  const clearing = phase === "clearing";
  const maxVol = Math.max(...book.ticks.flatMap((t) => [t.buy, t.sell]), 1);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!flash) return;
    setFlashIdx(flash.idx);
    const id = setTimeout(() => setFlashIdx(null), 520);
    return () => clearTimeout(id);
  }, [flash]);

  return (
    <div className="relative font-[var(--font-mono)]">
      <div
        className="grid items-stretch text-[10.5px] uppercase tracking-[0.12em] text-[var(--faint)] px-1 pb-2"
        style={{ gridTemplateColumns: "1fr .8fr 1fr" }}
      >
        <span>Bid size</span>
        <span className="text-center">Price</span>
        <span className="text-right">Ask size</span>
      </div>

      <div className="relative flex flex-col gap-[2px]" style={{ ["--row-h" as string]: `${rowHeight}px` }}>
        {clearing && <div className="veil-book-scan" />}
        {book.ticks.map((t) => {
          const isClear = revealed && t.idx === book.clearing;
          return (
            <div
              key={t.idx}
              className={[
                "grid items-stretch rounded-md transition-colors duration-200 relative",
                isClear
                  ? "bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_40%,transparent)]"
                  : "",
                flashIdx === t.idx ? "veil-row-flash" : "",
              ].join(" ")}
              style={{ height: `var(--row-h)`, gridTemplateColumns: "1fr .8fr 1fr" }}
            >
              <div className="relative flex items-center overflow-hidden px-2.5 justify-start">
                <div
                  className="absolute top-[3px] bottom-[3px] left-0 rounded bg-[color-mix(in_oklab,var(--buy)_18%,transparent)] transition-[width] duration-[900ms] ease-[cubic-bezier(.2,.8,.2,1)]"
                  style={{ width: revealed ? `${(t.buy / maxVol) * 100}%` : "0%" }}
                />
                <span className="relative text-[13px] text-[var(--buy)]">
                  <Redacted revealed={revealed} len={5}>
                    {t.buy.toLocaleString()}
                  </Redacted>
                </span>
              </div>

              <div className="relative flex items-center justify-center gap-1.5 text-[12.5px] text-[var(--dim)]">
                {t.price.toLocaleString()}
                {isClear && (
                  <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--accent)] border border-[color-mix(in_oklab,var(--accent)_40%,transparent)] rounded-[4px] px-1 py-[1px]">
                    clearing
                  </span>
                )}
              </div>

              <div className="relative flex items-center overflow-hidden px-2.5 justify-end">
                <div
                  className="absolute top-[3px] bottom-[3px] right-0 rounded bg-[color-mix(in_oklab,var(--sell)_18%,transparent)] transition-[width] duration-[900ms] ease-[cubic-bezier(.2,.8,.2,1)]"
                  style={{ width: revealed ? `${(t.sell / maxVol) * 100}%` : "0%" }}
                />
                <span className="relative text-[13px] text-[var(--sell)]">
                  <Redacted revealed={revealed} len={5}>
                    {t.sell.toLocaleString()}
                  </Redacted>
                </span>
              </div>
            </div>
          );
        })}
        {revealed && (
          <div
            className="veil-clear-line"
            style={{ top: `calc(${book.clearing + 0.5} * var(--row-h))` }}
          />
        )}
      </div>
    </div>
  );
}

function PhaseStepper({ phase }: { phase: Phase }) {
  const steps: Array<{ key: Phase; label: string }> = [
    { key: "open", label: "Sealed" },
    { key: "closing", label: "Closed" },
    { key: "clearing", label: "Clearing" },
    { key: "cleared", label: "Filled" },
  ];
  const idx = steps.findIndex((s) => s.key === phase);
  return (
    <div className="flex items-center gap-1.5 justify-self-end">
      {steps.map((s, i) => {
        const done = i <= idx;
        const active = i === idx;
        return (
          <div
            key={s.key}
            className={`flex flex-col items-center gap-[5px] transition-opacity duration-300 ${
              done ? "opacity-100" : "opacity-40"
            }`}
          >
            <i
              className={[
                "block h-[7px] w-[7px] rounded-full transition-all",
                done ? "bg-[var(--accent)]" : "bg-[var(--faint)]",
                active ? "shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_22%,transparent)]" : "",
              ].join(" ")}
            />
            <span className="text-[9px] font-[var(--font-mono)] uppercase tracking-[0.06em] text-[var(--dim)]">
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function BatchPanel({ life }: { life: Lifecycle }) {
  const { batchId, phase, blocksLeft, orders, book } = life;
  const statusTone = phase === "open" ? "buy" : phase === "cleared" ? "accent" : "warn";
  const statusText =
    phase === "open"
      ? "Collecting sealed bids"
      : phase === "closing"
        ? "Batch closed"
        : phase === "clearing"
          ? "Computing clearing tick"
          : "Uniform price · cleared";

  return (
    <div className="veil-panel p-[22px] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]">
      <div className="veil-panel-glow" />
      <div className="relative flex items-start justify-between mb-[18px]">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="font-[var(--font-mono)] text-[11px] tracking-[0.2em] text-[var(--faint)]">
              BATCH
            </span>
            <span className="font-[var(--font-mono)] text-[26px] font-medium text-[var(--text)]">
              #{batchId}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[13px] text-[var(--dim)]">
            <GlowDot tone={statusTone} />
            <span>{statusText}</span>
          </div>
        </div>
        <Pill tone={statusTone}>
          {phase === "open" ? `${blocksLeft} blocks left` : phase === "cleared" ? "settled" : "—"}
        </Pill>
      </div>

      <OrderBook life={life} />

      <div
        className="mt-5 pt-[18px] border-t border-[var(--line)] grid gap-[18px] items-center"
        style={{ gridTemplateColumns: "repeat(3, auto) 1fr" }}
      >
        <Metric k="Orders" v={String(orders)} />
        <Metric
          k="Clearing"
          v={phase === "cleared" ? `$${book.ticks[book.clearing].price.toLocaleString()}` : "————"}
        />
        <Metric
          k="Matched"
          v={
            phase === "cleared" ? (
              <CountUp value={book.matched} run dur={800} />
            ) : (
              "———"
            )
          }
        />
        <PhaseStepper phase={phase} />
      </div>
    </div>
  );
}

function Metric({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--faint)]">{k}</span>
      <span className="font-[var(--font-mono)] text-[15px] text-[var(--text)] tabular-nums">{v}</span>
    </div>
  );
}
