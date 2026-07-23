// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/**
 * @title IZerkBook
 * @notice The surface `ZerkZone` needs from the order book. Kept deliberately narrow: the zone
 *         is allowed to ask whether a match was approved and to mark it consumed, and nothing else.
 */
interface IZerkBook {
    /// @return True only if the match was finalised as crossed and has not settled yet.
    function isApprovedMatch(bytes32 matchId) external view returns (bool);

    /// @notice Plaintext fill terms, written only once a match finalises as crossed.
    function fillTerms(
        bytes32 matchId
    ) external view returns (uint256 fillSize, uint256 fillPrice, uint256 notional);

    /// @notice Marks a match settled. Callable only by the registered zone.
    function consumeMatch(bytes32 matchId) external;

    function baseToken() external view returns (address);

    function quoteToken() external view returns (address);
}
