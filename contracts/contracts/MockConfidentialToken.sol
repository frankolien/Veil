// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IConfidentialToken} from "./IConfidentialToken.sol";

/// @notice Minimal ERC-7984 implementation Veil binds against. No callbacks,
///         no encrypted disclosure, no proof-bearing overloads. Permissionless
///         mint — fine for testing fixtures and a Sepolia demo deploy where
///         anyone may want demo balances. Production deployments would swap
///         in registry-listed cWETH / cUSDC and pay for euint128 throughout.
contract MockConfidentialToken is IConfidentialToken, ZamaEthereumConfig {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => euint64) private _balances;
    mapping(address => mapping(address => uint48)) private _operatorUntil;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, externalEuint64 amount, bytes calldata proof) external {
        euint64 delta = FHE.fromExternal(amount, proof);
        _balances[to] = FHE.add(_balances[to], delta);
        FHE.allowThis(_balances[to]);
        FHE.allow(_balances[to], to);
    }

    function setOperator(address operator, uint48 until) external {
        _operatorUntil[msg.sender][operator] = until;
    }

    function isOperator(address holder, address spender) external view returns (bool) {
        return _operatorUntil[holder][spender] >= block.timestamp;
    }

    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _balances[account];
    }

    function confidentialTransfer(address to, euint64 amount) external returns (euint64) {
        return _move(msg.sender, to, amount);
    }

    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external returns (euint64) {
        require(from == msg.sender || _operatorUntil[from][msg.sender] >= block.timestamp, "not operator");
        return _move(from, to, amount);
    }

    function _move(address from, address to, euint64 amount) private returns (euint64) {
        _balances[from] = FHE.sub(_balances[from], amount);
        _balances[to] = FHE.add(_balances[to], amount);
        FHE.allowThis(_balances[from]);
        FHE.allowThis(_balances[to]);
        FHE.allow(_balances[from], from);
        FHE.allow(_balances[to], to);
        return amount;
    }
}
