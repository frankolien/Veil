"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ROUTES: Array<{ href: string; label: string }> = [
  { href: "/app", label: "Trade" },
  { href: "/app/vault", label: "Vault" },
  { href: "/app/regulator", label: "Audit" },
];

export function VeilNav() {
  const pathname = usePathname();
  return (
    <nav className="inline-flex gap-1 bg-[var(--bg3)] rounded-md p-1 border border-[var(--line)]">
      {ROUTES.map((r) => {
        const active = pathname === r.href;
        return (
          <Link
            key={r.href}
            href={r.href}
            className={[
              "px-3 py-1.5 rounded-[5px] text-[12px] font-[var(--font-mono)] tracking-[0.05em] transition-colors",
              active
                ? "bg-[var(--bg)] text-[var(--text)] border border-[var(--line2)]"
                : "text-[var(--dim)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
