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
    uint256 public immutable royaltyBps;
    uint256 public immutable feeBps;

    uint256 public nextListingId;
    mapping(uint256 => Listing) public listings;

    error PriceAboveCap(uint256 price, uint256 maxPrice);
    error PriceTooLow(uint256 price, uint256 minPrice);
    error BadBps();
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
        uint256 royaltyBps_,
        uint256 feeBps_
    ) {
        if (royaltyBps_ + feeBps_ >= 10000) revert BadBps();
        usdc = usdc_;
        ticket = ticket_;
        artist = artist_;
        platform = platform_;
        faceValue = faceValue_;
        capBps = capBps_;
        royaltyBps = royaltyBps_;
        feeBps = feeBps_;
    }

    function maxPrice() public view returns (uint256) {
        return capBps == 0 ? 0 : (faceValue * capBps) / 10000;
    }

    function list(uint256 tokenId, uint256 price) external nonReentrant returns (uint256 listingId) {
        if (ticket.ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (capBps != 0) {
            uint256 cap = maxPrice();
            if (price > cap) revert PriceAboveCap(price, cap);
        }
        if (price == 0) revert PriceTooLow(price, 1);
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
        uint256 royalty = (price * royaltyBps) / 10000;
        uint256 fee = (price * feeBps) / 10000;
        uint256 proceeds = price - royalty - fee;
        usdc.safeTransferFrom(msg.sender, artist, royalty);
        usdc.safeTransferFrom(msg.sender, platform, fee);
        usdc.safeTransferFrom(msg.sender, l.seller, proceeds);
        ticket.transferFrom(address(this), msg.sender, l.tokenId);
        emit Sold(listingId, msg.sender, l.tokenId, price, royalty, fee, proceeds);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
