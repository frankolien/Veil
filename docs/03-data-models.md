# Veil — Data Models

Status: draft · Last updated: 2026-05-29

The interfaces a future contributor or integrator binds against. Every claim in this doc cites its source-of-truth in the repo by `path:line`.

## On-chain primitives

`contracts/contracts/VeilBatchAuction.sol`

### Constants and immutables

```solidity
uint8  public constant   NUM_TICKS = 4;       // L31 — tick grid size
uint16 public constant   BPS_DENOM = 10_000;  // L32 — pro-rata denominator
uint256 public immutable batchBlocks;          // L59 — batch window in blocks
uint256 public           currentBatchId;       // L60 — monotonically incrementing
```

`NUM_TICKS` is `uint8` and a compile-time constant because the per-tick aggregation loop must be unrolled — FHEVM cannot iterate on encrypted bounds, and Solidity requires literal bounds to unroll deterministically.

`BPS_DENOM` is plaintext so `FHE.div(euint64, uint64)` is legal. See `02-algorithm.md` for why this matters.

### `enum BatchState` — `L34`

```solidity
enum BatchState { Open, Closed, Cleared }
```

State machine:

```
Open ──closeBatch()──▶ Closed ──submitClearing()──▶ Cleared
 ▲                         (terminal-ish: a new batch is opened on close)
 └──── _openNewBatch() ────┘
```

`closeBatch` does two things: marks the current batch `Closed`, then immediately opens the next batch (`currentBatchId += 1`). There is no "no batch open" state during normal operation.

### `struct Order` — `L40`

```solidity
struct Order {
    address  trader;       // plaintext — used for ACL
    ebool    isBuy;        // encrypted side
    euint8   tickIdx;      // encrypted tick index, [0, NUM_TICKS)
    euint64  size;         // encrypted size
    euint64  filledSize;   // populated by submitClearing; zero handle until then
}
```

Two notes on the field choices:

- `trader` is plaintext because the contract needs it to scope `FHE.allow(handle, trader)` ACL grants. Encrypting the trader would defeat the ACL model.
- `filledSize` is initialised to `FHE.asEuint64(0)` at order placement and overwritten inside `submitClearing`. Before clearing it is the zero ciphertext.

### `struct Batch` — `L48`

```solidity
struct Batch {
    uint256                  openBlock;
    uint256                  closeBlock;
    BatchState               state;
    uint8                    clearingTick;     // set by submitClearing
    uint16                   marginalBuyBps;   // set by submitClearing
    uint16                   marginalSellBps;  // set by submitClearing
    euint64[NUM_TICKS]        buyVolume;        // FHE aggregate
    euint64[NUM_TICKS]        sellVolume;       // FHE aggregate
}
```

`buyVolume` and `sellVolume` are fixed-length arrays because `NUM_TICKS` is a constant. Each slot holds the running ciphertext aggregate of orders at that tick on that side.

### Storage layout

```solidity
mapping(uint256 => Batch)    internal _batches;   // L61
mapping(uint256 => Order[])  internal _orders;    // L62
```

`_orders[batchId][orderIdx]` is the canonical reference for any single order. `OrderPlaced` emits `(batchId, trader, orderIndex)` so off-chain indexers can reconstruct the mapping without iterating storage.

## FHE handle lifecycle

This is the most non-obvious surface in the data model. A ciphertext "handle" is a `bytes32` that names a value in the coprocessor; on-chain types like `euint64` and `ebool` are aliases for `bytes32` with a type tag.

A handle moves through six states across a typical order's life:

| State                          | How it gets there                                                              | Who can decrypt        |
|--------------------------------|--------------------------------------------------------------------------------|------------------------|
| Encrypted on client            | `useEncrypt({ values, contractAddress, userAddress })`                          | trader only            |
| Submitted as `externalEuint*`  | passed in `placeOrder` calldata along with the relayer's input proof            | trader only            |
| Adopted as `euintN`            | `FHE.fromExternal(ext, proof)`; the contract now references the ciphertext     | trader only            |
| Operated under FHE             | `FHE.add`, `FHE.select`, `FHE.eq`, etc. produce *new* handles                  | depends on ACL grants  |
| ACL-granted to contract        | `FHE.allowThis(handle)` so the contract can re-use it in the next transaction  | unchanged              |
| ACL-granted to trader          | `FHE.allow(handle, trader)` so the trader can user-decrypt                     | trader (and contract)  |
| Publicly decryptable           | `FHE.makePubliclyDecryptable(handle)`; relayer accepts public-decrypt requests | anyone                 |

