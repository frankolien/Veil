# Veil — Documentation

Veil is a confidential MEV-resistant CLOB DEX built on Zama FHEVM, with a cross-margin lending vault and a regulator-key compliance hatch. Submission for the Zama Developer Program Mainnet Season 3 — Builder Track. Deadline 2026-07-07.

Live on Sepolia: `0xde5aC3708831BDd2DfDbF00614A2717f76eacb7e`.

## Reading order

Pick the path that matches why you're here.

**For grant judges (≈ 20 min).** Read in this order:
1. [`00-prd.md`](00-prd.md) — what we built and why
2. [`02-algorithm.md`](02-algorithm.md) — the matching mechanism, with a worked example
3. [`07-security.md`](07-security.md) — what we protect, what we don't
4. [`05-roadmap.md`](05-roadmap.md) — week-by-week deliverables and current status

**For contributors (≈ 45 min).** Add to the above:
5. [`01-architecture.md`](01-architecture.md) — components, leakage map, end-to-end sequence
6. [`03-data-models.md`](03-data-models.md) — Solidity structs, FHE handle lifecycle, frontend types
7. [`08-decisions.md`](08-decisions.md) — ADRs, why each design choice
8. [`04-stack.md`](04-stack.md) — stack rationale

**For future-me looking up "why did we…?".** Start at [`08-decisions.md`](08-decisions.md) and follow the cross-references.

**For background reading.** [`06-research.md`](06-research.md) — comparable systems (CoW, Renegade, Penumbra, dYdX v4, Aztec) and the academic citations for the MEV-resistance claim.

## Document index

| File                                       | Purpose                                                                                        |
|--------------------------------------------|------------------------------------------------------------------------------------------------|
| [`00-prd.md`](00-prd.md)                   | Problem, users, scope, non-goals, phased success metrics, demo flow                            |
| [`01-architecture.md`](01-architecture.md) | Components, leakage map, sequence diagrams, trust boundaries, deployment topology              |
| [`02-algorithm.md`](02-algorithm.md)       | Per-tick aggregation, clearing rule, pro-rata math, worked example, encrypted-bid conjecture   |
| [`03-data-models.md`](03-data-models.md)   | Solidity structs and events, FHE handle lifecycle, frontend types, v2 ERC-7984 preview         |
| [`04-stack.md`](04-stack.md)               | Why FHEVM, Hardhat, Next.js Webpack mode, wagmi v3, the `WagmiSigner` shim                     |
| [`05-roadmap.md`](05-roadmap.md)           | Six-week plan, weekly deliverables with shipped/in-progress/planned status, dependency graph    |
| [`06-research.md`](06-research.md)         | Comparable systems table + detail, academic grounding, Zama-internal references, open uncertainties |
| [`07-security.md`](07-security.md)         | Adversary classes, ACL surface, threats + mitigations, regulator-key path                       |
| [`08-decisions.md`](08-decisions.md)       | ADRs 001–011 in Nygard format (`NUM_TICKS=4`, viaIR, off-chain solver, ERC-7984 operator, …)    |

## How the docs evolve

- New decisions get a new ADR appended to [`08-decisions.md`](08-decisions.md), not edited in place.
- Each doc has an **Open questions** section at the bottom. When a question gets answered it moves into the relevant ADR (and the question is deleted).
- Every doc carries a `Last updated:` date at the top. If you're reading a doc and the date is stale, treat the content as a snapshot — verify against the codebase or open an issue.
- Cite by `path:line` when referring to code. Cite by `[doc.md#section]` when referring to other docs.

## External references

- **Zama Protocol** — [Litepaper](https://docs.zama.org/protocol/zama-protocol-litepaper), [FHE operations](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations), [Wrapper Registry](https://docs.zama.org/protocol/protocol-apps/confidential-tokens/wrapper-registry).
- **OpenZeppelin Confidential Contracts** — [Token API (ERC-7984)](https://docs.openzeppelin.com/confidential-contracts/api/token).
- **Zama Developer Program Season 3** — [Submission portal](https://zama.org/programs/developer-program), [community forum](https://community.zama.org).
- **Academic** — Budish/Cramton/Shim (QJE 2015) on frequent batch auctions; Ausubel/Cramton on demand reduction.

## Project layout

```
zama_grant/
├── contracts/             Hardhat workspace — VeilBatchAuction.sol, tests, tasks, deploys
├── web/                   Next.js 16 trading UI — /app encrypts orders, decrypts fills
├── tokenops/              Next.js 16 Mist UI — TokenOps Special Bounty submission
└── docs/                  ← you are here
```
