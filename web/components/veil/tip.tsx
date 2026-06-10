"use client";

import type { ReactNode } from "react";

export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <span className="veil-tip relative inline-flex items-center group cursor-help">
      <span className="border-b border-dotted border-[var(--faint)] hover:border-[var(--accent)] transition-colors">
        {label}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-[300] mt-1.5 -translate-x-1/2 w-[260px] px-3 py-2 rounded-md bg-[var(--bg2)] border border-[var(--line2)] text-[11px] leading-[1.45] text-[var(--text)] font-normal opacity-0 translate-y-[-4px] group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)]"
      >
        {children}
      </span>
    </span>
  );
}
