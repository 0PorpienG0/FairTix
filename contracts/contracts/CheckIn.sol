// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CheckIn
/// @notice On-chain "ticket used" register. Only the venue gate wallet can admit a ticket, and only once.
contract CheckIn {
    address public immutable gate;
    mapping(uint256 => bool) public used;

    event CheckedIn(uint256 indexed tokenId);

    error NotGate();
    error AlreadyUsed(uint256 tokenId);

    constructor(address gate_) {
        gate = gate_;
    }

    function checkIn(uint256 tokenId) external {
        if (msg.sender != gate) revert NotGate();
        if (used[tokenId]) revert AlreadyUsed(tokenId);
        used[tokenId] = true;
        emit CheckedIn(tokenId);
    }
}
