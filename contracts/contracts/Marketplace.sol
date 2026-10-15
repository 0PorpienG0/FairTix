// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {TicketNFT} from "./TicketNFT.sol";

contract Marketplace is ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;

    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 price;
        bool active;
    }

    IERC20 public immutable usdc;
    TicketNFT public immutable ticket;
    address public immutable artist;
    address public immutable platform;
    uint256 public immutable faceValue;
    uint256 public immutable capBps;
    uint256 public immutable royaltyFlat;
    uint256 public immutable feeFlat;

    uint256 public nextListingId;
    mapping(uint256 => Listing) public listings;

    error PriceAboveCap(uint256 price, uint256 maxPrice);
    error PriceTooLow(uint256 price, uint256 minPrice);
    error NotOwner();
    error NotSeller();
    error NotActive();

    event Listed(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 price);
    event Cancelled(uint256 indexed listingId);
    event Sold(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 price,
        uint256 royalty,
        uint256 fee,
        uint256 sellerProceeds
    );

    constructor(
        IERC20 usdc_,
        TicketNFT ticket_,
        address artist_,
        address platform_,
        uint256 faceValue_,
        uint256 capBps_,
        uint256 royaltyFlat_,
        uint256 feeFlat_
    ) {
        usdc = usdc_;
        ticket = ticket_;
        artist = artist_;
        platform = platform_;
        faceValue = faceValue_;
        capBps = capBps_;
        royaltyFlat = royaltyFlat_;
        feeFlat = feeFlat_;
    }

    function maxPrice() public view returns (uint256) {
        return (faceValue * capBps) / 10000;
    }

    function list(uint256 tokenId, uint256 price) external nonReentrant returns (uint256 listingId) {
        if (ticket.ownerOf(tokenId) != msg.sender) revert NotOwner();
        uint256 cap = maxPrice();
        if (price > cap) revert PriceAboveCap(price, cap);
        if (price < royaltyFlat + feeFlat) revert PriceTooLow(price, royaltyFlat + feeFlat);
        listingId = nextListingId++;
        listings[listingId] = Listing(msg.sender, tokenId, price, true);
        ticket.transferFrom(msg.sender, address(this), tokenId);
        emit Listed(listingId, msg.sender, tokenId, price);
    }

    function cancel(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();
        if (l.seller != msg.sender) revert NotSeller();
        l.active = false;
        ticket.transferFrom(address(this), l.seller, l.tokenId);
        emit Cancelled(listingId);
    }

    function buy(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();
        l.active = false;
        uint256 price = l.price;
        uint256 proceeds = price - royaltyFlat - feeFlat;
        usdc.safeTransferFrom(msg.sender, artist, royaltyFlat);
        usdc.safeTransferFrom(msg.sender, platform, feeFlat);
        usdc.safeTransferFrom(msg.sender, l.seller, proceeds);
        ticket.transferFrom(address(this), msg.sender, l.tokenId);
        emit Sold(listingId, msg.sender, l.tokenId, price, royaltyFlat, feeFlat, proceeds);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
