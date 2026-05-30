// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IConfidentialToken} from "./IConfidentialToken.sol";

contract VeilLendingVault is ZamaEthereumConfig {
    uint16 public constant BPS_DENOM = 10_000;

    IConfidentialToken public immutable collateralToken;
    IConfidentialToken public immutable debtToken;
    uint64 public immutable price;
    uint16 public immutable ltvBps;
    uint16 public immutable liquidationBonusBps;

    struct Position {
        euint64 collateral;
        euint64 debt;
        bool exists;
    }

    mapping(address => Position) internal positions;
    mapping(address => mapping(address => uint48)) internal _operatorUntil;

    event PositionOpened(address indexed user);
    event Deposited(address indexed user);
    event Withdrawn(address indexed user);
    event Borrowed(address indexed user);
    event Repaid(address indexed user);
    event Liquidated(address indexed borrower, address indexed keeper);
    event MarginEscrow(address indexed user, address indexed veil);
    event MarginCredited(address indexed user, address indexed veil);

    constructor(
        IConfidentialToken collateralToken_,
        IConfidentialToken debtToken_,
        uint64 price_,
        uint16 ltvBps_,
        uint16 liquidationBonusBps_
    ) {
        require(address(collateralToken_) != address(0) && address(debtToken_) != address(0), "token=0");
        require(price_ > 0, "price=0");
        require(ltvBps_ > 0 && ltvBps_ < BPS_DENOM, "ltv");
        require(liquidationBonusBps_ < BPS_DENOM, "bonus");
        collateralToken = collateralToken_;
        debtToken = debtToken_;
        price = price_;
        ltvBps = ltvBps_;
        liquidationBonusBps = liquidationBonusBps_;
    }

    function deposit(externalEuint64 amountExt, bytes calldata proof) external {
        euint64 amount = FHE.fromExternal(amountExt, proof);
        Position storage p = _ensurePosition(msg.sender);

        FHE.allowTransient(amount, address(collateralToken));
        collateralToken.confidentialTransferFrom(msg.sender, address(this), amount);

        p.collateral = FHE.add(p.collateral, amount);
        _grant(p.collateral, msg.sender);
        emit Deposited(msg.sender);
    }

    function withdraw(externalEuint64 amountExt, bytes calldata proof) external {
        Position storage p = _ensurePosition(msg.sender);

        euint64 requested = FHE.fromExternal(amountExt, proof);

        ebool enoughCollateral = FHE.le(requested, p.collateral);
        euint64 capped = FHE.select(enoughCollateral, requested, FHE.asEuint64(0));

        euint64 newCollateral = FHE.sub(p.collateral, capped);
        euint64 maxBorrowAfter = _maxBorrow(newCollateral);
        ebool stillHealthy = FHE.le(p.debt, maxBorrowAfter);

        euint64 actual = FHE.select(stillHealthy, capped, FHE.asEuint64(0));
        p.collateral = FHE.sub(p.collateral, actual);

        FHE.allowTransient(actual, address(collateralToken));
        collateralToken.confidentialTransfer(msg.sender, actual);

        _grant(p.collateral, msg.sender);
        emit Withdrawn(msg.sender);
    }

    function borrow(externalEuint64 amountExt, bytes calldata proof) external {
        Position storage p = _ensurePosition(msg.sender);

        euint64 requested = FHE.fromExternal(amountExt, proof);
        euint64 maxBorrow = _maxBorrow(p.collateral);
        euint64 newDebtRequested = FHE.add(p.debt, requested);
        ebool fits = FHE.le(newDebtRequested, maxBorrow);

        euint64 actual = FHE.select(fits, requested, FHE.asEuint64(0));
        p.debt = FHE.add(p.debt, actual);

        FHE.allowTransient(actual, address(debtToken));
        debtToken.confidentialTransfer(msg.sender, actual);

        _grant(p.debt, msg.sender);
        emit Borrowed(msg.sender);
    }

    function repay(externalEuint64 amountExt, bytes calldata proof) external {
        Position storage p = _ensurePosition(msg.sender);

        euint64 requested = FHE.fromExternal(amountExt, proof);
        ebool capDebt = FHE.le(requested, p.debt);
        euint64 capped = FHE.select(capDebt, requested, p.debt);

        FHE.allowTransient(capped, address(debtToken));
        debtToken.confidentialTransferFrom(msg.sender, address(this), capped);

        p.debt = FHE.sub(p.debt, capped);
        _grant(p.debt, msg.sender);
        emit Repaid(msg.sender);
    }

    function liquidate(address borrower) external {
        Position storage p = _ensurePosition(borrower);

        euint64 maxBorrow = _maxBorrow(p.collateral);
        ebool unhealthy = FHE.gt(p.debt, maxBorrow);

        euint64 seizedCollateral = FHE.select(unhealthy, p.collateral, FHE.asEuint64(0));
        euint64 clearedDebt = FHE.select(unhealthy, p.debt, FHE.asEuint64(0));

        p.collateral = FHE.sub(p.collateral, seizedCollateral);
        p.debt = FHE.sub(p.debt, clearedDebt);

        FHE.allowTransient(seizedCollateral, address(collateralToken));
        collateralToken.confidentialTransfer(msg.sender, seizedCollateral);

        _grant(p.collateral, borrower);
        _grant(p.debt, borrower);
        emit Liquidated(borrower, msg.sender);
    }

    function setOperator(address operator, uint48 until) external {
        _operatorUntil[msg.sender][operator] = until;
    }

    function isOperator(address holder, address spender) external view returns (bool) {
        return _operatorUntil[holder][spender] >= block.timestamp;
    }

    /// @notice Composition entry point. Used by Veil's `placeOrderFromVault` to
    ///         pull a sell-side encrypted size out of the user's vault collateral
    ///         without the user moving back to their wallet first. The same FHE
    ///         clamp pattern as `withdraw` applies — over-borrow or under-collateralised
    ///         requests silently sink to zero.
    function escrowToVeil(address user, euint64 amount) external returns (euint64) {
        require(_operatorUntil[user][msg.sender] >= block.timestamp, "not operator");
        Position storage p = _ensurePosition(user);

        ebool canCover = FHE.le(amount, p.collateral);
        euint64 capped = FHE.select(canCover, amount, FHE.asEuint64(0));

        euint64 newCollateral = FHE.sub(p.collateral, capped);
        euint64 maxBorrowAfter = _maxBorrow(newCollateral);
        ebool stillHealthy = FHE.le(p.debt, maxBorrowAfter);
        euint64 actual = FHE.select(stillHealthy, capped, FHE.asEuint64(0));

        p.collateral = FHE.sub(p.collateral, actual);

        FHE.allowTransient(actual, address(collateralToken));
        collateralToken.confidentialTransfer(msg.sender, actual);

        _grant(p.collateral, user);
        FHE.allowThis(actual);
        FHE.allow(actual, msg.sender);
        emit MarginEscrow(user, msg.sender);
        return actual;
    }

    /// @notice Composition return path. Veil's `settle` calls this to credit the
    ///         trader's unfilled sell amount back into vault collateral instead
    ///         of returning vWETH to the wallet. The vault pulls the vWETH from
    ///         Veil via the operator approval Veil holds on its own collateral
    ///         token, then credits the user's encrypted collateral.
    function creditFromVeil(address user, euint64 amount) external {
        require(_operatorUntil[user][msg.sender] >= block.timestamp, "not operator");
        Position storage p = _ensurePosition(user);

        FHE.allowTransient(amount, address(collateralToken));
        collateralToken.confidentialTransferFrom(msg.sender, address(this), amount);

        p.collateral = FHE.add(p.collateral, amount);
        _grant(p.collateral, user);
        emit MarginCredited(user, msg.sender);
    }

    function getCollateral(address user) external view returns (euint64) {
        return positions[user].collateral;
    }

    function getDebt(address user) external view returns (euint64) {
        return positions[user].debt;
    }

    function positionExists(address user) external view returns (bool) {
        return positions[user].exists;
    }

    function _maxBorrow(euint64 collateral) internal returns (euint64) {
        euint64 collateralValue = FHE.mul(collateral, price);
        return FHE.div(FHE.mul(collateralValue, uint64(ltvBps)), uint64(BPS_DENOM));
    }

    function _ensurePosition(address user) internal returns (Position storage p) {
        p = positions[user];
        if (!p.exists) {
            p.collateral = FHE.asEuint64(0);
            p.debt = FHE.asEuint64(0);
            p.exists = true;
            FHE.allowThis(p.collateral);
            FHE.allowThis(p.debt);
            FHE.allow(p.collateral, user);
            FHE.allow(p.debt, user);
            emit PositionOpened(user);
        }
    }

    function _grant(euint64 handle, address user) internal {
        FHE.allowThis(handle);
        FHE.allow(handle, user);
    }
}
