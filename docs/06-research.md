# Veil — Comparable Systems and References

Status: draft · Last updated: 2026-05-29

Honest positioning against the closest priors. Where we are similar, say so; where we differ, say what specifically.

Veil's design point in one sentence: **a sealed-bid uniform-price batch auction CLOB with on-chain FHE matching**, where order prices and sizes remain ciphertexts through aggregation and matching, and only the clearing price plus each trader's own fill are decrypted.

## Comparison table

| System          | Matching model               | What stays private                      | What leaks                          | Confidentiality mechanism                | Vs. Veil                                                                 |
|-----------------|------------------------------|------------------------------------------|--------------------------------------|------------------------------------------|--------------------------------------------------------------------------|
| **Veil**        | Sealed-bid uniform-price batch CLOB | individual bid (side, tick, size) and individual fill | post-close per-tick aggregates; clearing price; the set of participant addresses | FHEVM (FHE evaluation on-chain)          | —                                                                        |
| **CoW Protocol**| Batch auction with solver competition | nothing cryptographically               | full order book to all solvers       | none — operational MEV defense           | Same batch-clearing-price shape; CoW exposes orders to solvers, Veil does not |
| **Renegade**    | Pairwise MPC dark pool       | both counterparties' orders pre/post-trade | external midpoint as the clearing reference | MPC + collaborative zkSNARKs (no FHE)    | Veil discovers price endogenously; Renegade is price-taking. Veil is N-party on-chain, Renegade is 2-party off-chain |
| **Penumbra**    | Per-block sealed-bid batch swap against CFMM | individual swap amounts                  | net per-asset flow per block; CFMM curve | Threshold homomorphic encryption (status uncertain — see below) | Closest cousin philosophically. Veil clears a CLOB (limit orders, uniform price); Penumbra clears a CFMM (curve, AMM-style price) |
| **dYdX v4**     | Off-chain in-memory orderbook | nothing                                  | every order to every validator       | none                                     | Opposite end of the trade-off space                                       |
| **Aztec**       | n/a — general privacy L2     | per-app contract design                  | depends on app contract              | client-side ZK (Noir)                    | Alternative substrate, not a competing matching design                    |
| **Railgun**     | Shielded-pool wrapper around public DEXs | counterparty identity                    | the trade itself (executes on public AMM) | zkSNARKs over shielded balances           | Composes orthogonally with Veil (could be the funding source for a Veil account) |
| **Hashflow / Aori** | RFQ                       | quote not in public mempool              | no order book exists                 | none (signed quotes)                     | Different problem class — Veil preserves public price discovery, RFQ removes it |

## Detail per system

### CoW Protocol

Off-chain solvers compete each batch. The winning solver proposes which orders clear and at what uniform clearing price per token pair; surplus-maximisation is the score. Settled on Ethereum.

**Privacy.** Essentially none cryptographically. Orders are signed intents broadcast to the solver auction; privacy reduces to "not in the public mempool until settlement." Limit prices and sizes are visible to all solvers.

**Vs. Veil.** Same uniform-clearing-price norm and same batch-auction MEV story, but CoW's MEV defense is *operational* (trust solver competition + uniform price within a batch). Veil's bids are encrypted ciphertexts through matching; CoW's are plaintext to a permissioned solver set. Veil defends against solver-side info leakage that CoW cannot.

