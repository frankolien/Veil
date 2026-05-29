# Veil — Stack and Tradeoffs

Status: draft · Last updated: 2026-05-29

The honest defense of every load-bearing dependency. Each section answers "why this, not the obvious alternative?" — and where there is no compelling reason beyond familiarity, says so.

## Zama FHEVM

**Why FHE over ZK.** A confidential CLOB needs *shared encrypted state* that many parties update concurrently (the per-tick aggregate volumes). ZK rollups handle private *local* state well — every prover proves their own statement — but a shared, mutable encrypted state across N concurrent participants is a hard ZK design problem (it pushes into MPC-or-PIR territory). FHE evaluates the circuit on ciphertexts directly; the validator runs the program without needing to decrypt or coordinate. The trade is the gas cost of FHE primitives and the trust assumption on the KMS quorum.

**Why FHEVM specifically over other FHE substrates.** FHEVM compiles Solidity directly. Other FHE projects (Sunscreen, Concrete) require writing in a different DSL. For a 6-week project shipped to a Solidity-native audience, the cost of learning the substrate dominates the cost of the FHE math.

**What we accept.** The KMS trust assumption is what it is (see `07-security.md`). Per-op gas is higher than plaintext EVM (see `02-algorithm.md`).

## Solidity 0.8.27 + `@fhevm/solidity` + `viaIR`

**Version pin.** 0.8.27 is what Zama's Hardhat template ships with. We follow.

**`viaIR` justification.** See ADR-004. Required to compile `submitClearing`'s deep FHE local stack without manual function-extraction. The cost is ~3× slower compilation; the alternative is a more brittle code structure.

**Alternative considered.** Refactor the per-order body into helper functions. Rejected: each FHE handle passed across a function boundary costs an extra memory copy and stack-slot, undoing the win.

## Hardhat + `@fhevm/hardhat-plugin` + `@zama-fhe/relayer-sdk`

**Why Hardhat over Foundry.** The `@fhevm/hardhat-plugin` provides `hre.fhevm.initializeCLIApi()` and the high-level `userDecryptEuint`, `publicDecryptEuint` helpers used heavily in `contracts/tasks/Veil.ts`. Equivalent Foundry tooling does not exist in the official Zama distribution as of this writing.

**Why TypeScript over JS for tests.** Catches the most common contract/test mismatches (event arg shapes, struct destructuring) at compile time. `npm run test` runs in ~10s; the type-check is amortised.

## Next.js 16 (App Router)

**Why Next over Remix / Vite-only.** App Router's per-route layout + server components let the landing page and the `/app` trading interface share providers without re-mounting wagmi's QueryClient between routes. Remix would also work; Next is what we know and the React SDK examples are written against it.

**Why Webpack mode, not Turbopack.** See ADR-006. Turbopack's parser rejects the right-associative `**` operator in `@zama-fhe/sdk` 0.4.x bundles. Both `web/` and `tokenops/` run `--webpack` until upstream fix.

## wagmi v3 + viem + `@zama-fhe/react-sdk`

**Why wagmi v3 over RainbowKit / ConnectKit / web3-react.** wagmi v3 + viem is the minimum viable stack — `useAccount`, `useConnect`, `useWriteContract`, `useReadContract`. We do not need the wallet-selector UX layer that RainbowKit provides; the injected connector is enough for a Sepolia demo. Adding a higher-level kit would mean another peer dependency to lock against the v3 SDK.

**Why a custom `WagmiSigner` shim.** See ADR-007. Upstream `@zama-fhe/react-sdk/wagmi`'s `WagmiSigner` imports a wagmi symbol (`watchConnection`) that no longer exists. Our shim is a 30-line `GenericSigner` implementation against `wagmi/actions`. It omits the optional `subscribe` hook (only used for connection-change side effects we do not need).

**Why direct `useReadContract` instead of TanStack Query patterns inside a wagmi factory.** wagmi v3 ships TanStack Query under the hood; `useReadContract({ query: { refetchInterval: 4000 } })` is the idiomatic pattern. We use it directly in `web/lib/use-veil-lifecycle.ts` without an extra abstraction.

## Tailwind CSS 4 + CSS variables

**Why Tailwind 4.** v4's CSS-variable theming (`var(--accent)`, `color-mix(in oklab, …)`) makes the Aurora design system trivial — every accent shade is one source-of-truth variable, used across components without prop-drilling. v3 with JIT would also work, but the design system was already prototyped against v4 syntax.

**Why no component library** (Radix, ShadCN). The component surface is small: forms, panels, pills, a chart. A library is overkill; the bespoke primitives in `web/components/veil/primitives.tsx` are ~400 lines and serve every need.

## `tokenops/` — Mist parallel submission

**Why a separate Next workspace, not a route inside `web/`.** Mist targets a different grant track (TokenOps Special Bounty, $2,500) with a different value proposition (confidential token disperse via `@tokenops/sdk`). Separating it lets each project have its own deploy target, its own design tweaks, and its own submission story. The shared infrastructure (wagmi config, `WagmiSigner` shim, design tokens) is small enough to maintain in two copies; if it grows we factor into a shared package.

**Why wagmi v3 override in `tokenops/package.json`.** `@tokenops/sdk` declares a wagmi peer-dep with a wide range that npm resolves to v2; we force v3 via `overrides` to match `@zama-fhe/react-sdk`'s expectation.

## What we do not use, and why

- **Foundry.** No first-party Zama plugin (see above).
- **RainbowKit / ConnectKit.** Single connector (injected); the wallet-selector UX layer isn't worth the dep weight for a Sepolia demo.
- **Subgraph / The Graph.** Indexing 1–5 batches per day on Sepolia does not warrant a subgraph. Direct `useReadContract` polling is fine through v1.
- **Wagmi server actions.** All on-chain calls are client-side from the trader's wallet.
- **A backend.** No off-chain DB, no API server. The solver is a Hardhat task today; Week 5 makes it a long-running process but still without an HTTP API.

## Open questions

- **Solver hosting.** Week 5 wants a long-running keeper bot. Render.com vs Fly.io vs a Hetzner VM — pick before Week 5.
- **Monorepo manager.** Three workspaces with independent `node_modules/`. Worth pulling into pnpm workspaces? Probably yes for cross-workspace deps; not yet warranted.
- **Component library, post-grant.** If the design system grows beyond `primitives.tsx`, factor into a `packages/ui/`.
