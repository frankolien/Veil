"use client";

import { useEffect, useState } from "react";
import { Icon } from "./primitives";

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
      // ignore
    }
    setHidden(true);
  }

  if (hidden) return null;

  const total = steps.length;
  const completed = steps.filter((s) => s.done).length;
  const allDone = completed === total;

  return (
    <div className="veil-panel p-[18px] flex flex-col gap-3 border-[color-mix(in_oklab,var(--accent)_35%,var(--line))]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="font-[var(--font-mono)] text-[10.5px] tracking-[0.2em] text-[var(--accent)]">
            START HERE
          </span>
          <span className="font-[var(--font-mono)] text-[12px] text-[var(--faint)]">
            {completed}/{total} {allDone ? "· you’re done — dismiss" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex items-center gap-1 text-[11px] text-[var(--dim)] hover:text-[var(--text)] font-[var(--font-mono)] px-2 py-1 rounded-md border border-transparent hover:border-[var(--line2)] transition-colors"
        >
          <Icon name="check" size={11} />
          {allDone ? "Got it" : "Dismiss"}
        </button>
      </div>
      <ol className="m-0 p-0 list-none flex flex-col gap-2">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={[
              "flex items-start gap-3 px-3 py-2.5 rounded-[8px] border",
              s.done
                ? "border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent)_6%,transparent)]"
                : "border-[var(--line)] bg-[color-mix(in_oklab,var(--bg3)_70%,transparent)]",
            ].join(" ")}
          >
            <span
              className={[
                "flex-none w-[22px] h-[22px] rounded-full inline-flex items-center justify-center font-[var(--font-mono)] text-[11px]",
                s.done
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-[var(--bg3)] border border-[var(--line2)] text-[var(--dim)]",
              ].join(" ")}
            >
              {s.done ? <Icon name="check" size={11} /> : i + 1}
            </span>
            <div className="flex flex-col">
              <span className="text-[12.5px] font-medium text-[var(--text)] leading-tight">{s.title}</span>
              <span className="text-[11.5px] text-[var(--dim)] leading-[1.5] font-[var(--font-mono)]">
                {s.body}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
