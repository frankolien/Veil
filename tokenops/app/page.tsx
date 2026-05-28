import { ConnectButton } from "@/components/connect-button";
import { DispersePanel } from "@/components/disperse-panel";
import { DISPERSE_TOKEN, hasToken, shortAddr } from "@/lib/config";

export default function Home() {
  const tokenConfigured = hasToken();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-xl font-semibold text-violet-400">MIST</span>
            <span className="text-sm text-zinc-500">
              confidential disperse · powered by Zama × TokenOps
            </span>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10">
        <section>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
            Pay everyone, reveal nothing.
          </h1>
          <p className="mt-3 max-w-3xl text-zinc-400">
            Mist turns a confidential disperse into a paste-and-go flow. Amounts are encrypted in
            your browser, bundled by the TokenOps disperse singleton, and settled in a single
            ERC-7984 transfer. Recipients can verify and decrypt only their own allocation.
          </p>
          {tokenConfigured && (
            <p className="mt-2 text-xs text-zinc-500">
              Token: <code className="rounded bg-zinc-900 px-1.5 py-0.5">{shortAddr(DISPERSE_TOKEN)}</code>
            </p>
          )}
        </section>

        {!tokenConfigured && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/60 p-6 text-sm text-zinc-400">
            <p className="font-medium text-zinc-200">No token configured.</p>
            <p className="mt-2">
              Set <code className="rounded bg-zinc-800 px-1.5 py-0.5">NEXT_PUBLIC_DISPERSE_TOKEN</code> in
              <code className="ml-1 rounded bg-zinc-800 px-1.5 py-0.5">tokenops/.env.local</code> to any
              ERC-7984 token (e.g. cUSDC on Sepolia from the Confidential Wrappers Registry).
            </p>
          </div>
        )}

        <DispersePanel />
      </main>

      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-4 text-xs text-zinc-500">
          <span>Zama Developer Program Season 3 · TokenOps Special Bounty</span>
          <span>Submission deadline · 2026-07-07</span>
        </div>
      </footer>
    </div>
  );
}
