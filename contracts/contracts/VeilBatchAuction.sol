// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint64, externalEbool, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title VeilBatchAuction — sealed-bid uniform-price batch auction (Veil v1)
/// @notice Single-asset CLOB primitive. Orders are encrypted (side, price tick, size).
///         Each batch runs for a fixed block window; per-tick aggregate buy/sell volumes
///         are accumulated as ciphertexts. After close, the aggregates become publicly
///         decryptable; any solver computes the uniform clearing tick + the two marginal
///         pro-rata ratios off-chain and submits them on-chain. Per-user fills are then
///         computed under FHE and remain user-decryptable only.
///
///         Fill rule:
///           buy  with tick >  clearingTick → full size
///           buy  with tick == clearingTick → size · marginalBuyBps  / 10_000
///           buy  with tick <  clearingTick → 0
///           sell with tick <  clearingTick → full size
///           sell with tick == clearingTick → size · marginalSellBps / 10_000
///           sell with tick >  clearingTick → 0
///
///         The three buckets per side are mutually exclusive so they sum without
///         double-counting. The pro-rata divisor is 10_000 (basis points); the
///         multiplier is plaintext, satisfying FHEVM's "no division by encrypted
///         value" constraint.
///
/// @dev    ERC-7984 escrow + per-user settlement land in v2. This v1 still uses no
///         tokens — it is the pure encrypted matching engine.
contract VeilBatchAuction is ZamaEthereumConfig {
    uint8 public constant NUM_TICKS = 4;
    uint16 public constant BPS_DENOM = 10_000;

    enum BatchState {
        Open,
        Closed,
        Cleared
    }

    struct Order {
        address trader;
        ebool isBuy;
        euint8 tickIdx;
        euint64 size;
        euint64 filledSize;
    }

    struct Batch {
        uint256 openBlock;
        uint256 closeBlock;
        BatchState state;
        uint8 clearingTick;
        uint16 marginalBuyBps;
        uint16 marginalSellBps;
        euint64[NUM_TICKS] buyVolume;
        euint64[NUM_TICKS] sellVolume;
    }

    uint256 public immutable batchBlocks;
    uint256 public currentBatchId;
    mapping(uint256 => Batch) internal _batches;
    mapping(uint256 => Order[]) internal _orders;

    event BatchOpened(uint256 indexed batchId, uint256 openBlock, uint256 closeBlock);
    event OrderPlaced(uint256 indexed batchId, address indexed trader, uint256 orderIndex);
    event BatchClosed(uint256 indexed batchId);
    event AggregatesPublished(uint256 indexed batchId);
    event BatchCleared(
        uint256 indexed batchId,
        uint8 clearingTick,
        uint16 marginalBuyBps,
        uint16 marginalSellBps
    );

    error BatchNotOpen();
    error BatchNotClosed();
    error BatchAlreadyCleared();
    error InvalidClearingTick();
    error InvalidMarginalBps();

    constructor(uint256 batchBlocks_) {
        require(batchBlocks_ > 0, "batchBlocks=0");
        batchBlocks = batchBlocks_;
        _openNewBatch();
    }

    /// @notice Place an encrypted order in the current batch.
    /// @param sideExt encrypted side (true = buy, false = sell)
    /// @param tickExt encrypted tick index in [0, NUM_TICKS)
    /// @param sizeExt encrypted size
    /// @param proof FHEVM input proof covering all three handles
    function placeOrder(
        externalEbool sideExt,
        externalEuint8 tickExt,
        externalEuint64 sizeExt,
        bytes calldata proof
    ) external {
        uint256 batchId = currentBatchId;
        Batch storage b = _batches[batchId];
        if (b.state != BatchState.Open || block.number >= b.closeBlock) revert BatchNotOpen();

        ebool isBuy = FHE.fromExternal(sideExt, proof);
        euint8 tickIdx = FHE.fromExternal(tickExt, proof);
        euint64 size = FHE.fromExternal(sizeExt, proof);

        // Per-tick aggregation: for each tick t, add `size` to buyVol[t] iff (isBuy && tick==t),
        // and to sellVol[t] iff (!isBuy && tick==t). Loop is bounded by NUM_TICKS (compile-time const).
        for (uint8 t = 0; t < NUM_TICKS; t++) {
            ebool tickMatch = FHE.eq(tickIdx, FHE.asEuint8(t));
            ebool buyHere = FHE.and(isBuy, tickMatch);
            ebool sellHere = FHE.and(FHE.not(isBuy), tickMatch);

            euint64 addBuy = FHE.select(buyHere, size, FHE.asEuint64(0));
            euint64 addSell = FHE.select(sellHere, size, FHE.asEuint64(0));

            b.buyVolume[t] = FHE.add(b.buyVolume[t], addBuy);
            b.sellVolume[t] = FHE.add(b.sellVolume[t], addSell);
            FHE.allowThis(b.buyVolume[t]);
            FHE.allowThis(b.sellVolume[t]);
        }

        Order storage o = _orders[batchId].push();
        o.trader = msg.sender;
        o.isBuy = isBuy;
        o.tickIdx = tickIdx;
        o.size = size;
        o.filledSize = FHE.asEuint64(0);

        FHE.allowThis(o.isBuy);
        FHE.allowThis(o.tickIdx);
        FHE.allowThis(o.size);
        FHE.allowThis(o.filledSize);
        FHE.allow(o.isBuy, msg.sender);
        FHE.allow(o.tickIdx, msg.sender);
        FHE.allow(o.size, msg.sender);
        FHE.allow(o.filledSize, msg.sender);

        emit OrderPlaced(batchId, msg.sender, _orders[batchId].length - 1);
    }

    /// @notice Anyone can close the current batch once its close block is reached.
    function closeBatch() external {
        uint256 batchId = currentBatchId;
        Batch storage b = _batches[batchId];
        if (b.state != BatchState.Open || block.number < b.closeBlock) revert BatchNotOpen();
        b.state = BatchState.Closed;

        // Make per-tick aggregates publicly decryptable so any solver can compute
        // the clearing tick and the two marginal pro-rata ratios.
        for (uint8 t = 0; t < NUM_TICKS; t++) {
            FHE.makePubliclyDecryptable(b.buyVolume[t]);
            FHE.makePubliclyDecryptable(b.sellVolume[t]);
        }

        emit BatchClosed(batchId);
        emit AggregatesPublished(batchId);

        _openNewBatch();
    }

    /// @notice Submit the clearing tick and the two marginal pro-rata ratios computed
    ///         off-chain from the published aggregates.
    /// @param batchId           The cleared batch
    /// @param clearingTick      The uniform-price tick in [0, NUM_TICKS)
    /// @param marginalBuyBps    Fraction of size each buy order at `clearingTick` receives,
    ///                          expressed in basis points (0..10_000). Solver rounds DOWN
    ///                          so that aggregate filled-size never exceeds matched volume.
    /// @param marginalSellBps   Same, for sell orders at `clearingTick`.
    function submitClearing(
        uint256 batchId,
        uint8 clearingTick,
        uint16 marginalBuyBps,
        uint16 marginalSellBps
    ) external {
        if (clearingTick >= NUM_TICKS) revert InvalidClearingTick();
        if (marginalBuyBps > BPS_DENOM || marginalSellBps > BPS_DENOM) revert InvalidMarginalBps();

        Batch storage b = _batches[batchId];
        if (b.state == BatchState.Cleared) revert BatchAlreadyCleared();
        if (b.state != BatchState.Closed) revert BatchNotClosed();

        b.clearingTick = clearingTick;
        b.marginalBuyBps = marginalBuyBps;
        b.marginalSellBps = marginalSellBps;
        b.state = BatchState.Cleared;

        euint8 clearingEnc = FHE.asEuint8(clearingTick);
        euint64 zero = FHE.asEuint64(0);

        Order[] storage orders = _orders[batchId];
        uint256 n = orders.length;
        for (uint256 i = 0; i < n; i++) {
            Order storage o = orders[i];

            // Classify the order's tick relative to clearing.
            ebool tickEq = FHE.eq(o.tickIdx, clearingEnc);
            ebool tickGt = FHE.gt(o.tickIdx, clearingEnc);
            ebool tickLt = FHE.lt(o.tickIdx, clearingEnc);

            // Strictly-crossing orders fill in full:
            //   buy above clearing OR sell below clearing.
            ebool isBuyAbove = FHE.and(o.isBuy, tickGt);
            ebool isSellBelow = FHE.and(FHE.not(o.isBuy), tickLt);
            euint64 fullFill = FHE.select(FHE.or(isBuyAbove, isSellBelow), o.size, zero);

            // Pro-rata at the marginal tick. Multiplier is a plaintext uint64 so
            // FHE.mul(euint64, uint64) is legal; divisor is a plaintext uint64 so
            // FHE.div(euint64, uint64) is legal (FHEVM forbids encrypted divisors).
            // size · bps fits in euint64 for any size ≤ ~2^50 (BPS_DENOM = 10_000).
            ebool isBuyAt = FHE.and(o.isBuy, tickEq);
            ebool isSellAt = FHE.and(FHE.not(o.isBuy), tickEq);
            euint64 buyMarginal = FHE.div(FHE.mul(o.size, uint64(marginalBuyBps)), uint64(BPS_DENOM));
            euint64 sellMarginal = FHE.div(FHE.mul(o.size, uint64(marginalSellBps)), uint64(BPS_DENOM));
            euint64 marginalFill = FHE.select(
                isBuyAt,
                buyMarginal,
                FHE.select(isSellAt, sellMarginal, zero)
            );

            // fullFill and marginalFill are mutually exclusive: a given order is
            // either above, at, or below clearing — never two at once.
            o.filledSize = FHE.add(fullFill, marginalFill);
            FHE.allowThis(o.filledSize);
            FHE.allow(o.filledSize, o.trader);
        }

        emit BatchCleared(batchId, clearingTick, marginalBuyBps, marginalSellBps);
    }

    function getBuyVolume(uint256 batchId, uint8 tick) external view returns (euint64) {
        return _batches[batchId].buyVolume[tick];
    }

    function getSellVolume(uint256 batchId, uint8 tick) external view returns (euint64) {
        return _batches[batchId].sellVolume[tick];
    }

    function getBatchState(uint256 batchId)
        external
        view
        returns (uint256 openBlock, uint256 closeBlock, BatchState state, uint8 clearingTick)
    {
        Batch storage b = _batches[batchId];
        return (b.openBlock, b.closeBlock, b.state, b.clearingTick);
    }

    /// @notice Full clearing record for a batch — tick + both pro-rata ratios.
    function getClearing(uint256 batchId)
        external
        view
        returns (uint8 clearingTick, uint16 marginalBuyBps, uint16 marginalSellBps)
    {
        Batch storage b = _batches[batchId];
        return (b.clearingTick, b.marginalBuyBps, b.marginalSellBps);
    }

    function getOrderCount(uint256 batchId) external view returns (uint256) {
        return _orders[batchId].length;
    }

    function getOrderTrader(uint256 batchId, uint256 idx) external view returns (address) {
        return _orders[batchId][idx].trader;
    }

    function getOrderFill(uint256 batchId, uint256 idx) external view returns (euint64) {
        return _orders[batchId][idx].filledSize;
    }

    function _openNewBatch() internal {
        currentBatchId += 1;
        uint256 batchId = currentBatchId;
        Batch storage b = _batches[batchId];
        b.openBlock = block.number;
        b.closeBlock = block.number + batchBlocks;
        b.state = BatchState.Open;
        emit BatchOpened(batchId, b.openBlock, b.closeBlock);
    }
}
