# Veil — Product Requirements

Status: draft · Last updated: 2026-05-29

## Problem

Every limit order on a public chain is visible to everyone the moment it touches the mempool. The cost of that visibility is the MEV economy: searchers front-run, sandwich, and snipe in the window between order broadcast and inclusion. Liquidity providers pay it as worse spreads; informed traders pay it as worse execution.

The existing mitigations each give up something Veil keeps:

- **Off-chain orderbooks** (dYdX v4) require trust in validators who see the whole book.
- **RFQ venues** (Hashflow, Aori) remove price discovery — the maker sets the price.
- **Batch auctions with plaintext solver bids** (CoW) protect against public observers but expose orders to the solver set.
- **Shielded-pool wrappers** (Railgun) hide *who* trades, not *what* clears.

Frequent batch auctions (Budish, Cramton, Shim 2015) remove the latency arms race that underlies most MEV. Sealed-bid auctions remove the strategic information asymmetry. Combined, they describe what Veil is — except that classical sealed-bid auctions need a trusted auctioneer.

FHE removes the auctioneer. Bids stay encrypted through aggregation, clearing, and per-user fill computation. Only the clearing price (everyone needs it) and each trader's own fill (only they need it) are ever decrypted.

## Users and jobs

v1's actual users are the demo operator and grant judges. The four personas below describe what the design supports, not a real user base today.

| User                    | Job                                                                                       | Status      |
|-------------------------|-------------------------------------------------------------------------------------------|-------------|
| Demo operator           | Walk through a sealed-bid lifecycle end to end on Sepolia in under 3 minutes              | v1 (real)   |
| Informed retail trader  | Place limit orders without revealing intent to other traders or to the proposer           | design target |
| Market maker            | Post depth without exposing inventory or spreads to competitors                            | design target |
| Aggregator              | Route MEV-sensitive flow through a venue whose matching cannot be observed                | design target |
| Regulator / institution | Audit specific accounts on demand via a delegated-decryption regulator key                | v3 design target |

## Scope (v1, shipping by 2026-07-07)

In:

