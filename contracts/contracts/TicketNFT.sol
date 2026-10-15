// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Ticket NFT; only the marketplace may move tokens between holders.
contract TicketNFT is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    address public marketplace;
    uint256 private _nextId = 1;

    error TransferLocked();
    error BurnDisabled();

    event MarketplaceSet(address marketplace);

    constructor(string memory name_, string memory symbol_, address admin) ERC721(name_, symbol_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mint(address to) external onlyRole(MINTER_ROLE) returns (uint256 tokenId) {
        tokenId = _nextId++;
        _safeMint(to, tokenId);
    }

    function setMarketplace(address m) external onlyRole(DEFAULT_ADMIN_ROLE) {
        marketplace = m;
        emit MarketplaceSet(m);
    }

    function totalMinted() external view returns (uint256) {
        return _nextId - 1;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (to == address(0)) revert BurnDisabled();
        if (from != address(0) && msg.sender != marketplace) revert TransferLocked();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 id) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(id);
    }
}
