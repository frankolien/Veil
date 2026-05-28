// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint64, externalEbool, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title VeilBatchAuction — sealed-bid uniform-price batch auction (Veil v0)
/// @notice Single-asset CLOB primitive. Orders are encrypted (side, price tick, size).
///         Each batch runs for a fixed block window; per-tick aggregate buy/sell volumes
///         are accumulated as ciphertexts. After close, anyone can request public
///         decryption of the aggregates and submit the resulting clearing tick on-chain;
///         per-user fills are then computed under FHE and remain user-decryptable only.
/// @dev This is the v0 demo contract for the Zama Developer Program Season 3 submission.
///      Pro-rata at the marginal tick and ERC-7984 settlement land in v1.
contract VeilBatchAuction is ZamaEthereumConfig {
    uint8 public constant NUM_TICKS = 4;

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
    event BatchCleared(uint256 indexed batchId, uint8 clearingTick);

    error BatchNotOpen();
    error BatchNotClosed();
    error BatchAlreadyCleared();
    error InvalidClearingTick();

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

        // Make per-tick aggregates publicly decryptable so any solver can compute the clearing tick.
        for (uint8 t = 0; t < NUM_TICKS; t++) {
            FHE.makePubliclyDecryptable(b.buyVolume[t]);
            FHE.makePubliclyDecryptable(b.sellVolume[t]);
        }

        emit BatchClosed(batchId);
        emit AggregatesPublished(batchId);

        _openNewBatch();
    }

    /// @notice Submit the clearing tick computed off-chain from the published aggregates.
    ///         Uniform-price rule (v0): clearingTick is the lowest tick T where
    ///         sum_{t >= T} buyVol[t] >= sum_{t >= T} sellVol[t] (intuitively: the highest
    ///         price buyers are willing to clear at).
    ///         Per-user fill rule (v0, simplified — no pro-rata):
    ///             buy filled if userTick >= clearingTick, sell filled if userTick <= clearingTick.
    function submitClearing(uint256 batchId, uint8 clearingTick) external {
        if (clearingTick >= NUM_TICKS) revert InvalidClearingTick();
        Batch storage b = _batches[batchId];
        if (b.state != BatchState.Closed) revert BatchNotClosed();
        if (b.state == BatchState.Cleared) revert BatchAlreadyCleared();

        b.clearingTick = clearingTick;
        b.state = BatchState.Cleared;

        euint8 clearingEnc = FHE.asEuint8(clearingTick);
        Order[] storage orders = _orders[batchId];
        uint256 n = orders.length;
        for (uint256 i = 0; i < n; i++) {
            Order storage o = orders[i];
            // crossesBuy = isBuy && tickIdx >= clearingTick
            // crossesSell = !isBuy && tickIdx <= clearingTick
            ebool tickGe = FHE.ge(o.tickIdx, clearingEnc);
            ebool tickLe = FHE.le(o.tickIdx, clearingEnc);
            ebool crossesBuy = FHE.and(o.isBuy, tickGe);
            ebool crossesSell = FHE.and(FHE.not(o.isBuy), tickLe);
            ebool fills = FHE.or(crossesBuy, crossesSell);

            o.filledSize = FHE.select(fills, o.size, FHE.asEuint64(0));
            FHE.allowThis(o.filledSize);
            FHE.allow(o.filledSize, o.trader);
        }

        emit BatchCleared(batchId, clearingTick);
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
