// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IZerkBook} from "./interfaces/IZerkBook.sol";
import {
    ISeaportZone,
    ReceivedItem,
    Schema,
    SpentItem,
    ZoneParameters
} from "./interfaces/ISeaportZone.sol";

/**
 * @title ZerkZone
 * @notice The entire Seaport integration: small, boring and load-bearing.
 *
 * Seaport calls a restricted order's zone twice — `authorizeOrder` before any token moves and
 * `validateOrder` after all of them. Reverting in either aborts the whole fulfilment.
 *
 * The binding trick is `zoneHash`: an arbitrary 32 bytes baked into the order at signing time
 * and handed to the zone at fulfilment. Zerk puts the match id there. A Seaport order is
 * therefore unfillable unless `ZerkBook` has approved that exact match, at that exact size and
 * price — no front-running the settlement, no replay, no fulfilling something the TEE never
 * authorised. Seaport itself is untouched and runs at its canonical address.
 *
 * @dev Orders must be signed as FULL_RESTRICTED. Under PARTIAL_RESTRICTED Seaport scales the
 *      item amounts by the fill fraction, which would not equal the exact approved fill.
 */
contract ZerkZone is ISeaportZone {
    IZerkBook public immutable book;
    address public immutable seaport;

    error NotSeaport(address caller);
    error MatchNotApproved(bytes32 matchId);
    error UnexpectedFillSize(uint256 expected, uint256 actual);
    error UnexpectedNotional(uint256 expected, uint256 actual);
    error UnrecognisedPair();

    constructor(address book_, address seaport_) {
        book = IZerkBook(book_);
        seaport = seaport_;
    }

    // ============ Seaport hooks ============

    /**
     * @notice Pre-transfer gate. Reverts unless the TEE approved this exact match, and unless
     *         the amounts about to move are the ones it approved.
     */
    function authorizeOrder(
        ZoneParameters calldata zp
    ) external view returns (bytes4 authorizeOrderMagicValue) {
        require(msg.sender == seaport, NotSeaport(msg.sender));

        bytes32 matchId = zp.zoneHash;
        require(book.isApprovedMatch(matchId), MatchNotApproved(matchId));

        _requireAmountsMatch(matchId, zp.offer, zp.consideration);

        return this.authorizeOrder.selector;
    }

    /**
     * @notice Post-transfer hook. Burns the match so it can never be fulfilled twice.
     */
    function validateOrder(
        ZoneParameters calldata zp
    ) external returns (bytes4 validOrderMagicValue) {
        require(msg.sender == seaport, NotSeaport(msg.sender));

        book.consumeMatch(zp.zoneHash);

        return this.validateOrder.selector;
    }

    // ============ Amount binding ============

    /**
     * @dev Without this check a fulfiller could present a valid, approved match id alongside
     *      an order that moves the wrong amounts. Both directions are accepted — the RWA
     *      seller or the cash buyer may be the offerer — but the crossing leg must be exact
     *      and the paying leg must be at least the approved notional.
     */
    function _requireAmountsMatch(
        bytes32 matchId,
        SpentItem[] calldata offer,
        ReceivedItem[] calldata consideration
    ) internal view {
        (uint256 fillSize, , uint256 notional) = book.fillTerms(matchId);

        address base = book.baseToken();
        address quote = book.quoteToken();

        uint256 baseOffered = _sumOffer(offer, base);

        if (baseOffered != 0) {
            // The RWA holder is the offerer: base out, cash in.
            require(baseOffered == fillSize, UnexpectedFillSize(fillSize, baseOffered));
            uint256 quotePaid = _sumConsideration(consideration, quote);
            require(quotePaid >= notional, UnexpectedNotional(notional, quotePaid));
            return;
        }

        uint256 quoteOffered = _sumOffer(offer, quote);
        require(quoteOffered != 0, UnrecognisedPair());

        // The cash holder is the offerer: cash out, RWA in.
        require(quoteOffered == notional, UnexpectedNotional(notional, quoteOffered));
        uint256 baseReceived = _sumConsideration(consideration, base);
        require(baseReceived >= fillSize, UnexpectedFillSize(fillSize, baseReceived));
    }

    function _sumOffer(
        SpentItem[] calldata items,
        address token
    ) internal pure returns (uint256 total) {
        for (uint256 i = 0; i < items.length; ++i) {
            if (items[i].token == token) total += items[i].amount;
        }
    }

    function _sumConsideration(
        ReceivedItem[] calldata items,
        address token
    ) internal pure returns (uint256 total) {
        for (uint256 i = 0; i < items.length; ++i) {
            if (items[i].token == token) total += items[i].amount;
        }
    }

    // ============ Metadata ============

    function getSeaportMetadata()
        external
        pure
        returns (string memory name, Schema[] memory schemas)
    {
        name = "ZerkZone";
        schemas = new Schema[](0);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(ISeaportZone).interfaceId ||
            interfaceId == 0x01ffc9a7; // ERC-165
    }
}