Two non-obvious rules:

1. **Handles expire across transactions without `allowThis`.** Without an explicit `allowThis`, the contract cannot reference the ciphertext in any later call — even one it produced. This is why `placeOrder` calls `allowThis` on every aggregate slot and on every per-order field.
2. **Making a handle publicly decryptable is irreversible.** `makePubliclyDecryptable` is one-way; the aggregates flip on `closeBatch` and stay public forever.

The complete ACL surface of `VeilBatchAuction` is enumerated in `07-security.md`.

## Events

`contracts/contracts/VeilBatchAuction.sol:64-73`

```solidity
event BatchOpened(uint256 indexed batchId, uint256 openBlock, uint256 closeBlock);
event OrderPlaced(uint256 indexed batchId, address indexed trader, uint256 orderIndex);
event BatchClosed(uint256 indexed batchId);
event AggregatesPublished(uint256 indexed batchId);
event BatchCleared(
    uint256 indexed batchId,
    uint8           clearingTick,
    uint16          marginalBuyBps,
    uint16          marginalSellBps
);
```

| Event | Integration use |
|-------|-----------------|
| `BatchOpened` | Indexers and UIs track the active batch; the close block is the polling deadline. |
| `OrderPlaced` | The trader's UI uses `orderIndex` to address the order in later calls (`getOrderFill`). **Indexes `trader` — see leakage map in `01-architecture.md`.** |
| `BatchClosed` | Solver wakes up: aggregates are now publicly decryptable. |
| `AggregatesPublished` | Same wake-up signal as `BatchClosed` but semantically distinct (e.g., for a future solver pool that ignores the close itself). Emitted together today. |
| `BatchCleared` | UIs flip every order in this batch to "decrypt fill" state. Solver records its submission for off-chain auditing. |

## Custom errors

`contracts/contracts/VeilBatchAuction.sol:75-79`

```solidity
error BatchNotOpen();          // placeOrder called when state != Open || block.number >= closeBlock
error BatchNotClosed();        // submitClearing called when state != Closed
error BatchAlreadyCleared();   // submitClearing called twice
error InvalidClearingTick();   // clearingTick >= NUM_TICKS
error InvalidMarginalBps();    // marginalBuyBps > BPS_DENOM || marginalSellBps > BPS_DENOM
```

Custom errors over revert strings: ABI-decodable by the frontend, ~24 bytes cheaper, easier to grep. The frontend can pattern-match on the 4-byte selector to render specific error UX. v1 does not yet do this — it shows the raw decoded reason — but the error set is the contract for that future work.

## External read surface

```solidity
function getBuyVolume(uint256 batchId, uint8 tick)      external view returns (euint64);     // L230
function getSellVolume(uint256 batchId, uint8 tick)     external view returns (euint64);     // L234
function getBatchState(uint256 batchId)                 external view returns (
    uint256 openBlock, uint256 closeBlock, BatchState state, uint8 clearingTick);            // L238
function getClearing(uint256 batchId)                   external view returns (
    uint8 clearingTick, uint16 marginalBuyBps, uint16 marginalSellBps);                       // L248
function getOrderCount(uint256 batchId)                 external view returns (uint256);     // L257
function getOrderTrader(uint256 batchId, uint256 idx)   external view returns (address);     // L261
function getOrderFill(uint256 batchId, uint256 idx)     external view returns (euint64);     // L265
```

The aggregate read functions (`getBuyVolume`, `getSellVolume`) return `euint64` handles — useful both as inputs to `task:veil:clear`'s public-decrypt and as a sanity check before `closeBatch` (handles will be the zero handle if no orders touched that tick).

`getOrderFill` returns the per-order encrypted fill. After `submitClearing` it is non-zero and ACL-allowed to the order's trader; the frontend's user-decrypt path takes it from there.

## Frontend types

`web/components/veil/orderbook.tsx` and `web/components/veil/trade-app.tsx`.

