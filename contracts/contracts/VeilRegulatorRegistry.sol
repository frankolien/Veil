// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

contract VeilRegulatorRegistry {
    struct Grant {
        address regulator;
        uint48 until;
    }

    mapping(address => Grant) internal _grants;

    event RegulatorSet(address indexed user, address indexed regulator, uint48 until);
    event RegulatorRevoked(address indexed user, address indexed regulator);

    error InvalidUntil();
    error ZeroAddress();

    function setRegulator(address regulator, uint48 until) external {
        if (regulator == address(0)) revert ZeroAddress();
        if (until <= block.timestamp) revert InvalidUntil();
        _grants[msg.sender] = Grant({regulator: regulator, until: until});
        emit RegulatorSet(msg.sender, regulator, until);
    }

    function revokeRegulator() external {
        Grant memory g = _grants[msg.sender];
        delete _grants[msg.sender];
        emit RegulatorRevoked(msg.sender, g.regulator);
    }

    function regulatorOf(address user) external view returns (address regulator, uint48 until) {
        Grant memory g = _grants[user];
        if (g.until <= block.timestamp) return (address(0), 0);
        return (g.regulator, g.until);
    }

    function isAuditorOf(address user, address auditor) external view returns (bool) {
        Grant memory g = _grants[user];
        return g.regulator == auditor && g.until > block.timestamp;
    }
}
