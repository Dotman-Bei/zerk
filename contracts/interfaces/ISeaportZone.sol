// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/**
 * @title Seaport 1.6 zone types
 * @notice Verbatim copies of the Seaport structs a zone receives. Declared locally so the
 *         repo does not need to vendor the whole Seaport source tree — Seaport itself is
 *         never compiled, deployed or modified by this project. We call the canonical
 *         deployment at 0x0000000000000068F116a894984e2DB1123eB395.
 */

enum ItemType {
    NATIVE,
    ERC20,
    ERC721,
    ERC1155,
    ERC721_WITH_CRITERIA,
    ERC1155_WITH_CRITERIA
}

struct SpentItem {
    ItemType itemType;
    address token;
    uint256 identifier;
    uint256 amount;
}

struct ReceivedItem {
    ItemType itemType;
    address token;
    uint256 identifier;
    uint256 amount;
    address payable recipient;
}

struct ZoneParameters {
    bytes32 orderHash;
    address fulfiller;
    address offerer;
    SpentItem[] offer;
    ReceivedItem[] consideration;
    bytes extraData;
    bytes32[] orderHashes;
    uint256 startTime;
    uint256 endTime;
    bytes32 zoneHash;
}

struct Schema {
    uint256 id;
    bytes metadata;
}

/**
 * @notice The zone interface Seaport 1.6 expects. `authorizeOrder` is invoked before any
 *         token transfer, `validateOrder` after all of them. Either reverting, or returning
 *         anything other than its own selector, reverts the whole fulfilment.
 */
interface ISeaportZone {
    function authorizeOrder(
        ZoneParameters calldata zoneParameters
    ) external returns (bytes4 authorizeOrderMagicValue);

    function validateOrder(
        ZoneParameters calldata zoneParameters
    ) external returns (bytes4 validOrderMagicValue);

    function getSeaportMetadata()
        external
        view
        returns (string memory name, Schema[] memory schemas);
}
