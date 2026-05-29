# Veil — Threat Model

Status: draft · Last updated: 2026-05-29

This is the security doc. It states what Veil protects, what it doesn't, and the trust assumptions under which each protection holds. Honest is the bar — a story that overpromises evaporates the moment a reviewer reads the litepaper.

The leakage map in [`01-architecture.md`](01-architecture.md#leakage-map) is the load-bearing artifact this doc references. Read it first.

## Adversary classes

| Adversary | What they want | Defended? |
|-----------|----------------|-----------|
| Public observer (block explorer, indexer) | Read individual orders, fills, or trader intentions | Yes — orders are ciphertext through the entire lifecycle except for the post-close per-tick aggregates and the per-trader fill the trader themselves decrypted. |
| Ethereum validator / proposer | Reorder or censor `placeOrder` txs to extract value | Yes (MEV) — uniform-price clearing within a batch removes the per-tx ordering advantage. No (censorship) — the proposer can still drop a `placeOrder` tx; standard L1 censorship-resistance applies. |
| MEV searcher (sandwich, snipe) | Front-run or back-run sealed orders | Yes — there is no in-batch ordering to game; clearing is a single uniform price computed after the batch closes. |
| Other trader in the same batch | Learn another trader's intent before clearing to shade their own bid | Yes — bids are encrypted under the FHE network key; no other trader has decrypt rights. |
| Solver (whoever calls `submitClearing`) | Submit a wrong clearing tick or wrong bps to extract value | Partially — wrong submissions are publicly detectable (anyone can re-run `computeClearing` on the public aggregates) but not on-chain-rejected in v1. See "Solver malfeasance" below. |
| Relayer (`relayer.testnet.zama.org/v2`) | Decrypt orders or fills | No, by construction — the relayer holds no key shares. It can drop or delay requests (liveness attack), it cannot decrypt anything. |
| Malicious minority of KMS nodes (≤ 4 of 13) | Return wrong decryptions, leak the FHE secret | No — robust MPC tolerates ⌊13/3⌋ = 4 malicious nodes for correctness; confidentiality requires ≥ 9 colluding nodes to reach the 2/3 reconstruction threshold. |
| Coordinated KMS supermajority + AWS Nitro compromise | Decrypt the entire chain history | **Not defended.** Documented honestly: confidentiality breaks under this combined attack. This is the residual trust assumption inherited from Zama Protocol; out of Veil's scope to mitigate. |
| On-device attacker (malware in the trader's browser) | Read the plaintext bid before encryption | Not defended. Trader trust-base; standard wallet threat model. |
| Regulator / institution (v3, by design) | Audit a specific account's encrypted state on demand | By design (v3) — delegated-decryption regulator key grants the regulator decrypt rights over scoped state. See "Regulator key path" below. |

## ACL surface

Every `FHE.allow*()` call in [`VeilBatchAuction.sol`](../contracts/contracts/VeilBatchAuction.sol). This is the complete inventory of who can decrypt what.

### `placeOrder` (L92–L139)

```solidity
FHE.allowThis(b.buyVolume[t]);            // per-tick aggregate, all NUM_TICKS slots
FHE.allowThis(b.sellVolume[t]);
FHE.allowThis(o.isBuy);                   // per-order encrypted side
FHE.allowThis(o.tickIdx);                 //                tick
FHE.allowThis(o.size);                    //                size
FHE.allowThis(o.filledSize);              //                fill (zero handle initially)
FHE.allow(o.isBuy,     msg.sender);       // trader can user-decrypt their own order
FHE.allow(o.tickIdx,   msg.sender);
FHE.allow(o.size,      msg.sender);
FHE.allow(o.filledSize, msg.sender);
```

Implications:
- The contract retains decrypt rights on every ciphertext it stores. Required for re-use in `closeBatch` and `submitClearing`.
- The trader retains decrypt rights on their own four fields. The `filledSize` grant before clearing is harmless (the handle is the zero ciphertext) and saves a re-grant inside `submitClearing` for the unfilled case.

### `closeBatch` (L142–L159)

```solidity
FHE.makePubliclyDecryptable(b.buyVolume[t]);
FHE.makePubliclyDecryptable(b.sellVolume[t]);
```

After `closeBatch`, the per-tick aggregates are public. **Irreversible.** This is the explicit decision to publish book shape post-close — the minimum needed for honest price discovery.

### `submitClearing` (L169–L228)

```solidity
FHE.allowThis(o.filledSize);
FHE.allow(o.filledSize, o.trader);
```

The contract overwrites `o.filledSize` with the computed fill, re-grants itself ACL (the new handle is a different bytes32), and grants the trader user-decrypt rights on the new handle. The trader's earlier grant on the zero handle is moot.

## Threats and mitigations

### 1. Public-observer order leakage

Without FHE, `placeOrder(uint8 side, uint8 tick, uint64 size)` is plaintext-readable. Veil's calldata is `(externalEbool, externalEuint8, externalEuint64, bytes proof)` — opaque ciphertext bytes plus a relayer-attested input proof. Decrypting requires the FHE secret, which is split across 13 KMS nodes.

### 2. Sandwich / snipe MEV

A frequent batch auction with uniform-price clearing eliminates the latency arms race that underlies sandwich and snipe MEV (Budish, Cramton & Shim, QJE 2015). All orders in a batch clear at the same price `c*`; there is no fill-ordering advantage to game.

A validator can still reorder *which* orders land in `batch N` vs `batch N+1`, but the within-batch reordering attack is gone, and clearing-price moves between batches are bounded by the public aggregate shape.

### 3. Inter-trader inference

The aggregate is encrypted during the batch window. A trader observing the on-chain state sees:
- the count of `OrderPlaced` events,
- the set of trader addresses (`OrderPlaced.trader` is indexed — see Threat 7),
- nothing about prices or sizes inside the aggregate ciphertexts.

After `closeBatch`, the per-tick totals become public. Any single trader's contribution to a tick can be inferred only by differencing snapshots taken before and after their tx, *and* that inference is still per-tick, not per-order — many orders sharing a tick is the high-noise regime. v2 should consider a noise injection on `closeBatch` if this side channel matters; flag for security ADR.

### 4. Solver malfeasance

Three failure modes:

| Mode | Detectable? | Enforced on-chain? |
|------|-------------|--------------------|
| Submits wrong `clearingTick` | Yes — anyone re-runs `computeClearing` on the public aggregates | No (v1) |
| Submits wrong `marginalBuyBps` or `marginalSellBps` | Yes — same recompute | No (v1) |
| Refuses to submit (liveness) | Yes — block.number drift after closeBlock | No (anyone can run the task) |

v1 ships with **publicly detectable + manually fixable** as the security model. A malicious solver can keep a batch in `Closed` state but anyone can run `task:veil:clear` and win the race.

v2 should add on-chain re-verification or a challenge window. Trade-off: on-chain re-verification doubles the clearing-gas cost; a challenge window adds latency. Open question, tracked as ADR-003.

### 5. KMS compromise — correctness

The litepaper specifies a robust MPC protocol that "will give a correct output with up to 1/3 malicious nodes" — i.e., ⌊13/3⌋ = 4. A coalition of ≤ 4 malicious KMS nodes can attempt to inject wrong decryption shares; the protocol detects and rejects them. The user-decryption call either returns the right answer or aborts; no silent corruption.

A coalition of ≥ 5 can force aborts (DoS); they cannot force a wrong-but-accepted answer.

### 6. KMS compromise — confidentiality

The FHE secret key is shared with a 2/3 reconstruction threshold. Recovering it requires:

- ≥ 9 colluding KMS nodes (to reach reconstruction), **and**
- defeating AWS Nitro Enclave attestation on each colluding node.

If both happen the attacker holds the FHE secret and can decrypt every ciphertext ever produced under it. This is the residual trust assumption. We do not pretend to defend against it — we document it.

For comparison, plaintext rollups have a residual trust assumption of "the proposer set is honest enough to not censor or reorder." Veil's residual trust assumption is "the KMS quorum is not coordinated enough to gather 9 shares AND defeat AWS attestation." Different shape; arguably stronger.

### 7. Indexed-trader leakage

`OrderPlaced(uint256 indexed batchId, address indexed trader, uint256 orderIndex)` reveals the set of addresses that placed orders in each batch. A surveiller correlating timestamps with off-chain identities can build "Alice participates in cWETH/cUSDC batches from her 0xAA1 wallet" without ever decrypting an order.

This is real and unmitigated in v1. Mitigation candidates:

- **Relayer-funded submissions.** A Veil-operated relayer submits on behalf of users via meta-tx / account abstraction. Privacy shifts from "user wallet → contract" to "relayer wallet → contract"; the relayer correlates with users out-of-band.
- **Stealth addresses (ERC-5564).** Each `placeOrder` from a fresh stealth address derived from the trader's spend key. Strong privacy at the cost of wallet UX complexity.
- **Mixer in front.** Trade from a freshly-mixed address. Out of protocol; user-driven.
- **Accept.** Document the leakage prominently and let users decide whether to use a fresh wallet.

v2 must pick one. ADR-011 will land in `08-decisions.md` with the decision.

### 8. Relayer liveness

`relayer.testnet.zama.org/v2` is the single relayer endpoint we use today. If it goes down:
- `useEncrypt` calls fail → no new orders can be placed.
- `useUserDecrypt` calls fail → no fills can be revealed.
- `task:veil:clear`'s public-decrypt fails → batches stay in `Closed`.

Zama documents community-run relayers as a roadmap item; until they exist, Veil inherits the liveness profile of one relayer endpoint. The `web/lib/config.ts` `ZAMA_RELAYER_URL_OVERRIDE` env var makes it trivial to point at an alternate endpoint when one exists.

## Out of scope

Stated to set the boundary explicitly:

- **On-device key compromise.** Standard wallet trust model. If the trader's machine is compromised the attacker learns the plaintext bid before it is encrypted.
- **Censorship by Ethereum proposers.** Standard L1 censorship-resistance; Veil does not improve or worsen it.
- **Browser-supply-chain attacks on the Veil web app.** Mitigation belongs to standard web-app SDLC (SRI, build provenance), not to the protocol.
- **`@zama-fhe/sdk` correctness.** We treat the SDK as trusted infrastructure — audit responsibility is upstream.

## Regulator key path (v3, by design)

The grant theme is "composable privacy". The composability we ship is: a designated `regulatorKey` address can be granted delegated-decryption rights over specific orders or batches, without that grant being transferable.

Mechanism (v3 design):

1. The regulator publishes a delegation policy on-chain (e.g., "I have audit rights over trader 0xAA1 starting block N").
2. The trader registers a delegated-decrypt grant for `regulatorKey` over their own `Order` fields.
3. The regulator's `useUserDecrypt` request is honored by the KMS based on the on-chain grant.

What this enables: an institutional account that participates in Veil can extend audit access to a regulator without exposing its trading to the public — meeting most KYC/AML expectations without a centralized off-chain log.

What this does not enable: blanket surveillance. The regulator key is opt-in per account. A trader who declines to register a grant cannot be force-decrypted (the KMS will refuse without the on-chain authorization). Whether this satisfies a given jurisdiction's legal threshold is a question for the deploying entity, not the protocol.

## Open questions

- **On-chain solver re-verification.** Tracked as ADR-003. Whether the gas cost of an on-chain `computeClearing` re-run is worth eliminating the off-chain challenge race.
- **Noise injection on close.** Whether to round each public aggregate up to a multiple of N (and reveal that N) so single-order differencing fails. Privacy gain vs price-discovery fidelity, unmeasured.
- **Indexed-trader mitigation pick.** ADR-011. The doc commits to picking one of the four candidates before v2.
- **Regulator-key delegation revocation.** v3 design assumes irrevocable grants for simplicity. Real-world deployment probably needs time-bounded grants (`uint48 until`, ERC-7984-style). Tracks against `09-decisions` once we have a v3 draft.
- **Front-running of `closeBatch` itself.** `closeBatch()` is permissionless. A privileged observer could close a batch one block before the trader expected, foreclosing a last-minute order. Today `closeBatch` reverts if `block.number < closeBlock`, so the race is on the close-block boundary. Material?
