# Veil — Roadmap

Status: draft · Last updated: 2026-05-29

The canonical week-by-week plan. Replaces the session todo list as the source of truth across conversations.

Today is 2026-05-29. The Zama Developer Program Season 3 deadline is 2026-07-07 — 39 days, 5.5 calendar weeks. The week-numbering below counts from project start (2026-05-22). Dates are soft; the roadmap commits to *order and exit criteria*, not to calendar weeks.

Status legend: ✓ shipped · ◑ in-progress · ◯ planned

## Week 1 — Bootstrap and v0 primitive

2026-05-22 → 2026-05-29 · **All shipped**

| Deliverable | Status |
|-------------|--------|
| Monorepo (`contracts/`, `web/`, `tokenops/`) with Hardhat + Next.js 16 + Tailwind 4 scaffolds | ✓ |
| `VeilBatchAuction.sol` v0: encrypted orders + per-tick FHE aggregation + `closeBatch`/`submitClearing` skeleton | ✓ |
| Hardhat tests passing for v0 contract | ✓ |
| Web app: providers (`@zama-fhe/react-sdk`, wagmi v3), wallet connect, `/app` page render | ✓ |
| `tokenops/` workspace (Mist): `@tokenops/sdk` disperse panel | ✓ |
| Design system pass: Aurora theme, landing page, live orderbook visual | ✓ |
| `WagmiSigner` shim for both web apps (upstream `watchConnection` export missing) | ✓ |
| `.gitignore` + first commit + GitHub push | ✓ |

**Exit criterion** — Project boots end-to-end on localhost; first encrypted tx submitted on Sepolia even if mocked downstream. **Met.**

## Week 2 — Pro-rata clearing + live Sepolia lifecycle

2026-05-29 → 2026-06-05 · **Partially shipped, escrow remaining**

| Deliverable | Status |
|-------------|--------|
| Contract v1: pro-rata fills at marginal tick (`marginalBuyBps`, `marginalSellBps`) | ✓ |
| Contract: `viaIR` enabled to escape stack-too-deep | ✓ |
| Hardhat tests for v1 pro-rata: balanced clearing, buy-side rationing, sell-side rationing, edge cases | ✓ |
| Deployed to Sepolia (`0xde5aC3708831BDd2DfDbF00614A2717f76eacb7e`) | ✓ |
| Hardhat task pack (`task:veil:status`, `task:veil:close`, `task:veil:clear`, `task:veil:my-fill`) with off-chain `computeClearing` | ✓ |
| Frontend: `SepoliaConfig` spread into `RelayerWeb` transports; FHE worker initialises cleanly | ✓ |
| Frontend: `useVeilLifecycle` reads `currentBatchId` + `getBatchState` + `getOrderCount` every block | ✓ |
| Frontend: tx receipt awaited; reverts surface in the form | ✓ |
| Frontend: `<OrderRow>` per user order with `useUserDecrypt` on the on-chain fill handle | ✓ |
| Frontend: auto-switch to Sepolia + disconnect button + chain-pin on writes + 15M gas pin | ✓ |
| `docs/` enterprise-doc folder (00 PRD, 01 architecture, 02 algorithm, 03 data-models, 05 roadmap, 07 security; remaining in Round 3) | ◑ |
| **ERC-7984 escrow**: user `setOperator(VeilBatchAuction, +24h)` once; contract pulls collateral via `confidentialTransferFrom` inside `placeOrder` | ◯ |
| **Per-user `settle(batchId, orderIdx)`** release filled side + unfilled remainder | ◯ |

**Exit criterion** — A trader can place an encrypted order *with real cWETH/cUSDC collateral* on Sepolia, wait for clearing, and pull settled value via `settle()`. The escrow + settle pieces will likely slip into Week 3.

## Week 3 — Settlement + solver hardening

2026-06-05 → 2026-06-12

| Deliverable | Status |
|-------------|--------|
| Carry-over from Week 2: ERC-7984 escrow + `settle()` | ◯ |
| Frontend: "Approve Veil to spend cWETH/cUSDC" one-time `setOperator` UX | ◯ |
| Frontend: settle button per cleared order; show post-settle clear balances via `useConfidentialBalance` | ◯ |
| Off-chain solver bot: long-running node process that watches `BatchClosed` events and auto-runs `closeBatch`/`submitClearing` | ◯ |
| Solver-malfeasance challenge mechanism (ADR-003 outcome dictates: on-chain re-verify OR off-chain detect-and-replace) | ◯ |
| Frontend: error UX for custom errors (decode `BatchNotOpen` etc. into specific UI states) | ◯ |
| **First real-value cleared batch on Sepolia** (target metric) | ◯ |

**Dependencies** — Need `setOperator` UX before `placeOrder` can pull collateral. Need a deployed ERC-7984 token; use the Confidential Wrappers Registry's existing Sepolia cWETH/cUSDC.

**Exit criterion** — Demo flow runs end-to-end with real token movement: setOperator → placeOrder (collateral escrowed) → wait → closeBatch → submitClearing → settle (collateral released to trader as fill side + unfilled side).

**Risks** — ERC-7984 operator UX is a new wallet flow for users; if MetaMask doesn't render `confidentialTransferFrom` calldata helpfully we may need a "what is this asking me to do?" callout in the frontend. Mitigation: explanatory paragraph in the approval step.