```typescript
type Phase = "open" | "closing" | "clearing" | "cleared";

type BookTick = { idx: number; price: number; buy: number; sell: number };
type Book     = { mid: number; ticks: BookTick[]; clearing: number; matched: number };
type Lifecycle = {
  batchId:    number;
  book:       Book;
  phase:      Phase;
  blocksLeft: number;
  orders:     number;
  flash:      { idx: number; side: "buy" | "sell"; id: number } | null;
};

type MyOrderStatus = "sealed" | "fillReady" | "decrypting" | "filled" | "nofill";
type MyOrder = {
  id:       number;             // local id, not the on-chain orderIdx
  batchId:  number;
  orderIdx?: number;             // from the OrderPlaced event
  side:     "buy" | "sell";
  tickIdx:  number;
  price:    number;
  size:     number;
  status:   MyOrderStatus;
  revealed: boolean;
  fillAmt?: number;              // mock-mode fill plan
  fill?:    number;              // post-user-decrypt clear value
  txHash?:  `0x${string}`;
};
```

`Phase` is a derived field. The on-chain `BatchState` enum has three values (`Open`, `Closed`, `Cleared`); the UI splits the `Open` state into `open` (active) and `closing` (block.number ≥ closeBlock but `closeBatch()` not yet called) to drive a more truthful UX. The mapping is in `web/lib/use-veil-lifecycle.ts:62-66`.

`orderIdx` is optional because the demo path (no on-chain contract) never gets one. The on-chain path always sets it from the `OrderPlaced` log inside `useWriteContract`'s success handler.

## v2 preview — ERC-7984 settlement data model (not yet shipped)

Following the OpenZeppelin Confidential Contracts spec, the v2 escrow grafts onto `placeOrder` and adds a per-user `settle(batchId, orderIdx)`. The data-model additions, marked **design**:

```solidity
struct Order {
    address  trader;
    ebool    isBuy;
    euint8   tickIdx;
    euint64  size;
    euint64  filledSize;
    bool     settled;       // v2 — guards double-settle
}

mapping(uint256 => uint256) public batchEscrowedBase;   // v2 — escrow ledger
mapping(uint256 => uint256) public batchEscrowedQuote;  // v2 — escrow ledger
```

ERC-7984 has no per-amount allowance; the user calls `setOperator(VeilBatchAuction, until)` once (recommended `until ≈ block.timestamp + 24h`), and the contract pulls collateral via `confidentialTransferFrom(trader, address(this), …)` inside `placeOrder`. After clearing, `settle` releases the filled side back to the trader and any unfilled remainder to the original side's pool. UX implication: the OrderTicket needs a one-time "Approve Veil to spend cWETH/cUSDC" step before the first order.

Concrete ERC-7984 signatures Veil binds against:

```solidity
function setOperator(address operator, uint48 until) external;
function confidentialTransferFrom(
    address from, address to, externalEuint64 encryptedAmount, bytes inputProof
) external returns (euint64 transferred);
function confidentialTransferFrom(
    address from, address to, euint64 amount
) external returns (euint64 transferred);
```

The second overload (`euint64 amount`, no proof) is what the contract uses when transferring a value it already holds an ACL grant for. It is what `settle` calls on the return leg.

Full v2 design lands in `08-decisions.md` ADR-010.

## Open questions

- **`uint64` size headroom.** With `size` and `bps` both contributing to `size * bps`, the intermediate is bounded by `2^64`. For `size ≤ 2^50` and `bps ≤ 10_000 < 2^14`, the product fits. Sizes above `2^50` (~10^15) are out of scope; the contract does not enforce this and silent overflow would corrupt clearing. Should it enforce?
- **Per-order trader storage.** v1 stores the trader plaintext on every `Order`. For 1000 orders/batch this is 32kb of plaintext addresses — fine for testnet, worth questioning for mainnet. Could be replaced with an `address[]` per batch indexed by `orderIdx`.
- **Frontend type duplication.** `Phase` is defined in orderbook.tsx and re-used. If the UI grows to multiple markets it should move to `web/lib/types.ts`. Trivial when needed.
- **Event indexing budget.** `OrderPlaced` indexes two fields (`batchId`, `trader`); Solidity allows three. We're under budget but the choice of which fields to index is final once event consumers depend on it.