References: [docs.cow.fi MEV protection](https://docs.cow.fi/cow-protocol/concepts/benefits/mev-protection), [Fair Combinatorial Batch Auction](https://docs.cow.fi/cow-protocol/concepts/introduction/fair-combinatorial-auction).

### Renegade

Pairwise **MPC** between two traders' relayers produces a midpoint cross. A **collaborative zkSNARK** ("VALID MATCH MPC") attests the match was computed correctly. Settles on Arbitrum (Stylus). Despite ecosystem shorthand, **it does not use FHE.**

**Privacy.** Pre- and post-trade order details are private to the two counterparties; settlement is ZK so third parties learn nothing. Price is *not discovered*: it is the external midpoint (oracle-derived). Renegade is a dark pool, not a price-discovering venue.

**Vs. Veil.** Renegade hides everything but doesn't *discover price*; Veil runs an actual uniform-price auction inside FHE that produces a clearing price endogenously. Renegade's matching is 2-party MPC off-chain; Veil's is N-party on-chain FHE.

References: [docs.renegade.fi MPC-ZKP](https://docs.renegade.fi/core-concepts/mpc-zkp), [collaborative zkSNARK FAQ](https://help.renegade.fi/hc/en-us/articles/32529961385363-What-is-a-collaborative-zkSNARK).

### Penumbra (ZSwap)

Per-block **sealed-bid batch swap**: users burn input asset publicly (in obfuscated bundles), the chain aggregates net flow, executes a single trade against a CFMM at the batch's clearing price, and users later privately mint outputs proving consistency with that price.

**Privacy.** Individual swap amounts are hidden inside batch totals; *net per-asset flow per block is public* by design. A future upgrade uses **homomorphic threshold encryption** so validators aggregate ciphertexts and only the batch total is decrypted. **Live status uncertain** — the Penumbra protocol spec page is silent on whether flow encryption is shipped; the threshold-encryption spec has a `TODO` tag. We verify before publishing the final research doc.

**Vs. Veil.** Closest philosophical cousin. Both are sealed-bid batch auctions resistant to front-running. Differences:

- Penumbra clears against a CFMM curve; Veil clears a CLOB with explicit limit orders.
- Penumbra's confidentiality depends on threshold decryption of batch totals by validators; Veil evaluates the matching *under* the FHE key without ever decrypting individual orders.
- Penumbra is a sovereign Cosmos zone; Veil is a single contract on Ethereum, inheriting Ethereum's validator set.

References: [protocol.penumbra.zone/main/dex.html](https://protocol.penumbra.zone/main/dex.html), [threshold encryption spec](https://protocol.penumbra.zone/main/crypto/flow-encryption/threshold-encryption.html).

### dYdX v4

Fully off-chain in-memory orderbook replicated across validators; only fills are committed on-chain via the Cosmos SDK chain.

**Privacy.** None. Orders are gossiped in plaintext to all validators; the proposer can see the whole book. dYdX's own blog acknowledges block proposers can MEV users; mitigation is social slashing plus the Skip orderbook-discrepancy dashboard.

**Vs. Veil.** Opposite end of the spectrum. dYdX optimises for CEX-like throughput and accepts proposer trust; Veil sacrifices throughput for cryptographic confidentiality against validators themselves.

References: [dydx.xyz/blog/dydx-v4-and-mev](https://www.dydx.xyz/blog/dydx-v4-and-mev), [dYdX forum MEV discussion](https://dydx.forum/t/discussion-protection-against-mev-on-dydx-v4/951).

### Aztec Network

General-purpose private smart-contract L2 using Noir + client-side proving. Ignition mainnet went live Nov 2025. No first-party CLOB; private OTC swaps and private DEX patterns are app-layer constructions.

**Privacy.** Private state and execution per account; what leaks depends on the app contract.

**Vs. Veil.** Aztec is the infrastructure-substrate analog (privacy compute environment) to Zama FHEVM, not a competing matching design. A CLOB on Aztec would face the standard ZK challenge: *shared mutable state* (the orderbook) is hard to update from many concurrent provers; FHE avoids that because the validator evaluates the circuit. Worth noting as an alternative platform, not an alternative product.

References: [Aztec roadmap update](https://aztec.network/blog/aztec-network-roadmap-update), [private OTC swaps](https://aztec.network/blog/bringing-private-over-the-counter-otc-swaps-to-crypto).

### Railgun

Shielded-pool privacy wrapper around existing DeFi. Deposit → "0zk" address → zkSNARK-proved interactions with external DEXs and AMMs.

**Privacy.** Hides counterparties and balances via the shielded set; the underlying swap still executes on a public AMM at a publicly observable price and size, so the trade itself is not hidden, only its owner.

**Vs. Veil.** Orthogonal. Railgun anonymises participants in any DEX; Veil hides the order book and price formation. The two compose — a Veil account could itself be funded from a Railgun shielded pool.

Reference: [docs.railgun.org/wiki](https://docs.railgun.org/wiki).

### RFQ family (Hashflow, Aori)

Market makers compute prices off-chain and return cryptographically signed quotes. Taker submits the signed quote on-chain for atomic settlement.

**Privacy.** Quotes are not in the public mempool, so front-running is mitigated; but there is no order book and no auction — just bilateral price-taking from MMs. MM inventory and pricing logic are off-chain and trusted.

**Vs. Veil.** RFQ avoids MEV by removing public price discovery entirely; Veil preserves public price discovery (a clearing price is published) while hiding individual bids. Different trust assumption: Veil trusts a threshold-FHE key committee, RFQ trusts MM honesty plus signature integrity.

References: [docs.hashflow.com](https://docs.hashflow.com/hashflow/market-making/getting-started-api-v3), [aori.io](https://www.aori.io/).

## Net positioning

**Borrowed.** Uniform-clearing-price batch auction (from CoW, Penumbra, Budish et al.). Sealed-bid framing (from Penumbra and the broader auction theory tradition). ERC-7984 confidential token standard (from Zama / OpenZeppelin).

**Novel for Veil.** Bid ciphertexts persist *through* matching via FHE circuit evaluation on-chain — Penumbra decrypts batch totals, Renegade decrypts via 2-party MPC, CoW does not encrypt at all. Price-discovering CLOB matching rather than CFMM (vs. Penumbra) or midpoint dark pool (vs. Renegade). Confidentiality against validators themselves (vs. dYdX v4).

**Uncertain / verify before publishing.** Exact current state of Penumbra's flow-encryption rollout on mainnet. Whether Aztec has shipped any first-party orderbook primitive beyond OTC.

## Academic grounding

Use these precisely. The strong "truthful" claim does **not** hold in multi-unit uniform-price auctions; cite each paper for what it actually says.

- **Wilson, 1979. *Auctions of Shares*. QJE 93(4): 675–689.** First formal analysis of uniform-price (share) auctions. Identifies that bidders shade demand below true value when they have market power — i.e., uniform price is *not* dominant-strategy truthful in the multi-unit setting. Cite for the mechanism's origin, **not** for truthfulness.
- **Ausubel & Cramton. *Demand Reduction and Inefficiency in Multi-Unit Auctions*.** Shows uniform-price multi-unit auctions suffer demand reduction. The canonical counterexample to "uniform price = truthful." [PDF](https://www.cs.cmu.edu/~sandholm/cs15-892F15/Ausubel_Auction_Theory_Palgrave.pdf).
- **Budish, Cramton & Shim, 2015. *The High-Frequency Trading Arms Race: Frequent Batch Auctions as a Market Design Response*. QJE 130(4): 1547–1621.** The defensible citation for Veil's MEV claim: discrete-time uniform-price batch auctions eliminate the latency arms race and the sniping component of MEV. [academic.oup.com](https://academic.oup.com/qje/article/130/4/1547/1916146).
- **Klemperer, 2002. *What Really Matters in Auction Design*. JEP 16(1).** Practical critique of uniform-price share auctions; useful for honest framing that theoretical properties depend on bidder symmetry and unit demand. [ideas.repec.org](https://ideas.repec.org/a/aea/jecper/v16y2002i1p169-189.html).

**Conclusion for the docs.** Drop "uniform price is truthful." Defensible claims:

1. Single-unit sealed-bid second-price is truthful (Vickrey).
2. Frequent batch auctions remove latency-based MEV (Budish et al.).
3. With *encrypted* bids, the demand-reduction strategic problem is mitigated because bidders cannot condition on others' bids. **This is a conjecture pending formal analysis**, not a theorem. Veil's actual novelty.

## Zama-internal references

- **Zama Protocol Litepaper.** Component model (Host chain / Coprocessor / KMS / Gateway), threshold parameters (13 nodes, 2/3 majority), current mainnet status (live 2025-12-30), per-tx cost band ($0.008–$0.8 for a 3-decryption confidential token transfer). [docs.zama.org/protocol/zama-protocol-litepaper](https://docs.zama.org/protocol/zama-protocol-litepaper).
- **FHE operations reference.** What's allowed, what's blocked. Especially: no encrypted divisors in `FHE.div`, scalar variants of binary ops cost less gas, no encrypted loop bounds. [docs.zama.org/protocol/solidity-guides/smart-contract/operations](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations).
- **Confidential Wrappers Registry.** Discovery interface (`getConfidentialTokenAddress`, `getTokenConfidentialTokenPairs`, etc.). Deployed addresses on Sepolia and mainnet — fetch from the addresses page rather than hardcoding. [docs.zama.org/protocol/protocol-apps/confidential-tokens/wrapper-registry](https://docs.zama.org/protocol/protocol-apps/confidential-tokens/wrapper-registry).
- **OpenZeppelin ERC-7984 Confidential Contracts.** Token interface, operator model (`setOperator(address, uint48 until)`), the `confidentialTransferFrom` overloads. [docs.openzeppelin.com/confidential-contracts/api/token](https://docs.openzeppelin.com/confidential-contracts/api/token).

## Open uncertainties

- **Penumbra mainnet status of flow encryption.** Spec is silent; the threshold-encryption page has a `TODO`. Before publishing the final research doc, confirm via official Penumbra release notes whether the homomorphic flow-encryption layer is live on mainnet today.
- **Aztec DEX primitive shipped beyond OTC.** Same — confirm via release notes whether anything beyond the OTC blog post is live.
- **Current Zama mainnet metrics.** Litepaper cites "20 TPS on CPU." Real-world Sepolia traffic is light; we have not stress-tested. Week 5 gas profile is the source-of-truth for our actual numbers.
- **Confidential Wrappers Registry — live Sepolia addresses.** The interface is documented; the addresses page was a 404 at the time of this draft. Pull from the live registry contract directly before Week 3 (escrow needs them).
