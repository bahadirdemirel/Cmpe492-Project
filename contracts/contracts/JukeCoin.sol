// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title JukeCoin
/// @notice Test ERC-20 for the jukebox. Anyone can claim free tokens from the faucet.
/// @dev Faucet minting is unrestricted by design, so this token has no real value.
contract JukeCoin is ERC20 {
    /// @notice Tokens minted per faucet claim (1,000 JUKE).
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** 18;

    /// @notice Minimum time between two claims from the same wallet.
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    /// @notice Price of one song playback (0.001 JUKE), burned from the listener.
    uint256 public constant PLAY_PRICE = 10 ** 15;

    /// @notice Timestamp of each wallet's last faucet claim (0 if never claimed).
    mapping(address account => uint256 timestamp) public lastClaimedAt;

    event FaucetClaimed(address indexed account, uint256 amount);

    /// @dev The backend verifies plays by this event; keep its signature in sync with backend/music/chain.py.
    event SongPlayed(address indexed listener, uint256 indexed songId, bytes32 indexed playId, uint256 price);

    error FaucetCooldownActive(uint256 nextClaimAt);

    constructor() ERC20("JukeCoin", "JUKE") {}

    /// @notice Mints FAUCET_AMOUNT to the caller, at most once per FAUCET_COOLDOWN.
    function claimTokens() external {
        uint256 next = nextClaimAt(msg.sender);
        if (block.timestamp < next) revert FaucetCooldownActive(next);

        lastClaimedAt[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);

        emit FaucetClaimed(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Pays for one playback by burning PLAY_PRICE from the caller.
    /// @param songId Backend id of the song being played.
    /// @param playId One-time id issued by the backend, linking this payment to a user's play request.
    function payForPlay(uint256 songId, bytes32 playId) external {
        _burn(msg.sender, PLAY_PRICE); // reverts with ERC20InsufficientBalance if the balance is too low
        emit SongPlayed(msg.sender, songId, playId, PLAY_PRICE);
    }

    /// @notice Earliest timestamp at which `account` can claim again (0 = claim now).
    function nextClaimAt(address account) public view returns (uint256) {
        uint256 last = lastClaimedAt[account];
        return last == 0 ? 0 : last + FAUCET_COOLDOWN;
    }
}
