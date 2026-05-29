"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BatchPanel, useBatchLifecycle } from "./orderbook";
import { Btn, Cipher, Eyebrow, Icon, Pill, Redacted, Wordmark } from "./primitives";

const HERO_COPY = {
  lead: "Sealed-bid batch auctions",
  title: ["Trade without", "leaking your order."] as const,
  sub: "Veil is a uniform-price batch-auction CLOB where side, price tick, and size are encrypted end-to-end under FHE. No mempool front-running, no sandwiches, no depth scraping — by construction, not by latency tricks.",
  ctaPrimary: "Launch app",
  ctaSecondary: "How it works",
};

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      className={[
        "sticky top-0 z-[100] border-b transition-all duration-200",
        scrolled
          ? "bg-[color-mix(in_oklab,var(--bg)_72%,transparent)] backdrop-blur-[18px] backdrop-saturate-150 border-[var(--line)]"
          : "border-transparent",
      ].join(" ")}
    >
      <div className="max-w-[1200px] mx-auto h-[68px] px-7 flex items-center justify-between gap-6">
        <a href="#top" className="no-underline">
          <Wordmark className="text-base" />
        </a>
        <div className="hidden md:flex gap-[30px]">
          {[
            ["#how", "Mechanism"],
            ["#why", "Why FHE"],
            ["#vault", "Vault"],
            ["#compliance", "Compliance"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="text-[var(--dim)] text-sm font-medium no-underline hover:text-[var(--text)] transition-colors duration-200 whitespace-nowrap"
            >
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <a href="/app/vault" className="hidden md:inline-block">
            <Btn variant="ghost" size="sm">
              Vault
            </Btn>
          </a>
          <a href="/app/regulator" className="hidden md:inline-block">
            <Btn variant="ghost" size="sm">
              Audit
            </Btn>
          </a>
          <a href="/app/v2">
            <Btn variant="outline" size="sm">
              <Icon name="wallet" size={15} />
              Launch app
            </Btn>
          </a>
        </div>
      </div>
    </nav>
  );
}

export function Hero() {
  const life = useBatchLifecycle(true);
  return (
    <section className="relative px-7 pt-14" id="top">
      <div className="max-w-[1200px] mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center min-h-[72vh]">
        <div>
          <div className="font-[var(--font-mono)] text-[13px] uppercase tracking-[0.16em] text-[var(--dim)] flex items-center gap-3 mb-[26px]">
            <span className="w-[30px] h-px bg-[var(--accent)]" />
            {HERO_COPY.lead}
          </div>
          <h1 className="text-[clamp(2.7rem,5.6vw,4.9rem)] leading-[0.98] tracking-[-0.035em] font-semibold m-0 text-[var(--text)]">
            {HERO_COPY.title[0]}
            <br />
            <span className="text-[var(--accent)]">{HERO_COPY.title[1]}</span>
          </h1>
          <p className="mt-[26px] text-[17px] leading-[1.62] text-[var(--dim)] max-w-[30em]">
            {HERO_COPY.sub}
          </p>
          <div className="flex gap-3.5 mt-[34px] flex-wrap">
            <a href="/app/v2">
              <Btn variant="primary" size="lg">
                {HERO_COPY.ctaPrimary}
                <Icon name="arrow" size={18} />
              </Btn>
            </a>
            <a href="#how">
              <Btn variant="ghost" size="lg">
                {HERO_COPY.ctaSecondary}
              </Btn>
            </a>
          </div>
          <div className="flex items-center gap-4 mt-10 flex-wrap">
            <span className="text-[12.5px] text-[var(--faint)] font-[var(--font-mono)] tracking-[0.05em]">
              Settles on
            </span>
            <span className="flex gap-[7px]">
              {["cUSDC", "cUSDT", "cWETH"].map((t) => (
                <span
                  key={t}
                  className="font-[var(--font-mono)] text-xs px-2.5 py-1 border border-[var(--line2)] rounded-md text-[var(--dim)]"
                >
                  {t}
                </span>
              ))}
            </span>
            <span className="w-px h-[18px] bg-[var(--line2)]" />
            <span className="inline-flex items-center gap-2 text-[12.5px] text-[var(--dim)]">
              <i className="veil-zama-mark inline-block w-[14px] h-[14px] rounded" />
              Powered by the Zama Protocol
            </span>
          </div>
        </div>

        <div>
          <BatchPanel life={life} />
        </div>
      </div>

      <div className="mt-16 border-y border-[var(--line)] overflow-hidden">
        <div className="veil-marquee">
          {[0, 1].map((k) => (
            <span key={k} className="inline-flex items-center gap-[26px] py-4 px-[13px]">
              {[
                "no mempool leak",
                "no sandwich attacks",
                "no depth scraping",
                "encrypted end-to-end",
                "uniform clearing price",
                "fhe by construction",
              ].map((t, i) => (
                <span key={i} className="inline-flex items-center gap-[26px] whitespace-nowrap">
                  <em className="font-[var(--font-mono)] not-italic text-[13px] tracking-[0.12em] uppercase text-[var(--dim)]">
                    {t}
                  </em>
                  <i className="not-italic text-[var(--accent)]">/</i>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionHead({
  eyebrow,
  title,
  sub,
  align = "left",
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div
      className={[
        "mb-14 max-w-[760px]",
        align === "center" ? "mx-auto text-center" : "",
      ].join(" ")}
    >
      <Eyebrow align={align}>{eyebrow}</Eyebrow>
      <h2 className="text-[clamp(2rem,3.6vw,3.1rem)] leading-[1.04] tracking-[-0.025em] font-semibold mt-[18px] text-[var(--text)]">
        {title}
      </h2>
      {sub && (
        <p
          className={[
            "mt-5 text-[16.5px] leading-[1.6] text-[var(--dim)] max-w-[56ch]",
            align === "center" ? "mx-auto" : "",
          ].join(" ")}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

export function Mechanism() {
  const steps = [
    {
      n: "01",
      t: "Encrypt locally",
      d: "Side, price tick and size are encrypted in your browser via the Zama relayer. Plaintext never leaves your machine.",
      ic: "lock" as const,
    },
    {
      n: "02",
      t: "Seal on-chain",
      d: "Your ciphertexts land as a single sealed bid. Per-tick volumes accumulate as encrypted aggregates — unreadable to everyone, including the contract.",
      ic: "grid" as const,
    },
    {
      n: "03",
      t: "Batch closes",
      d: "After a fixed block window the batch seals. No order, depth, or imbalance was ever observable while it was open.",
      ic: "clock" as const,
    },
    {
      n: "04",
      t: "Uniform clearing",
      d: "Aggregates are made publicly decryptable; any solver computes the one clearing tick. Everyone trades at the same fair price.",
      ic: "scale" as const,
    },
    {
      n: "05",
      t: "Private fills",
      d: "Per-user fills are computed under FHE and stay decryptable only by you, via EIP-712. The book reveals totals, never identities.",
      ic: "eye-off" as const,
    },
  ];
  return (
    <section className="max-w-[1200px] mx-auto px-7 py-[120px]" id="how">
      <SectionHead
        eyebrow="The mechanism"
        title={
          <>
            How a batch clears{" "}
            <span className="text-[var(--dim)] font-normal">— without ever seeing your order</span>
          </>
        }
        sub="A sealed-bid, uniform-price batch auction. Five steps, zero leakage."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {steps.map((s, i) => (
          <div
            key={s.n}
            className="relative p-6 border border-[var(--line)] rounded-[var(--radius)] bg-[color-mix(in_oklab,var(--bg2)_60%,transparent)] transition-all duration-300 hover:border-[var(--line2)] hover:-translate-y-[3px]"
          >
            <div className="flex items-center justify-between mb-[18px]">
              <span className="font-[var(--font-mono)] text-[13px] text-[var(--faint)] tracking-[0.1em]">
                {s.n}
              </span>
              <span className="w-10 h-10 rounded-[10px] grid place-items-center bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-[var(--accent)]">
                <Icon name={s.ic} size={20} />
              </span>
            </div>
            <h3 className="text-base font-semibold m-0 mb-2.5 tracking-[-0.01em]">{s.t}</h3>
            <p className="text-[13.5px] leading-[1.55] text-[var(--dim)] m-0">{s.d}</p>
            {i < steps.length - 1 && (
              <span className="hidden lg:grid absolute right-[-14px] top-9 z-[2] text-[var(--faint)] bg-[var(--bg)] w-7 h-7 rounded-full place-items-center">
                <Icon name="arrow" size={16} />
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Primitives() {
  const cards = [
    {
      ic: "grid" as const,
      tag: "CLOB",
      t: "Sealed-bid batch CLOB",
      d: "Encrypted side, tick and size. Per-tick aggregate volumes accumulate as ciphertexts; clearing computed under FHE after close.",
    },
    {
      ic: "scale" as const,
      tag: "Lending",
      t: "Cross-margined vault",
      d: "An euint64 health factor that's never revealed. Liquidation eligibility is computed under FHE and decrypted only by keepers when the flag flips.",
    },
    {
      ic: "layers" as const,
      tag: "Settlement",
      t: "ERC-7984 wrappers",
      d: "Confidential cUSDC / cUSDT / cWETH as the settlement layer — live on Sepolia and Ethereum mainnet.",
    },
    {
      ic: "key" as const,
      tag: "Compliance",
      t: "Regulator-key hatch",
      d: "Delegated decryption gives institutions an auditable compliance path — without exposing the book to the public.",
    },
  ];
  return (
    <section className="max-w-[1200px] mx-auto px-7 pb-[120px]">
      <SectionHead eyebrow="The system" title="Four primitives, one product" />
      <div className="grid sm:grid-cols-2 gap-[18px]">
        {cards.map((c) => (
          <div
            key={c.tag}
            className="group relative p-8 border border-[var(--line)] rounded-[var(--radius)] bg-[color-mix(in_oklab,var(--bg2)_55%,transparent)] overflow-hidden transition-all duration-300 hover:border-[var(--line2)] hover:-translate-y-[3px]"
          >
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_100%_0%,var(--glow),transparent_55%)] opacity-0 group-hover:opacity-[0.35] transition-opacity duration-300" />
            <div className="w-13 h-13 rounded-[13px] grid place-items-center bg-[var(--bg3)] border border-[var(--line2)] text-[var(--accent)] mb-5">
              <Icon name={c.ic} size={24} />
            </div>
            <span className="font-[var(--font-mono)] text-[11px] tracking-[0.14em] uppercase text-[var(--dim)]">
              {c.tag}
            </span>
            <h3 className="text-[21px] font-semibold tracking-[-0.02em] mt-2 mb-3">{c.t}</h3>
            <p className="text-[15px] leading-[1.6] text-[var(--dim)] m-0 max-w-[42ch]">{c.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WhyFHE() {
  return (
    <section className="max-w-[1200px] mx-auto px-7 py-[120px]" id="why">
      <div className="grid md:grid-cols-2 gap-16 items-center">
        <div>
          <Eyebrow>Why FHE</Eyebrow>
          <h2 className="text-[clamp(2rem,3.8vw,3.3rem)] leading-[1.02] tracking-[-0.03em] font-semibold mt-[18px]">
            Private by <span className="text-[var(--accent)]">construction</span>,<br />
            not by latency.
          </h2>
          <p className="mt-5 text-[16.5px] leading-[1.6] text-[var(--dim)] max-w-[56ch]">
            Every &ldquo;private&rdquo; DEX shipped to date reveals order state at match time — they
            just race to settle before the leak matters. Veil keeps orders, depth and health factors
            encrypted end-to-end under FHE. There is no moment of exposure to win.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="border border-[var(--line)] rounded-[var(--radius)] p-6 bg-[color-mix(in_oklab,var(--bg2)_50%,transparent)]">
            <div className="font-[var(--font-mono)] text-xs tracking-[0.08em] uppercase text-[var(--dim)] pb-4 mb-4 border-b border-[var(--line)]">
              Latency-based &ldquo;privacy&rdquo;
            </div>
            <ul className="m-0 p-0 list-none flex flex-col gap-3.5">
              {[
                "Order revealed at match time",
                "Depth scraped by fast bots",
                "Front-run in the mempool",
                "Privacy = a head start",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm leading-[1.4] text-[var(--dim)]">
                  <span className="text-[var(--sell)] mt-px flex-none">
                    <Icon name="eye-off" size={16} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="border rounded-[var(--radius)] p-6 border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)] shadow-[0_0_50px_-20px_var(--glow)]">
            <div className="font-[var(--font-mono)] text-xs tracking-[0.08em] uppercase text-[var(--accent)] pb-4 mb-4 border-b border-[var(--line)]">
              <Wordmark className="text-[13px] text-[var(--accent)]" />
            </div>
            <ul className="m-0 p-0 list-none flex flex-col gap-3.5">
              {[
                "Encrypted from your browser",
                "Depth never decrypts",
                "Nothing to front-run",
                "Privacy = cryptographic",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm leading-[1.4] text-[var(--text)]">
                  <span className="text-[var(--accent)] mt-px flex-none">
                    <Icon name="check" size={16} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Vault() {
  const [reveal, setReveal] = useState(false);
  return (
    <section className="max-w-[1200px] mx-auto px-7 py-[120px]" id="vault">
      <div className="grid lg:grid-cols-[1fr_0.85fr] gap-16 items-center">
        <div>
          <Eyebrow>Cross-margin lending</Eyebrow>
          <h2 className="text-[clamp(2rem,3.6vw,3.1rem)] leading-[1.04] tracking-[-0.025em] font-semibold mt-[18px]">
            Borrow against an encrypted health factor.
          </h2>
          <p className="mt-5 text-[16.5px] leading-[1.6] text-[var(--dim)] max-w-[56ch]">
            Your collateral, debt and the{" "}
            <span className="font-[var(--font-mono)] text-[0.9em] px-1.5 py-px bg-[var(--bg3)] rounded text-[var(--accent)]">
              euint64
            </span>{" "}
            health factor that ties them together are never revealed. Liquidation eligibility is
            evaluated <em>under</em> FHE — keepers only ever learn a single bit, and only when it
            flips.
          </p>
          <ul className="list-none m-0 mt-7 p-0 flex flex-col gap-4">
            {[
              { ic: "shield" as const, t: "Positions stay confidential — no one can target your liquidation level." },
              { ic: "bolt" as const, t: "Liquidation flag decrypted by permissionless keepers via delegated decryption." },
              { ic: "scale" as const, t: "Cross-margined against the same confidential settlement assets." },
            ].map((p) => (
              <li key={p.t} className="flex gap-3 items-start text-[15px] leading-[1.5] text-[var(--dim)]">
                <span className="text-[var(--accent)] flex-none mt-px">
                  <Icon name={p.ic} size={18} />
                </span>
                <span>{p.t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="veil-panel p-[26px]">
          <div className="veil-panel-glow" />
          <div className="relative flex items-center justify-between mb-5 text-[11px] tracking-[0.18em] text-[var(--faint)] font-[var(--font-mono)]">
            <span>POSITION</span>
            <Pill tone={reveal ? "buy" : "warn"} dot>
              {reveal ? "Healthy" : "Encrypted"}
            </Pill>
          </div>
          <div className="relative flex flex-col">
            {[
              ["Collateral", "42.0 cWETH"],
              ["Borrowed", "61,200 cUSDC"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between py-3.5 border-b border-[var(--line)] text-sm text-[var(--dim)]"
              >
                <span>{k}</span>
                <span className="font-[var(--font-mono)] text-[var(--text)] whitespace-nowrap">{v}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-3.5 text-sm">
              <span className="text-[var(--text)] font-medium">Health factor</span>
              <span className="font-[var(--font-mono)] text-[18px] text-[var(--text)]">
                <Redacted revealed={reveal} len={4}>
                  1.84
                </Redacted>
              </span>
            </div>
          </div>
          <div className="relative my-1.5 mb-5">
            <div className="relative h-2 rounded-full bg-[var(--bg3)] overflow-hidden">
              <div
                className="absolute left-0 top-0 bottom-0 rounded-full bg-[linear-gradient(90deg,var(--sell),#f5c14e_45%,var(--buy))] transition-[width] duration-[1000ms]"
                style={{ width: reveal ? "68%" : "0%" }}
              />
              <div className="absolute left-[22%] -top-[3px] -bottom-[3px] w-[2px] bg-[var(--sell)] opacity-80" />
            </div>
            <div className="flex justify-between text-[10px] tracking-[0.1em] uppercase text-[var(--faint)] mt-2 font-[var(--font-mono)]">
              <span>liquidation</span>
              <span>safe</span>
            </div>
          </div>
          <div className="relative flex items-start gap-2.5 px-3.5 py-3 rounded-[10px] bg-[var(--bg3)] text-[13px] leading-[1.45] text-[var(--dim)] mb-[18px]">
            <span className="text-[var(--accent)] flex-none mt-px">
              <Icon name={reveal ? "shield" : "lock"} size={16} />
            </span>
            <span>
              {reveal
                ? "Above threshold — no liquidation. Only this bit was ever decrypted."
                : "Liquidation flag is computed under FHE and stays sealed."}
            </span>
          </div>
          <Btn variant="outline" size="sm" className="w-full" onClick={() => setReveal((r) => !r)}>
            <Icon name={reveal ? "eye-off" : "key"} size={15} />
            {reveal ? "Re-seal position" : "Simulate keeper check"}
          </Btn>
        </div>
      </div>
    </section>
  );
}

export function Compliance() {
  return (
    <section className="max-w-[1200px] mx-auto px-7 py-[120px]" id="compliance">
      <SectionHead
        eyebrow="The compliance hatch"
        title="Confidential for the market. Auditable for the regulator."
        sub="Delegated decryption lets an institution grant a scoped regulator key — turning Veil into something a desk can actually run — without ever opening the book to the public."
        align="center"
      />
      <div className="grid lg:grid-cols-[auto_1fr] gap-7 items-center max-w-[880px] mx-auto">
        <div className="border border-[var(--line2)] rounded-[var(--radius)] px-[30px] py-[26px] bg-[var(--bg2)] flex flex-col items-center gap-2 text-center">
          <span className="text-[var(--accent)]">
            <Icon name="lock" size={20} />
          </span>
          <strong className="text-base font-semibold">Encrypted state</strong>
          <span className="font-[var(--font-mono)] text-[11px] text-[var(--faint)] tracking-[0.04em]">
            orders · depth · health
          </span>
        </div>
        <div className="flex flex-col gap-3.5 relative">
          <div className="grid sm:grid-cols-[150px_1fr_auto] gap-4 items-center px-5 py-4 rounded-[var(--radius)] border border-[var(--line)] bg-[color-mix(in_oklab,var(--bg2)_50%,transparent)]">
            <span className="text-[13px] font-medium inline-flex items-center gap-2">Public</span>
            <span className="font-[var(--font-mono)] text-[13px] text-[var(--dim)] tracking-[0.05em]">
              <Cipher len={10} active />
            </span>
            <span className="font-[var(--font-mono)] text-[10.5px] tracking-[0.08em] uppercase text-[var(--faint)]">
              sees nothing
            </span>
          </div>
          <div className="grid sm:grid-cols-[150px_1fr_auto] gap-4 items-center px-5 py-4 rounded-[var(--radius)] border bg-[color-mix(in_oklab,var(--bg2)_50%,transparent)] border-[color-mix(in_oklab,var(--accent)_35%,transparent)]">
            <span className="text-[13px] font-medium inline-flex items-center gap-2 text-[var(--accent)]">
              <Icon name="key" size={14} />
              Regulator key
            </span>
            <span className="font-[var(--font-mono)] text-[13px] text-[var(--accent)] tracking-[0.05em]">
              audit view
            </span>
            <span className="font-[var(--font-mono)] text-[10.5px] tracking-[0.08em] uppercase text-[var(--faint)]">
              scoped · delegated
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ZamaBand() {
  return (
    <section className="max-w-[1200px] mx-auto px-7 pb-[120px]">
      <div className="flex items-center justify-between gap-7 px-[34px] py-[30px] border border-[var(--line)] rounded-[var(--radius)] bg-[color-mix(in_oklab,var(--bg2)_60%,transparent)] flex-wrap">
        <div className="flex items-center gap-4">
          <i className="veil-zama-mark inline-block w-[38px] h-[38px] rounded-[10px]" />
          <div>
            <div className="text-[17px] font-semibold">Built on the Zama Protocol</div>
            <div className="text-[13px] text-[var(--dim)] font-[var(--font-mono)] mt-[3px]">
              FHEVM · confidential smart contracts on Ethereum
            </div>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          {["cUSDC", "cUSDT", "cWETH"].map((t) => (
            <div
              key={t}
              className="flex flex-col gap-[3px] px-[18px] py-3 border border-[var(--line2)] rounded-[10px]"
            >
              <span className="text-sm text-[var(--text)] font-[var(--font-mono)]">{t}</span>
              <span className="text-[10.5px] text-[var(--faint)] font-[var(--font-mono)] tracking-[0.05em]">
                ERC-7984 · live
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CTA() {
  return (
    <section className="max-w-[1200px] mx-auto px-7 pb-[120px]">
      <div className="relative border border-[var(--line2)] rounded-[calc(var(--radius)+6px)] px-10 py-20 text-center overflow-hidden bg-[color-mix(in_oklab,var(--bg2)_60%,transparent)]">
        <div className="veil-cta-grid" />
        <div className="relative">
          <Eyebrow align="center">Ready when you are</Eyebrow>
        </div>
        <h2 className="relative text-[clamp(2rem,4vw,3.4rem)] leading-[1.05] tracking-[-0.03em] font-semibold mt-[18px] mb-8">
          Trade like no one is watching.
          <br />
          Because no one can.
        </h2>
        <div className="relative flex gap-3.5 justify-center flex-wrap">
          <a href="/app/v2">
            <Btn variant="primary" size="lg">
              Launch app
              <Icon name="arrow" size={18} />
            </Btn>
          </a>
          <a href="#how">
            <Btn variant="ghost" size="lg">
              How it works
            </Btn>
          </a>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[var(--line)]">
      <div className="max-w-[1200px] mx-auto px-7 py-9 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Wordmark className="text-base" />
          <span className="text-[13px] text-[var(--faint)]">
            Confidential MEV-resistant DEX
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 text-[12.5px] text-[var(--dim)] font-[var(--font-mono)]">
          <span>Zama Developer Program · Mainnet Season 3 · Builder Track</span>
          <span className="text-[var(--faint)]">Composable Privacy Is the Key</span>
        </div>
      </div>
    </footer>
  );
}
