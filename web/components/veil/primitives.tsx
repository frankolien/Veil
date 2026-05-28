"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";

const HEX = "0123456789abcdef";

function randStr(chars: string, n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += chars[(Math.random() * chars.length) | 0];
  return s;
}

/* Cipher — perpetually scrambling hex run.
   Starts as a stable placeholder so SSR + first client render match (no
   hydration mismatch). Begins scrambling once mounted on the client. */
export function Cipher({
  len = 8,
  active = true,
  className = "",
  style,
}: {
  len?: number;
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const placeholder = "0".repeat(len);
  const [txt, setTxt] = useState(placeholder);
  useEffect(() => {
    if (!active) {
      setTxt(placeholder);
      return;
    }
    setTxt(randStr(HEX, len));
    const id = setInterval(() => setTxt(randStr(HEX, len)), 70 + Math.random() * 60);
    return () => clearInterval(id);
  }, [active, len, placeholder]);
  return (
    <span className={`veil-cipher ${className}`} style={style} suppressHydrationWarning>
      {txt}
    </span>
  );
}

/* Redacted — shows children when revealed, otherwise scrambles them. */
export function Redacted({
  revealed,
  len,
  children,
  className = "",
}: {
  revealed: boolean;
  len?: number;
  children: ReactNode;
  className?: string;
}) {
  const text = String(children ?? "");
  const n = len ?? Math.max(3, text.length);
  const cls = `veil-redacted font-[var(--font-mono)] tabular-nums ${className}`;
  if (revealed) return <span className={`${cls} is-revealed`}>{children}</span>;
  return (
    <span className={`${cls} redaction-scramble`} aria-hidden="true">
      <Cipher len={n} active />
    </span>
  );
}

/* CountUp — animates 0 → value when `run` flips true. */
export function CountUp({
  value,
  run,
  dur = 900,
  format = (v: number) => Math.round(v).toLocaleString(),
}: {
  value: number;
  run: boolean;
  dur?: number;
  format?: (v: number) => string;
}) {
  const [v, setV] = useState(run ? value : 0);
  useEffect(() => {
    if (!run) {
      setV(0);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setV(value * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, value, dur]);
  return <>{format(v)}</>;
}

/* Eyebrow — small uppercase section label with a leading rule. */
export function Eyebrow({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={[
        "inline-flex items-center gap-2.5 font-[var(--font-mono)] text-xs font-medium uppercase tracking-[0.22em] text-[var(--accent)] whitespace-nowrap",
        align === "center" ? "justify-center" : "",
        className,
      ].join(" ")}
    >
      <span className="h-px w-[22px] bg-[var(--accent)] opacity-60" />
      {children}
    </div>
  );
}

type PillTone = "accent" | "buy" | "sell" | "warn" | "neutral";

const PILL_TONE: Record<PillTone, string> = {
  accent:
    "text-[var(--accent)] border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]",
  buy: "text-[var(--buy)] border-[color-mix(in_oklab,var(--buy)_35%,transparent)] bg-[color-mix(in_oklab,var(--buy)_10%,transparent)]",
  sell: "text-[var(--sell)] border-[color-mix(in_oklab,var(--sell)_35%,transparent)] bg-[color-mix(in_oklab,var(--sell)_10%,transparent)]",
  warn: "text-[#f5c14e] border-[rgba(245,193,78,0.35)] bg-[rgba(245,193,78,0.10)]",
  neutral: "text-[var(--dim)] border-[var(--line2)]",
};

export function Pill({
  tone = "neutral",
  dot = false,
  children,
  className = "",
}: {
  tone?: PillTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[5px] font-[var(--font-mono)] text-[11.5px] font-medium tracking-[0.04em] whitespace-nowrap",
        PILL_TONE[tone],
        className,
      ].join(" ")}
    >
      {dot && <i className="block h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function GlowDot({ tone = "accent" }: { tone?: "accent" | "buy" | "warn" }) {
  return <span className={`veil-glowdot veil-glowdot-${tone}`} />;
}

/* EthereumMark — the canonical six-facet Ethereum diamond, used as the
   Sepolia network indicator. Inherits its colour from currentColor so callers
   can tint it via Tailwind text-* utilities. Sized in em by default so it
   scales with the surrounding text. */
export function EthereumMark({
  size,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const dims =
    size !== undefined
      ? { width: size * (256 / 417), height: size }
      : { style: { height: "1.05em", width: "calc(1.05em * 256 / 417)" } };
  return (
    <svg
      {...("width" in dims ? { width: dims.width, height: dims.height } : { style: dims.style })}
      viewBox="0 0 256 417"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`inline-block flex-none ${className}`}
    >
      {/* upper diamond — back-left facet (dim) */}
      <path opacity="0.55" d="M127.962 0 0 212.32l127.962 75.638V154.158z" />
      {/* upper diamond — front-right facet (full) */}
      <path d="M127.961 0v287.958l127.961-75.637z" />
      {/* lower diamond — back-left facet (dim) */}
      <path opacity="0.55" d="M127.962 416.905v-104.72L0 236.585z" />
      {/* lower diamond — front-right facet (full) */}
      <path d="M127.961 416.905 255.92 236.585l-127.96 75.6z" />
      {/* center band — inside, dim */}
      <path opacity="0.22" d="M127.961 287.958l127.96-75.638-127.96-58.162z" />
      {/* center band — inside back (slightly brighter) */}
      <path opacity="0.45" d="M0 212.32l127.961 75.638V154.158z" />
    </svg>
  );
}

/* MarkDefs — the V-mark's gradient + slit-mask, parameterised by a unique
   suffix so multiple marks on the same page don't collide. Renders inside an
   outer <svg>. */
function MarkDefs({ gradId, maskId }: { gradId: string; maskId: string }) {
  return (
    <defs>
      <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#6fe9f7" />
        <stop offset="55%" stopColor="#9dc8f6" />
        <stop offset="100%" stopColor="#a78bfa" />
      </linearGradient>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="28" height="28">
        <rect width="28" height="28" fill="white" />
        <rect x="0" y="10" width="28" height="1.25" fill="black" />
        <rect x="0" y="17" width="28" height="1.25" fill="black" />
      </mask>
    </defs>
  );
}

function MarkBody({ gradId, maskId }: { gradId: string; maskId: string }) {
  return (
    <g mask={`url(#${maskId})`} fill={`url(#${gradId})`}>
      {/* left stroke of V (/), tapering toward apex */}
      <polygon points="3,3 9,3 15,24.2 12,24.2" />
      {/* right stroke of V (\), mirror */}
      <polygon points="19,3 25,3 16,24.2 13,24.2" />
    </g>
  );
}

/* BrandMark — the standalone V glyph. Use when you need just the mark. */
export function BrandMark({ size = 18 }: { size?: number }) {
  const uid = useId().replace(/[:]/g, "");
  const gradId = `veil-mark-grad-${uid}`;
  const maskId = `veil-mark-mask-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Veil"
      role="img"
      className="block flex-none"
    >
      <MarkDefs gradId={gradId} maskId={maskId} />
      <MarkBody gradId={gradId} maskId={maskId} />
    </svg>
  );
}

/* Wordmark — the V glyph reading *as* the V of "VEIL". Mark is sized to the
   cap-height of the surrounding text via em units; tight viewBox crops out
   the SVG padding so baseline alignment lands cleanly. Inherits font-size,
   colour and tracking from its container (override via className). */
export function Wordmark({
  className = "",
  textClassName = "",
}: {
  className?: string;
  textClassName?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const gradId = `veil-wm-grad-${uid}`;
  const maskId = `veil-wm-mask-${uid}`;
  return (
    <span
      className={`inline-flex items-baseline font-bold tracking-[0.18em] text-[var(--text)] leading-none ${className}`}
    >
      <svg
        // viewBox cropped to the glyph (x: 3→25, y: 3→24.2) so size scales 1:1 with cap-height
        // and the SVG's bottom edge = the V apex = the text baseline.
        viewBox="3 3 22 21.2"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="inline-block flex-none"
        // height = cap-height of Space Grotesk + a hair of optical weight so the V doesn't
        // feel light against the bold EIL. marginRight matches `tracking-[0.18em]` so the
        // V→E gap visually matches the E→I→L gaps. The SVG width scales from the cropped
        // viewBox aspect (22:21.2) and we hold that ratio relative to height.
        style={{
          height: "0.78em",
          width: "calc(0.78em * 22 / 21.2)",
          marginRight: "0.18em",
        }}
      >
        <MarkDefs gradId={gradId} maskId={maskId} />
        <MarkBody gradId={gradId} maskId={maskId} />
      </svg>
      <span className={textClassName}>EIL</span>
    </span>
  );
}

/* Minimal abstract line icons (stroke = currentColor). */
export function Icon({
  name,
  size = 22,
  className = "",
}: {
  name:
    | "lock"
    | "eye-off"
    | "layers"
    | "shield"
    | "scale"
    | "key"
    | "bolt"
    | "grid"
    | "arrow"
    | "check"
    | "clock"
    | "pulse"
    | "wallet";
  size?: number;
  className?: string;
}) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `block flex-none ${className}`,
  };
  switch (name) {
    case "lock":
      return (
        <svg {...p}>
          <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
          <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          <circle cx="12" cy="15.5" r="1.4" />
        </svg>
      );
    case "eye-off":
      return (
        <svg {...p}>
          <path d="M3 3l18 18" />
          <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.3 2.9M6.5 8.1A16 16 0 0 0 3 12s4 6 9 6a9.5 9.5 0 0 0 3.4-.6" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      );
    case "layers":
      return (
        <svg {...p}>
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...p}>
          <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "scale":
      return (
        <svg {...p}>
          <path d="M12 4v16M7 8h10M7 8l-3 6a3 3 0 0 0 6 0L7 8zM17 8l-3 6a3 3 0 0 0 6 0l-3-6zM7 20h10" />
        </svg>
      );
    case "key":
      return (
        <svg {...p}>
          <circle cx="8" cy="8" r="3.5" />
          <path d="M10.5 10.5L20 20M16 16l2-2M18.5 18.5l1.5-1.5" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...p}>
          <path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" />
        </svg>
      );
    case "grid":
      return (
        <svg {...p}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...p}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "check":
      return (
        <svg {...p}>
          <path d="M5 12l5 5L19 7" />
        </svg>
      );
    case "clock":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case "pulse":
      return (
        <svg {...p}>
          <path d="M3 12h4l2-6 4 12 2-6h6" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...p}>
          <rect x="3.5" y="6" width="17" height="13" rx="2.5" />
          <path d="M3.5 9.5h17M16 13.5h2" />
        </svg>
      );
    default:
      return null;
  }
}

/* Button — primary (accent), ghost (transparent), outline (glass). */
export function Btn({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "block";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold border border-transparent rounded-[calc(var(--radius)-4px)] transition-all duration-150 whitespace-nowrap font-[var(--font-display)] active:translate-y-px disabled:opacity-45 disabled:cursor-not-allowed";
  const sizes: Record<string, string> = {
    sm: "h-9 px-[15px] text-[13px]",
    md: "h-11 px-5 text-sm",
    lg: "h-[54px] px-7 text-base",
    block: "w-full h-[50px] px-5 text-[15px]",
  };
  const variants: Record<string, string> = {
    primary:
      "bg-[var(--accent)] text-[var(--accent-ink)] hover:-translate-y-px hover:shadow-[0_8px_32px_-6px_var(--glow)]",
    ghost: "text-[var(--text)] bg-transparent hover:bg-[var(--bg3)]",
    outline:
      "text-[var(--text)] bg-[var(--panel)] border-[var(--line2)] backdrop-blur-[8px] hover:border-[var(--accent)] hover:text-[var(--accent)]",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
