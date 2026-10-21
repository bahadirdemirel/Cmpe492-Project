// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Jukebox (starter)
/// @notice Placeholder contract to verify the toolchain; replace with the real design.
contract Jukebox {
    address public immutable owner;
    uint256 public requestPrice;

    event SongRequested(address indexed requester, string songId, uint256 amount);

    error InsufficientPayment(uint256 sent, uint256 required);
    error NotOwner();

    constructor(uint256 _requestPrice) {
        owner = msg.sender;
        requestPrice = _requestPrice;
    }

    function requestSong(string calldata songId) external payable {
        if (msg.value < requestPrice) revert InsufficientPayment(msg.value, requestPrice);
        emit SongRequested(msg.sender, songId, msg.value);
    }

    function withdraw() external {
        if (msg.sender != owner) revert NotOwner();
        payable(owner).transfer(address(this).balance);
    }
}
