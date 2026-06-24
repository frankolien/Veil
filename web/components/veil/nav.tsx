"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./primitives";

type IconName = "pulse" | "shield" | "scale";

const ROUTES: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/app", label: "Trade", icon: "pulse" },
  { href: "/app/vault", label: "Vault", icon: "shield" },
  { href: "/app/regulator", label: "Audit", icon: "scale" },
];

/** Desktop pill nav. Hidden on mobile in favor of MobileTabBar. */
export function VeilNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:inline-flex gap-1 bg-[var(--bg3)] rounded-md p-1 border border-[var(--line)]">
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

/** Mobile-only bottom tab bar, fixed to the viewport with safe-area padding. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-[var(--line)] bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] backdrop-blur-[18px]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="m-0 grid grid-cols-3 list-none p-0">
        {ROUTES.map((r) => {
          const active = pathname === r.href;
          return (
            <li key={r.href}>
              <Link
                href={r.href}
                className={[
                  "flex flex-col items-center justify-center gap-1 py-2.5 px-2 min-h-[56px] no-underline transition-colors",
                  active
                    ? "text-[var(--accent)]"
                    : "text-[var(--dim)] hover:text-[var(--text)]",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={r.icon} size={20} />
                <span className="font-[var(--font-mono)] text-[10.5px] tracking-[0.1em]">
                  {r.label.toUpperCase()}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