- Sealed-bid uniform-price batch-auction CLOB. Single market: cWETH/cUSDC. NUM_TICKS=4 in v1, parameter not constant in v2.
- Per-tick FHE aggregation in a bounded loop. Plaintext-bps pro-rata at the marginal tick (sidesteps FHEVM's no-encrypted-divisor rule).
- Off-chain solver computes clearing tick + per-side bps from publicly-decrypted aggregates; submits on-chain. Anyone can run it.
- ERC-7984 settlement: escrow on `placeOrder`, per-user `settle()` after clearing.
- Cross-margin lending vault with encrypted health factor and delegated-decrypt liquidation.
- Regulator-key registry: a third-party can be granted decrypt rights over a specific account's encrypted state.

Out:

- Cross-chain routing, multi-asset markets beyond cWETH/cUSDC.
- Sub-second matching. Veil is a batched venue by design.
- Continuous-price (AMM) matching.
- Perpetuals, options, structured products.
- Mobile-first UX. Web only for v1.

## Non-goals

- Veil is **not a CEX killer.** Throughput is bounded by FHE op gas, currently ~3–6M per `placeOrder` on a 4-tick loop.
- Veil is **not a dark pool.** Clearing price is public; the aggregate book shape is public after batch close. Only individual bids and individual fills stay private.
- Veil does **not claim "uniform price is truthful."** Multi-unit uniform-price auctions suffer demand reduction (Ausubel & Cramton). Our narrower claim is that encrypted bids mitigate demand reduction by removing the ability to condition on others' bids — stated as a design hypothesis, treated as conjecture in the algorithm doc.

## Success metrics

Behavioural targets only. Cost and gas targets are intentionally absent — they need to be measured first (Week 5 gas-benchmark pass) and committed to in `08-decisions.md` rather than estimated here.

**Phase A — CLOB engine on Sepolia (v1, current scope)**

| Metric                                                    | Target |
|-----------------------------------------------------------|--------|
| End-to-end batch lifecycle on Sepolia (open → close → clear → user-decrypt fill) | works without manual recovery |
| Sealed orders placed against the live contract             | ≥ 20 across at least 3 distinct addresses |
| Batches cleared end-to-end                                 | ≥ 5 |
| `placeOrder` gas budget                                    | TBD — first profile lands in Week 5 |
| Per-order user cost                                        | TBD — first profile lands in Week 5 |

**Phase B — ERC-7984 settlement (v2)**

| Metric                                                                  | Target |
|-------------------------------------------------------------------------|--------|
| Sealed order escrows real cWETH/cUSDC via `confidentialTransferFrom`    | works |
| Per-user `settle(batchId, orderIdx)` releases the filled side           | works |
| End-to-end value moves on Sepolia in the demo                           | ≥ 1 cleared batch with real token settlement |

**Phase C — Cross-margin lending vault (v3)**

| Metric                                                                  | Target |
|-------------------------------------------------------------------------|--------|
| Encrypted health factor maintained as `euint64`                         | implemented |
| At least one successful delegated-decryption liquidation on Sepolia     | ≥ 1 |

**Phase D — Submission (v4)**

| Metric                                                                  | Target |
|-------------------------------------------------------------------------|--------|
| 3-minute demo video, no edits, one take                                 | shipped |
| Builder Track submission (Veil)                                         | shipped before 2026-07-07 |
| TokenOps Special Bounty submission (Mist)                               | shipped before 2026-07-07 |

## Demo flow (the 3-minute pitch)

1. **0:00 — Setup.** Open `/app`. MetaMask on Sepolia. Empty `MyOrders` panel, batch counter ticking down.
2. **0:30 — Encrypt.** Place a sealed buy at tick 2, size 100. UI walks: "encrypting → submitting → confirming → sealed." Open Etherscan in a second tab: calldata is opaque bytes, gas usage is high but bounded.
3. **1:00 — Close.** Terminal: `npx hardhat --network sepolia task:veil:close`. Per-tick aggregates flip to publicly-decryptable.
4. **1:30 — Solve.** `npx hardhat --network sepolia task:veil:clear`. Solver decrypts aggregates via relayer, picks clearing tick + bps, submits on-chain.
5. **2:00 — Reveal.** Back in UI: row flips to "decrypt fill" button. Click. Relayer requests user-decryption from KMS. Clear fill amount lands in the row.
6. **2:30 — Outside view.** Show what an outside observer saw on Sepolia: opaque calldata until clearing, then aggregate shape + uniform clearing price. Nothing else.

## Open questions

- **Indexed-trader leakage.** `OrderPlaced(uint256 indexed batchId, address indexed trader, uint256 orderIndex)` reveals the set of addresses participating in each batch. This is a real disclosure that needs a mitigation story (relayer-funded submissions, AA-bundled meta-tx, mixer in front, or just accept) before v2. Tracked in `07-security.md` and the future ADR-011.
- **Solver correctness.** v1 trusts the solver's submitted `(c*, marginalBuyBps, marginalSellBps)` for liveness and verifies off-chain. A wrong submission is publicly detectable but not on-chain-rejected. Whether v2 adds on-chain re-verification is open (gas cost vs trust assumption — `08-decisions.md` ADR-003).
- **NUM_TICKS in v2.** v1 fixes the tick grid at 4 for prototype gas budget. v2 should make it configurable; the question is how high it can go before `placeOrder` gas exceeds Sepolia's block budget. Empirical, gated on the Week 5 gas profile.
- **What "user cost" actually is.** The Zama litepaper cites $0.008–$0.8 for a confidential token transfer (3 decryptions). `placeOrder` has on the order of 20–30 FHE ops plus 3 input verifications. The actual per-order cost is unmeasured.
