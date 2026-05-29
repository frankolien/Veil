// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IConfidentialToken} from "./IConfidentialToken.sol";

/// @notice Test-only ERC-7984 mock. Implements just the surface Veil binds
///         against — no callbacks, no encrypted disclosure, no proof-bearing
///         overloads. Mint is permissionless to simplify fixtures.
contract MockConfidentialToken is IConfidentialToken, ZamaEthereumConfig {
    mapping(address => euint64) private _balances;
    mapping(address => mapping(address => uint48)) private _operatorUntil;

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
