// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IZerkBook} from "../interfaces/IZerkBook.sol";

/**
 * @title MockZerkBook
 * @notice Test double for `ZerkZone` gating tests. Lets the suite assert the zone's behaviour
 *         on a local chain, where no NoxCompute deployment exists to run the real book.
 * @dev Test-only. Never deployed to a live network.
 */
contract MockZerkBook is IZerkBook {
    address public baseToken;
    address public quoteToken;

    struct Terms {
        uint256 fillSize;
        uint256 fillPrice;
        uint256 notional;
        bool approved;
        bool consumed;
    }

    mapping(bytes32 => Terms) public terms;
    uint256 public consumeCalls;

    error MatchNotApproved(bytes32 matchId);

    constructor(address base_, address quote_) {
        baseToken = base_;
        quoteToken = quote_;
    }

    function approveMatch(
        bytes32 matchId,
        uint256 fillSize,
        uint256 fillPrice,
        uint256 notional
    ) external {
        terms[matchId] = Terms(fillSize, fillPrice, notional, true, false);
    }

    function isApprovedMatch(bytes32 matchId) external view returns (bool) {
        Terms storage t = terms[matchId];
        return t.approved && !t.consumed;
    }

    function fillTerms(
        bytes32 matchId
    ) external view returns (uint256 fillSize, uint256 fillPrice, uint256 notional) {
        Terms storage t = terms[matchId];
        require(t.approved, MatchNotApproved(matchId));
        return (t.fillSize, t.fillPrice, t.notional);
    }

    function consumeMatch(bytes32 matchId) external {
        Terms storage t = terms[matchId];
        require(t.approved && !t.consumed, MatchNotApproved(matchId));
        t.consumed = true;
        ++consumeCalls;
    }
}
