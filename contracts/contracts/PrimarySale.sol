// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TicketNFT} from "./TicketNFT.sol";

contract PrimarySale is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    TicketNFT public immutable ticket;
    address public immutable organizer;
    address public immutable platform;
    address public immutable treasury;
    uint256 public immutable faceValue;
    uint256 public immutable organizerShare;
    uint256 public immutable platformShare;
    uint256 public immutable maxSupply;
    uint256 private _sold;

    error OnlyTreasury();
    error SoldOut();
    error BadSplit();

    event TicketSold(address indexed buyer, uint256 indexed tokenId, uint256 organizerAmount, uint256 platformAmount);

    constructor(
        IERC20 usdc_,
        TicketNFT ticket_,
        address organizer_,
        address platform_,
        uint256 faceValue_,
        uint256 organizerShare_,
        uint256 platformShare_,
        uint256 maxSupply_,
        address treasury_
    ) {
        if (organizerShare_ + platformShare_ != faceValue_) revert BadSplit();
        usdc = usdc_;
        ticket = ticket_;
        organizer = organizer_;
        platform = platform_;
        faceValue = faceValue_;
        organizerShare = organizerShare_;
        platformShare = platformShare_;
        maxSupply = maxSupply_;
        treasury = treasury_;
    }

    function sold() external view returns (uint256) {
        return _sold;
    }

    function buyFor(address buyer) external nonReentrant returns (uint256 tokenId) {
        if (msg.sender != treasury) revert OnlyTreasury();
        if (_sold >= maxSupply) revert SoldOut();
        _sold++;
        usdc.safeTransferFrom(treasury, organizer, organizerShare);
        usdc.safeTransferFrom(treasury, platform, platformShare);
        tokenId = ticket.mint(buyer);
        emit TicketSold(buyer, tokenId, organizerShare, platformShare);
    }
}
