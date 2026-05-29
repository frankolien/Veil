// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {euint64} from "@fhevm/solidity/lib/FHE.sol";

/// @notice The slice of ERC-7984 / OpenZeppelin Confidential Fungible Token
///         that Veil binds against. We only need pre-approved (no-proof)
///         transfers because the contract derives escrow amounts internally.
interface IConfidentialToken {
    function setOperator(address operator, uint48 until) external;

    function isOperator(address holder, address spender) external view returns (bool);

    function confidentialBalanceOf(address account) external view returns (euint64);

    function confidentialTransfer(address to, euint64 amount) external returns (euint64 transferred);

    function confidentialTransferFrom(
        address from,
        address to,
        euint64 amount
    ) external returns (euint64 transferred);
}
