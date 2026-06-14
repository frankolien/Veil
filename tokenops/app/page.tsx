import { ConnectButton } from "@/components/connect-button";
import { DispersePanel } from "@/components/disperse-panel";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-xl font-semibold text-violet-400">MIST</span>
            <span className="hidden text-sm text-zinc-500 sm:inline">
              confidential disperse · Zama × TokenOps
            </span>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:gap-10 sm:px-6 sm:py-10">
        <section>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Pay everyone. Reveal nothing.
          </h1>
          <p className="mt-3 max-w-3xl text-zinc-400">
            Mist turns confidential bulk disperse into a paste-and-go flow. Amounts are encrypted
            in your browser, bundled through the TokenOps disperse singleton, and settled in a
            single ERC-7984 transfer. Recipient addresses are public; per-recipient amounts are
            not.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] text-zinc-500">
            <span className="rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-1">
              ERC-7984
            </span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-1">
              Zama FHEVM
            </span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-1">
              @tokenops/sdk
            </span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900/40 px-2.5 py-1">
              Sepolia
            </span>
          </div>
        </section>

        <DispersePanel />
      </main>

      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-zinc-500 sm:px-6">
          <span>Zama Developer Program Season 3 · TokenOps Special Bounty</span>
          <span>Submission · 2026-07-07</span>
        </div>
      </footer>
    </div>
  );
}
