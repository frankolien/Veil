# Veil — Matching Algorithm

Status: draft · Last updated: 2026-05-29

## The mechanism in five sentences

Veil runs a sealed-bid uniform-price batch auction over a fixed price grid. Each batch lasts a fixed number of blocks; while it is open, traders submit FHE-encrypted orders carrying (side, price tick, size). The contract aggregates per-tick buy and sell volumes as ciphertexts via a bounded loop over the tick grid. When the batch closes, the per-tick aggregates become publicly decryptable; an off-chain solver computes the uniform clearing tick and per-side pro-rata ratios and submits them on-chain. The contract then computes each trader's fill under FHE — orders strictly crossing fill in full, orders at the marginal tick fill pro-rata.

## Per-tick aggregation

For each placed order with encrypted side `s`, encrypted tick `t`, encrypted size `z`, and for each plaintext tick `t' ∈ [0, NUM_TICKS)`:

```
match     = FHE.eq(t, t')
buyHere   = FHE.and(s,    match)
sellHere  = FHE.and(NOT s, match)
addBuy    = FHE.select(buyHere,  z, 0)
addSell   = FHE.select(sellHere, z, 0)
book.buyVolume[t']  = FHE.add(book.buyVolume[t'],  addBuy)
book.sellVolume[t'] = FHE.add(book.sellVolume[t'], addSell)
FHE.allowThis(book.buyVolume[t'])
FHE.allowThis(book.sellVolume[t'])
```

The trailing `allowThis` pair is the FHEVM ACL grant that lets the contract use these ciphertext handles in later transactions (`closeBatch`, `submitClearing`). Without them the handles would expire at the end of `placeOrder` and the next call could not reference the aggregate.

The loop is unrolled at compile time because FHEVM cannot run encrypted loop bounds. Gas is `O(NUM_TICKS)` per order. The empirical cost for the 4-tick loop on Sepolia is **TBD — instrumented Week 5**. Until then the algorithm doc states the gas-cost shape (`O(NUM_TICKS)` ops, ≈ 6 binary FHE ops × NUM_TICKS per call plus ACL writes) and refuses to pin a number.

After the batch window closes, the invariant holds (encrypted-equal): the aggregate of `buyVolume[t]` across all t equals the sum of sizes of all buy orders, and similarly for sells.

## Clearing rule

Define cumulative demand at clearing tick `c` and cumulative supply at clearing tick `c` over the public per-tick totals:

```
D(c) = Σ buyVolume[t]   for t ≥ c
S(c) = Σ sellVolume[t]  for t ≤ c
M(c) = min(D(c), S(c))
```

A buyer with tick `t ≥ c` is "willing to pay c or more"; a seller with `t ≤ c` is "willing to accept c or less." `M(c)` is the maximum volume that can clear at price `c`.

The clearing tick is `c* = argmax_c M(c)`. The solver iterates `c = 0..NUM_TICKS-1` over the publicly-decrypted aggregates and picks the maximizing `c`.

## Pro-rata at the marginal tick

Once `c*` is fixed, partition each order by its tick relative to `c*`:

- Buys with `t > c*` fill in full.
- Sells with `t < c*` fill in full.
- Buys with `t == c*` fill pro-rata at fraction `α = (M(c*) − D_strict(c*)) / buyVolume[c*]`.
- Sells with `t == c*` fill pro-rata at fraction `β = (M(c*) − S_strict(c*)) / sellVolume[c*]`.

Where `D_strict(c*) = Σ buyVolume[t] for t > c*` and analogously for `S_strict`.

`α` and `β` are submitted on-chain as basis points in `[0, 10_000]` (`marginalBuyBps`, `marginalSellBps`). The solver **rounds down**, guaranteeing the on-chain invariant `Σ fills_buy ≤ M(c*)` and `Σ fills_sell ≤ M(c*)`. Tiny dust may remain unfilled; intentional.

The on-chain fill rule, encoded once per order in `submitClearing`:

```
fullFill     = FHE.select((isBuy ∧ t > c*) ∨ (¬isBuy ∧ t < c*), size, 0)
buyMarginal  = FHE.div(FHE.mul(size, marginalBuyBps),  10_000)
sellMarginal = FHE.div(FHE.mul(size, marginalSellBps), 10_000)
marginalFill = FHE.select(isBuy ∧ t == c*, buyMarginal,
               FHE.select(¬isBuy ∧ t == c*, sellMarginal, 0))
filledSize   = FHE.add(fullFill, marginalFill)
```

Plaintext bps + plaintext denominator is the trick. FHEVM blocks `FHE.div` by encrypted divisors; `size · bps / 10_000` fits the constraint because `bps` and `10_000` are plaintext `uint64`s — only `size` and the final product are ciphertexts.

## Worked example

Four ticks priced [3418, 3419, 3420, 3421]. Four orders submitted during the batch:

| Trader | Side | Tick | Size |
|--------|------|------|------|
| Alice  | buy  |  3   | 100  |
| Bob    | buy  |  2   |  60  |
| Carol  | sell |  1   |  80  |
| Dave   | sell |  2   |  50  |

Per-tick aggregates after close:

| tick | buyVolume | sellVolume |
|------|-----------|------------|
|  0   |    0      |     0      |
|  1   |    0      |    80      |
|  2   |   60      |    50      |
|  3   |  100      |     0      |

Evaluate each candidate `c`:

| c | D(c) | S(c) | M(c) |
|---|------|------|------|
| 0 | 160  |  0   |  0   |
| 1 | 160  | 80   | 80   |
| 2 | 160  | 130  | **130** |
| 3 | 100  | 130  | 100  |

`c* = 2`.

Pro-rata at the marginal tick:

