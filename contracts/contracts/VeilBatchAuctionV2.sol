// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8, euint64, externalEbool, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IConfidentialToken} from "./IConfidentialToken.sol";

interface IVeilMarginVault {
    function escrowToVeil(address user, euint64 amount) external returns (euint64);
    function creditFromVeil(address user, euint64 amount) external;
}

/// @title VeilBatchAuctionV2 — sealed-bid uniform-price batch CLOB with ERC-7984 escrow
/// @notice v2 adds two-token escrow on placeOrder and per-user settle() after clearing.
///         See docs/02-algorithm.md for the matching math and docs/08-decisions.md
///         (ADR-010) for the escrow design.
contract VeilBatchAuctionV2 is ZamaEthereumConfig {
    uint8 public constant NUM_TICKS = 4;
    uint16 public constant BPS_DENOM = 10_000;

    enum BatchState { Open, Closed, Cleared }

    struct Order {
        address trader;
        ebool isBuy;
        euint8 tickIdx;
        euint64 size;
        euint64 filledSize;
        bool settled;
        address marginVault;
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
    IConfidentialToken public immutable baseToken;
    IConfidentialToken public immutable quoteToken;
    uint64 public immutable tickPrice0;
    uint64 public immutable tickStep;

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
    event OrderSettled(uint256 indexed batchId, uint256 indexed orderIndex, address indexed trader);

    error BatchNotOpen();
    error BatchNotClosed();
    error BatchAlreadyCleared();
    error BatchNotCleared();
    error InvalidClearingTick();
    error InvalidMarginalBps();
    error NotOrderTrader();
    error AlreadySettled();

    constructor(
        uint256 batchBlocks_,
        IConfidentialToken baseToken_,
        IConfidentialToken quoteToken_,
        uint64 tickPrice0_,
        uint64 tickStep_
    ) {
        require(batchBlocks_ > 0, "batchBlocks=0");
        require(address(baseToken_) != address(0) && address(quoteToken_) != address(0), "token=0");
        require(tickPrice0_ > 0 && tickStep_ > 0, "price=0");
        batchBlocks = batchBlocks_;
        baseToken = baseToken_;
        quoteToken = quoteToken_;
        tickPrice0 = tickPrice0_;
        tickStep = tickStep_;
        _openNewBatch();
    }

    /// @notice One-shot authorization for a margin vault to pull base collateral
    ///         out of Veil's escrow during settle. Permissionless because the vault
    ///         itself gates pulls behind a per-user operator approval.
    function authorizeMarginVault(address marginVault) external {
        require(marginVault != address(0), "vault=0");
        baseToken.setOperator(marginVault, type(uint48).max);
    }

    function tickPrice(uint8 tick) public view returns (uint64) {
        return tickPrice0 + uint64(tick) * tickStep;
    }

    function maxTickPrice() public view returns (uint64) {
        return tickPrice(NUM_TICKS - 1);
    }

    function placeOrder(
        externalEbool sideExt,
        externalEuint8 tickExt,
        externalEuint64 sizeExt,
        bytes calldata proof
    ) external {
        _placeOrder(sideExt, tickExt, sizeExt, proof, address(0));
    }

    /// @notice Composition entry point. The sell-side base escrow is pulled from
    ///         the user's encrypted collateral inside `marginVault` instead of
    ///         their wallet. Buy-side quote escrow still comes from the wallet.
    function placeOrderFromVault(
        externalEbool sideExt,
        externalEuint8 tickExt,
        externalEuint64 sizeExt,
        bytes calldata proof,
        address marginVault
    ) external {
        require(marginVault != address(0), "vault=0");
        _placeOrder(sideExt, tickExt, sizeExt, proof, marginVault);
    }

    function _placeOrder(
        externalEbool sideExt,
        externalEuint8 tickExt,
        externalEuint64 sizeExt,
        bytes calldata proof,
        address marginVault
    ) internal {
        uint256 batchId = currentBatchId;
        Batch storage b = _batches[batchId];
        if (b.state != BatchState.Open || block.number >= b.closeBlock) revert BatchNotOpen();

        ebool isBuy = FHE.fromExternal(sideExt, proof);
        euint8 tickIdx = FHE.fromExternal(tickExt, proof);
        euint64 size = FHE.fromExternal(sizeExt, proof);

        _aggregate(b, isBuy, tickIdx, size);
        _pullEscrow(isBuy, size, marginVault);

        Order storage o = _orders[batchId].push();
        o.trader = msg.sender;
        o.isBuy = isBuy;
        o.tickIdx = tickIdx;
        o.size = size;
        o.filledSize = FHE.asEuint64(0);
        o.marginVault = marginVault;

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

    function closeBatch() external {
        uint256 batchId = currentBatchId;
        Batch storage b = _batches[batchId];
        if (b.state != BatchState.Open || block.number < b.closeBlock) revert BatchNotOpen();
        b.state = BatchState.Closed;

        for (uint8 t = 0; t < NUM_TICKS; t++) {
            FHE.makePubliclyDecryptable(b.buyVolume[t]);
            FHE.makePubliclyDecryptable(b.sellVolume[t]);
        }

        emit BatchClosed(batchId);
        emit AggregatesPublished(batchId);

        _openNewBatch();
    }

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

            ebool tickEq = FHE.eq(o.tickIdx, clearingEnc);
            ebool tickGt = FHE.gt(o.tickIdx, clearingEnc);
            ebool tickLt = FHE.lt(o.tickIdx, clearingEnc);

            ebool isBuyAbove = FHE.and(o.isBuy, tickGt);
            ebool isSellBelow = FHE.and(FHE.not(o.isBuy), tickLt);
            euint64 fullFill = FHE.select(FHE.or(isBuyAbove, isSellBelow), o.size, zero);

            ebool isBuyAt = FHE.and(o.isBuy, tickEq);
            ebool isSellAt = FHE.and(FHE.not(o.isBuy), tickEq);
            euint64 buyMarginal = FHE.div(FHE.mul(o.size, uint64(marginalBuyBps)), uint64(BPS_DENOM));
            euint64 sellMarginal = FHE.div(FHE.mul(o.size, uint64(marginalSellBps)), uint64(BPS_DENOM));
            euint64 marginalFill = FHE.select(isBuyAt, buyMarginal, FHE.select(isSellAt, sellMarginal, zero));

            o.filledSize = FHE.add(fullFill, marginalFill);
            FHE.allowThis(o.filledSize);
            FHE.allow(o.filledSize, o.trader);
        }

        emit BatchCleared(batchId, clearingTick, marginalBuyBps, marginalSellBps);
    }

    /// @notice Release the trader's filled side + refund the unfilled remainder.
    ///         Idempotent guard via `settled`.
    function settle(uint256 batchId, uint256 orderIdx) external {
        Order storage o = _orders[batchId][orderIdx];
        if (msg.sender != o.trader) revert NotOrderTrader();
        if (o.settled) revert AlreadySettled();

        Batch storage b = _batches[batchId];
        if (b.state != BatchState.Cleared) revert BatchNotCleared();
        o.settled = true;

        uint64 clearingPrice = tickPrice(b.clearingTick);
        uint64 maxPrice = maxTickPrice();
        euint64 filled = o.filledSize;
        euint64 size = o.size;

        euint64 sellQuotePayout = FHE.mul(filled, clearingPrice);
        euint64 sellBaseRefund = FHE.sub(size, filled);
        euint64 buyBasePayout = filled;
        euint64 buyQuoteRefund = FHE.sub(FHE.mul(size, maxPrice), FHE.mul(filled, clearingPrice));

        euint64 basePayout = FHE.select(o.isBuy, buyBasePayout, sellBaseRefund);
        euint64 quotePayout = FHE.select(o.isBuy, buyQuoteRefund, sellQuotePayout);

        if (o.marginVault != address(0)) {
            FHE.allowTransient(basePayout, address(baseToken));
            FHE.allowTransient(basePayout, o.marginVault);
            IVeilMarginVault(o.marginVault).creditFromVeil(msg.sender, basePayout);
        } else {
            FHE.allowTransient(basePayout, address(baseToken));
            baseToken.confidentialTransfer(msg.sender, basePayout);
        }
        FHE.allowTransient(quotePayout, address(quoteToken));
        quoteToken.confidentialTransfer(msg.sender, quotePayout);

        emit OrderSettled(batchId, orderIdx, msg.sender);
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

    function isOrderSettled(uint256 batchId, uint256 idx) external view returns (bool) {
        return _orders[batchId][idx].settled;
    }

    function _aggregate(Batch storage b, ebool isBuy, euint8 tickIdx, euint64 size) private {
        for (uint8 t = 0; t < NUM_TICKS; t++) {
            ebool match_ = FHE.eq(tickIdx, FHE.asEuint8(t));
            ebool buyHere = FHE.and(isBuy, match_);
            ebool sellHere = FHE.and(FHE.not(isBuy), match_);
            euint64 addBuy = FHE.select(buyHere, size, FHE.asEuint64(0));
            euint64 addSell = FHE.select(sellHere, size, FHE.asEuint64(0));
            b.buyVolume[t] = FHE.add(b.buyVolume[t], addBuy);
            b.sellVolume[t] = FHE.add(b.sellVolume[t], addSell);
            FHE.allowThis(b.buyVolume[t]);
            FHE.allowThis(b.sellVolume[t]);
        }
    }

    function _pullEscrow(ebool isBuy, euint64 size, address marginVault) private {
        euint64 zero = FHE.asEuint64(0);
        euint64 baseEscrow = FHE.select(isBuy, zero, size);
        euint64 quoteEscrow = FHE.select(isBuy, FHE.mul(size, maxTickPrice()), zero);

        if (marginVault != address(0)) {
            FHE.allowTransient(baseEscrow, marginVault);
            IVeilMarginVault(marginVault).escrowToVeil(msg.sender, baseEscrow);
        } else {
            FHE.allowTransient(baseEscrow, address(baseToken));
            baseToken.confidentialTransferFrom(msg.sender, address(this), baseEscrow);
        }
        FHE.allowTransient(quoteEscrow, address(quoteToken));
        quoteToken.confidentialTransferFrom(msg.sender, address(this), quoteEscrow);
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
