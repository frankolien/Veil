"use client";

import { useEffect, useState } from "react";

export type StartHereStep = { title: string; body: string; done: boolean };

export function StartHere({ storageKey, steps }: { storageKey: string; steps: StartHereStep[] }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(storageKey);
      if (dismissed !== "1") setHidden(false);
    } catch {
      setHidden(false);
    }
  }, [storageKey]);

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  }

  if (hidden) return null;

  const total = steps.length;
  const completed = steps.filter((s) => s.done).length;
  const allDone = completed === total;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-violet-700/40 bg-violet-950/20 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10.5px] tracking-[0.2em] text-violet-300">START HERE</span>
          <span className="font-mono text-xs text-zinc-500">
            {completed}/{total} {allDone ? "· dismiss when ready" : ""}
          </span>
        </div>
        <button
          onClick={dismiss}
          className="rounded-md border border-transparent px-2 py-1 font-mono text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
        >
          {allDone ? "Got it" : "Dismiss"}
        </button>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={
              "flex items-start gap-3 rounded-lg border px-3 py-2.5 " +
              (s.done
                ? "border-violet-700/40 bg-violet-900/15"
                : "border-zinc-800 bg-zinc-900/40")
            }
          >
            <span
              className={
                "inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full font-mono text-[11px] " +
                (s.done
                  ? "bg-violet-500 text-zinc-950"
                  : "border border-zinc-700 bg-zinc-900 text-zinc-400")
              }
            >
              {s.done ? "✓" : i + 1}
            </span>
            <div className="flex flex-col">
              <span className="text-[12.5px] font-medium leading-tight text-zinc-100">{s.title}</span>
              <span className="font-mono text-[11.5px] leading-snug text-zinc-400">{s.body}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