- `D_strict(2) = 100` (Alice, tick 3). Buy side needs `M − D_strict = 130 − 100 = 30` units from the marginal tick. `buyVolume[2] = 60`. `α = 30/60 = 50%` → `marginalBuyBps = 5_000`.
- `S_strict(2) = 80` (Carol, tick 1). Sell side needs `130 − 80 = 50` units. `sellVolume[2] = 50`. `β = 50/50 = 100%` → `marginalSellBps = 10_000`.

Resulting fills:

| Trader | Position vs c* | Fill |
|--------|---------------|------|
| Alice  | buy, t > c*   | 100 (full) |
| Bob    | buy, t == c*  | 60 · 5_000 / 10_000 = 30 |
| Carol  | sell, t < c*  | 80 (full) |
| Dave   | sell, t == c* | 50 · 10_000 / 10_000 = 50 |

Aggregate buy fill = 130 = aggregate sell fill. Conservation holds.

## Why this passes the FHEVM constraint surface

| Constraint | Veil's response |
|------------|-----------------|
| No encrypted loop bounds | Loop over plaintext tick grid. `NUM_TICKS` is a `uint8` constant; the EVM unrolls the loop. |
| No encrypted divisors in `FHE.div` | Pro-rata is `size · marginalBps / 10_000` with both `marginalBps` and `10_000` plaintext. |
| Scalar-operand variants are much cheaper | `FHE.asEuint64(0)` and `FHE.asEuint8(t)` lift constants once; subsequent ops use the scalar form. |
| Overflow does not throw | Sizes are `euint64`. `size · marginalBps` fits for any `size ≤ 2^50` (max bps fits in 14 bits). Sizes above that are out of scope for v1. |
| Aggregates leak the shape of the book after close | Intentional. The clearing price needs them, and the shape is the public price-discovery signal. Individual orders remain opaque. |

## The encrypted-bid → demand-reduction conjecture

A strategic bidder in a plaintext multi-unit uniform-price auction shades demand below true value because their own bid moves the clearing price (Wilson 1979; Ausubel & Cramton, "Demand Reduction and Inefficiency in Multi-Unit Auctions"). The optimal shading strategy conditions on a belief about others' bids — that belief is informed by every signal the bidder can observe before clearing.

In Veil, no bidder can observe any other bidder's order before clearing. The aggregate is encrypted during the batch window; only the trader's own ciphertext is theirs to see. Under that constraint the conditioning required for optimal shading is absent, and standard theory predicts bidders revert toward true-value bidding.

**This is a conjecture, not a theorem.** A formal proof would require modelling a Bayesian equilibrium of a uniform-price auction with no public price-update signal during the bidding window. We state it as a design hypothesis and defer the formal treatment.

The MEV-resistance claim is separate and stronger. By Budish, Cramton & Shim (QJE 2015), frequent discrete-time batch auctions eliminate the latency arms race that underlies sandwich and snipe MEV — independent of any encryption. Veil inherits that result; FHE adds confidentiality on top.

## Edge cases

- **Empty book.** `M(c) = 0` for all `c`. Solver picks `c = 0`, bps = 0. `submitClearing` runs the per-order loop but every fill is `0`.
- **One-sided book.** Same as empty: `M(c) = 0` for all `c`.
- **Ties at multiple clearing ticks.** Solver picks the lowest `c` with maximum `M`. A malicious solver could pick a worse-by-some-criterion tick; mitigation belongs to the security doc (anyone can detect this off-chain and the wrong values are public).
- **Marginal bucket empty on one side.** If `buyVolume[c*] = 0`, `α` is undefined; solver sets `marginalBuyBps = 0`. Same for sells.
- **Rounding-down dust.** With both sides rounding down, total filled volume can be strictly less than `M(c*)`. Acceptable. The invariant the contract enforces is "no order over-fills," not "all of M is filled."

## Open questions

- **Gas profile.** Pinning a `placeOrder` and `submitClearing` gas number for NUM_TICKS=4 and N orders. Until measured, every cost statement in the docs is suspect. Week 5 work.
- **Solver tie-breaking.** When two ticks tie on `M(c)`, v1's solver picks the lower one. Is that the right convention? Higher-price clears more revenue to sellers, lower-price clears more to buyers — a policy choice that should be either argued for in `08-decisions.md` or made enforceable on-chain.
- **`NUM_TICKS` upper bound.** Per-order gas is `O(NUM_TICKS)`. What's the largest NUM_TICKS we can support without `placeOrder` exceeding Sepolia's block budget? Empirical; gated on the gas profile.
- **Solver malfeasance.** A malicious solver can submit valid-but-wrong `(c*, bps)`. Public detection works in seconds; on-chain rejection requires gas to re-verify. The trade-off is in `08-decisions.md` ADR-003. The unresolved question: is "publicly detectable + slashable via challenge" enough, or does v2 enforce on-chain?
- **Marginal-side asymmetry.** Both sides round bps down. If both sides round, total filled volume is strictly less than `M(c*)`. The exact dust statistic across plausible order distributions is unmeasured.

## References

- Budish, Cramton, Shim. 2015. *The High-Frequency Trading Arms Race: Frequent Batch Auctions as a Market Design Response*. QJE 130(4). [academic.oup.com](https://academic.oup.com/qje/article/130/4/1547/1916146)
- Wilson. 1979. *Auctions of Shares*. QJE 93(4).
- Ausubel, Cramton. *Demand Reduction and Inefficiency in Multi-Unit Auctions*.
- Klemperer. 2002. *What Really Matters in Auction Design*. JEP 16(1).
- Zama Protocol — [FHE operations reference](https://docs.zama.org/protocol/solidity-guides/smart-contract/operations) (constraint surface)
- Zama Protocol — [Litepaper](https://docs.zama.org/protocol/zama-protocol-litepaper) (decryption model, gas context)