## Week 4 — Cross-margin lending vault

2026-06-12 → 2026-06-19

| Deliverable | Status |
|-------------|--------|
| `VeilLendingVault.sol`: deposit confidential collateral, borrow encrypted amount | ◯ |
| Encrypted health factor maintained as `euint64` per account | ◯ |
| Delegated-decrypt liquidation: keeper can request decrypt of a flagged account's health factor via on-chain delegation grant | ◯ |
| Tests: deposit, borrow, accrual, liquidation under FHE | ◯ |
| Deployed to Sepolia | ◯ |
| Frontend: minimal vault UI (no rebuild of full DEX UX yet) | ◯ |

**Dependencies** — ERC-7984 settlement layer from Week 3 (the vault uses it for collateral).

**Exit criterion** — One full liquidation under FHE on Sepolia, with the health-factor decision made on the encrypted value and the liquidation keeper paid out.

**Risks** — Delegated-decryption is the newest Zama unlock; if the React SDK's `useDelegateDecryption` flow has rough edges we may need to fall back to a Hardhat-task-driven liquidation for the demo. Acceptable degradation.

## Week 5 — Composition + regulator key + gas profile

2026-06-19 → 2026-06-26

| Deliverable | Status |
|-------------|--------|
| Compose CLOB + lending: a position in the vault can be a Veil order's collateral | ◯ |
| Keeper bot consolidated: solver loop + liquidation watcher in one binary | ◯ |
| Regulator-key registry contract (delegated decryption with revocable, per-account grants) | ◯ |
| Frontend: "extend audit access" toggle per account | ◯ |
| **Gas profile pass**: measure `placeOrder`, `closeBatch`, `submitClearing` for N ∈ {1, 10, 50} orders × NUM_TICKS ∈ {4, 8} | ◯ |
| Update `02-algorithm.md` and `00-prd.md` with measured numbers (replaces every TBD) | ◯ |
| One round of `solhint --max-warnings 0` and frontend type-clean pass | ◯ |

**Exit criterion** — All four primitives (CLOB, escrow, vault, regulator key) live on Sepolia and composable through a single contract address per primitive. Gas + per-tx cost numbers are real and quoted in the PRD.

**Risks** — Solving everything in one week is aggressive. If composition + regulator key + gas profile can't all fit, drop composition to v2 of the docs and ship the three discrete primitives.

## Week 6 — Polish, demo, submission

2026-06-26 → 2026-07-07

| Deliverable | Status |
|-------------|--------|
| 3-minute demo video (single take, no edits) | ◯ |
| Sepolia frozen as canonical demo (no further deploys) | ◯ |
| Final pass through every doc: kill TODOs, update line refs, verify URLs, check for stale references | ◯ |
| README at root pointing at `docs/README.md` and the live demo URL | ◯ |
| Mainnet deploy if gas budget allows (stretch) | ◯ |
| **Builder Track submission** (Veil) on community.zama.org | ◯ |
| **TokenOps Special Bounty submission** (Mist) on community.zama.org | ◯ |

**Exit criterion** — Both submissions filed before 2026-07-07 23:59 AOE. Demo video plays. Sepolia contracts respond. Docs cross-link cleanly.

**Risks** — Last-week scope creep. Mitigation: Week 5 ends with a frozen feature set; Week 6 is exclusively docs/video/submission.

## Dependency graph

```
Week 1 ─▶ Week 2 ─┬─▶ Week 3 ─▶ Week 4 ─▶ Week 5 ─▶ Week 6
                  │                ▲          │
                  └── (escrow ◯) ──┘          │
                                              │
docs/ Round 2 ─▶ docs/ Round 3 ──────────────▶┘ (final pass)
```

The single critical-path dependency is **ERC-7984 escrow before lending vault** — the vault uses confidential tokens for collateral and the operator-set pattern is the same in both. Everything else can parallelise.

## Slip plan

If Week 4 lending vault doesn't ship cleanly, the fallback for the Builder submission is **CLOB + escrow + regulator key, no lending vault**. This is still a defensible Builder Track submission (composability of CLOB + ERC-7984 + delegated-decryption) and avoids a half-finished lending primitive that would weaken the submission.

The Mist (TokenOps Special Bounty) submission is independent and already largely scaffolded; it ships even if Veil's main track slips.

## Out-of-roadmap (post-grant)

- Mainnet deploy
- EVM L2 deploys (Zama H1 2026 roadmap)
- Multi-market routing (cWETH/cUSDT, cZAMA/cUSDC, etc.)
- Mobile-first wallet UX
- Continuous (non-batched) variant — would require resolving the no-encrypted-divisor problem differently

## Open questions

- **Calendar slip absorbed where?** Week 5 has the most discretionary scope; the gas-profile pass is the easiest to compress (a single afternoon of measurement). Composition is the easiest to drop.
- **Solver/keeper hosting.** Week 5 wants a long-running bot but the docs don't yet say where it runs. Render.com / Fly.io / a Hetzner box — pick before Week 5.
- **Mainnet stretch goal.** If we mainnet-deploy in Week 6, do we deploy with real tokens? cUSDT is live on Ethereum mainnet; using it would prove the design. But: real value, no audit. Default: skip mainnet for the submission, deploy post-grant.
