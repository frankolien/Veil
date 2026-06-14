"use client";

import type { ReactNode } from "react";

export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <span className="group relative inline-flex cursor-help items-center">
      <span className="border-b border-dotted border-zinc-600 transition-colors group-hover:border-violet-400">
        {label}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 w-[260px] -translate-x-1/2 translate-y-[-4px] rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-[11px] font-normal leading-snug text-zinc-200 opacity-0 shadow-xl transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
