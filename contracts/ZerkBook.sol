// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {Nox} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {
    ebool,
    euint16,
    euint256,
    externalEuint16,
    externalEuint256
} from "encrypted-types/EncryptedTypes.sol";

import {IZerkBook} from "./interfaces/IZerkBook.sol";

/**
 * @title ZerkBook
 * @notice A confidential crossing network for a single permissioned-asset pair.
 *
 * Desks submit orders whose side, size and limit exist on-chain only as Nox handles. Crossing is
 * evaluated inside the TEE with branchless primitives, so a proposal that fails to cross is
 * computationally indistinguishable from one that succeeds until someone decrypts the result —
 * and a rejected proposal reveals nothing at all about why it failed.
 *
 * Only two numbers ever become plaintext: the executed fill size and the executed price. Limits,
 * resting sizes, cancelled orders and orders that never cross stay encrypted forever.
 *
 * @dev Nox compute is asynchronous. The lifecycle is deliberately three transactions:
 *
 *      submitOrder()   desk       encrypted terms in, handles stored
 *      proposeMatch()  anyone     TEE evaluates the cross; result handles stored
 *      finalizeMatch() anyone     decryption proofs verified on-chain, fill terms revealed
 *
 *      Between propose and finalize the Ingestor must pick up the events and a Runner must
 *      execute them. `finalizeMatch` will revert until the Runner has produced the values.
 */
contract ZerkBook is IZerkBook {
    // ============ Types ============

    enum Status {
        None,
        Open,
        Pending, // locked by a live proposal
        Matched, // crossed and approved, awaiting Seaport settlement
        Settled,
        Cancelled
    }

    /// @notice How the executed price is derived from the two encrypted limits.
    enum PricingRule {
        /// Fill at the seller's limit. The buyer's limit is never revealed to anyone; the
        /// seller's limit becomes the public execution price.
        AskLimit,
        /// Fill at the midpoint of the two limits — the classic crossing-network peg. Neither
        /// limit equals the published price, so neither is revealed to the public. Note the
        /// counterparty can still infer the other side's limit from the midpoint and its own.
        Midpoint
    }

    struct Order {
        address desk;
        euint16 side; // 0 = bid, 1 = ask
        euint256 size;
        euint256 limit;
        uint64 submittedAt;
        Status status;
    }

    struct Match {
        uint256 bidId;
        uint256 askId;
        ebool crossed;
        euint256 fillSize;
        euint256 fillPrice;
        uint256 plainFillSize;
        uint256 plainFillPrice;
        uint64 proposedAt;
        bool finalized;
        bool approved;
        bool consumed;
    }

    // ============ Constants ============

    uint16 internal constant SIDE_BID = 0;
    uint16 internal constant SIDE_ASK = 1;

    // ============ Immutables ============

    address public immutable baseToken; // the permissioned RWA
    address public immutable quoteToken; // the settlement currency (USDC)
    uint256 public immutable baseUnit; // 10 ** baseDecimals
    PricingRule public immutable pricingRule;
    address public immutable owner;

    // ============ Storage ============

    address public zone;

    uint256 public orderCount;
    mapping(uint256 orderId => Order) internal _orders;

    mapping(bytes32 matchId => Match) internal _matches;
    bytes32[] internal _matchList;
    uint256 internal _matchNonce;

    /// @dev Trivially-encrypted constants, materialised once and reused. Kept lazy so the
    ///      contract can be deployed and verified before the Nox stack is exercised.
    bool internal _constantsReady;
    euint256 internal _eZero;
    euint256 internal _eOne;
    euint256 internal _eTwo;
    euint16 internal _eSideBid;
    euint16 internal _eSideAsk;

    // ============ Events ============

    /// @dev Carries no information about the order beyond its existence and its owner.
    event OrderSubmitted(uint256 indexed orderId, address indexed desk);
    event OrderCancelled(uint256 indexed orderId, address indexed desk);
    event MatchProposed(bytes32 indexed matchId, uint256 indexed bidId, uint256 indexed askId);
    event MatchApproved(bytes32 indexed matchId, uint256 fillSize, uint256 fillPrice);
    /// @dev Emitted when a proposal did not cross. Reveals nothing about why.
    event MatchRejected(bytes32 indexed matchId);
    event MatchSettled(bytes32 indexed matchId);
    event AuditorGranted(uint256 indexed orderId, address indexed auditor);
    event ZoneUpdated(address indexed zone);

    // ============ Errors ============

    error NotOwner();
    error NotZone();
    error NotOrderOwner(uint256 orderId);
    error OrderNotOpen(uint256 orderId);
    error UnknownMatch(bytes32 matchId);
    error MatchAlreadyFinalized(bytes32 matchId);
    error MatchNotApproved(bytes32 matchId);
    error SameOrder();
    error ZoneAlreadySet();

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, NotOwner());
        _;
    }

    modifier onlyZone() {
        require(msg.sender == zone, NotZone());
        _;
    }

    // ============ Construction ============

    constructor(
        address baseToken_,
        address quoteToken_,
        uint8 baseDecimals_,
        PricingRule pricingRule_,
        address owner_
    ) {
        baseToken = baseToken_;
        quoteToken = quoteToken_;
        baseUnit = 10 ** baseDecimals_;
        pricingRule = pricingRule_;
        owner = owner_;
    }

    /// @notice One-shot wiring of the Seaport zone allowed to consume matches.
    function setZone(address zone_) external onlyOwner {
        require(zone == address(0), ZoneAlreadySet());
        zone = zone_;
        emit ZoneUpdated(zone_);
    }

    // ============ Order entry ============

    /**
     * @notice Submit an encrypted order.
     * @dev Every value arrives as a Nox external handle plus the gateway's proof. The proofs
     *      bind each handle to (this contract, msg.sender), so a desk cannot replay another
     *      desk's ciphertext. Nothing about the contents reaches storage, calldata or logs.
     *
     * @param extSide   encrypted uint16, 0 = bid, 1 = ask
     * @param extSize   encrypted uint256, in base-token units
     * @param extLimit  encrypted uint256, quote units per whole base token
     */
    function submitOrder(
        externalEuint16 extSide,
        bytes calldata sideProof,
        externalEuint256 extSize,
        bytes calldata sizeProof,
        externalEuint256 extLimit,
        bytes calldata limitProof
    ) external returns (uint256 orderId) {
        euint16 side = Nox.fromExternal(extSide, sideProof);
        euint256 size = Nox.fromExternal(extSize, sizeProof);
        euint256 limit = Nox.fromExternal(extLimit, limitProof);

        // Persistent access for this contract first — `fromExternal` only granted transient
        // rights, and proposeMatch needs to compute on these handles in a later transaction.
        Nox.allowThis(side);
        Nox.allowThis(size);
        Nox.allowThis(limit);

        // The desk, and only the desk, can decrypt its own order.
        Nox.addViewer(side, msg.sender);
        Nox.addViewer(size, msg.sender);
        Nox.addViewer(limit, msg.sender);

        orderId = ++orderCount;
        _orders[orderId] = Order({
            desk: msg.sender,
            side: side,
            size: size,
            limit: limit,
            submittedAt: uint64(block.timestamp),
            status: Status.Open
        });

        emit OrderSubmitted(orderId, msg.sender);
    }

    /**
     * @notice Withdraw an order. Its terms are never decrypted, so a cancelled order's price
     *         and size stay secret permanently — there is no expiry that leaks them later.
     */
    function cancelOrder(uint256 orderId) external {
        Order storage o = _orders[orderId];
        require(o.desk == msg.sender, NotOrderOwner(orderId));
        require(o.status == Status.Open, OrderNotOpen(orderId));
        o.status = Status.Cancelled;
        emit OrderCancelled(orderId, msg.sender);
    }

    /**
     * @notice Grant a regulator read access to one order's encrypted terms.
     * @dev Selective disclosure: the grant is per-order and per-address, recorded on-chain and
     *      independently checkable via `Nox.isViewer`. Nothing becomes public.
     */
    function grantAuditor(uint256 orderId, address auditor) external {
        Order storage o = _orders[orderId];
        require(o.desk == msg.sender, NotOrderOwner(orderId));

        Nox.addViewer(o.side, auditor);
        Nox.addViewer(o.size, auditor);
        Nox.addViewer(o.limit, auditor);

        emit AuditorGranted(orderId, auditor);
    }

    // ============ Matching ============

    /**
     * @notice Ask the TEE whether two orders cross. Callable by anyone.
     *
     * @dev This is the blind-matcher entry point. The caller chooses a pair of order *ids* and
     *      learns nothing: it cannot read the terms, and the boolean result stays encrypted
     *      until `finalizeMatch`.
     *
     *      The crossing predicate is evaluated without branching. There is no encrypted boolean
     *      AND in the Nox primitive set, so the three conditions are folded into a 0/1 selector
     *      and multiplied through — which has the same effect and keeps every path identical:
     *
     *        flag      = (bid.limit >= ask.limit) AND (bid is a bid) AND (ask is an ask)
     *        fillSize  = flag * min(bid.size, ask.size)
     *        fillPrice = flag * (ask.limit | midpoint)
     *
     *      A non-crossing pair therefore produces fillSize = fillPrice = 0 rather than a revert,
     *      and the failure discloses nothing about which of the three conditions failed.
     */
    function proposeMatch(uint256 bidId, uint256 askId) external returns (bytes32 matchId) {
        require(bidId != askId, SameOrder());

        Order storage bid = _orders[bidId];
        Order storage ask = _orders[askId];
        require(bid.status == Status.Open, OrderNotOpen(bidId));
        require(ask.status == Status.Open, OrderNotOpen(askId));

        _ensureConstants();

        // --- the crossing predicate, folded into a 0/1 selector ---
        ebool priceCrosses = Nox.ge(bid.limit, ask.limit);
        ebool bidIsBid = Nox.eq(bid.side, _eSideBid);
        ebool askIsAsk = Nox.eq(ask.side, _eSideAsk);

        euint256 flag = Nox.select(priceCrosses, _eOne, _eZero);
        flag = Nox.select(bidIsBid, flag, _eZero);
        flag = Nox.select(askIsAsk, flag, _eZero);

        ebool crossed = Nox.eq(flag, _eOne);

        // --- fill terms ---
        euint256 minSize = Nox.select(Nox.le(bid.size, ask.size), bid.size, ask.size);
        euint256 fillSize = Nox.mul(flag, minSize);

        euint256 refPrice = pricingRule == PricingRule.Midpoint
            ? Nox.div(Nox.add(bid.limit, ask.limit), _eTwo)
            : ask.limit;
        euint256 fillPrice = Nox.mul(flag, refPrice);

        // Persist compute rights so `finalizeMatch` can verify proofs in a later transaction,
        // then open exactly three values — and no others — to public decryption.
        Nox.allowThis(crossed);
        Nox.allowThis(fillSize);
        Nox.allowThis(fillPrice);
        Nox.allowPublicDecryption(crossed);
        Nox.allowPublicDecryption(fillSize);
        Nox.allowPublicDecryption(fillPrice);

        matchId = keccak256(
            abi.encode(block.chainid, address(this), bidId, askId, ++_matchNonce)
        );

        _matches[matchId] = Match({
            bidId: bidId,
            askId: askId,
            crossed: crossed,
            fillSize: fillSize,
            fillPrice: fillPrice,
            plainFillSize: 0,
            plainFillPrice: 0,
            proposedAt: uint64(block.timestamp),
            finalized: false,
            approved: false,
            consumed: false
        });
        _matchList.push(matchId);

        // Lock both orders so the matcher cannot double-propose them concurrently.
        bid.status = Status.Pending;
        ask.status = Status.Pending;

        emit MatchProposed(matchId, bidId, askId);
    }

    /**
     * @notice Reveal the outcome of a proposal by submitting the KMS decryption proofs.
     *
     * @dev The proofs come from `HandleClient.publicDecrypt()` off-chain. `Nox.publicDecrypt`
     *      re-verifies each one against the KMS signature on-chain, so the caller cannot lie
     *      about the values — a keeper that submits a forged fill price simply reverts.
     *
     *      If the pair did not cross, both orders go back to Open and nothing is written. The
     *      only thing an observer learns is that *some* proposal did not cross.
     */
    function finalizeMatch(
        bytes32 matchId,
        bytes calldata crossedProof,
        bytes calldata fillSizeProof,
        bytes calldata fillPriceProof
    ) external {
        Match storage m = _matches[matchId];
        require(m.proposedAt != 0, UnknownMatch(matchId));
        require(!m.finalized, MatchAlreadyFinalized(matchId));

        m.finalized = true;

        if (!Nox.publicDecrypt(m.crossed, crossedProof)) {
            _orders[m.bidId].status = Status.Open;
            _orders[m.askId].status = Status.Open;
            emit MatchRejected(matchId);
            return;
        }

        uint256 fillSize = Nox.publicDecrypt(m.fillSize, fillSizeProof);
        uint256 fillPrice = Nox.publicDecrypt(m.fillPrice, fillPriceProof);

        m.plainFillSize = fillSize;
        m.plainFillPrice = fillPrice;
        m.approved = true;

        _orders[m.bidId].status = Status.Matched;
        _orders[m.askId].status = Status.Matched;

        emit MatchApproved(matchId, fillSize, fillPrice);
    }

    // ============ Settlement hooks (Seaport zone) ============

    /// @inheritdoc IZerkBook
    function isApprovedMatch(bytes32 matchId) external view returns (bool) {
        Match storage m = _matches[matchId];
        return m.approved && !m.consumed;
    }

    /// @inheritdoc IZerkBook
    function fillTerms(
        bytes32 matchId
    ) external view returns (uint256 fillSize, uint256 fillPrice, uint256 notional) {
        Match storage m = _matches[matchId];
        require(m.approved, MatchNotApproved(matchId));
        fillSize = m.plainFillSize;
        fillPrice = m.plainFillPrice;
        notional = (fillSize * fillPrice) / baseUnit;
    }

    /// @inheritdoc IZerkBook
    function consumeMatch(bytes32 matchId) external onlyZone {
        Match storage m = _matches[matchId];
        require(m.approved && !m.consumed, MatchNotApproved(matchId));
        m.consumed = true;
        _orders[m.bidId].status = Status.Settled;
        _orders[m.askId].status = Status.Settled;
        emit MatchSettled(matchId);
    }

    // ============ Views ============

    function getOrder(
        uint256 orderId
    )
        external
        view
        returns (
            address desk,
            bytes32 hSide,
            bytes32 hSize,
            bytes32 hLimit,
            uint64 submittedAt,
            Status status
        )
    {
        Order storage o = _orders[orderId];
        return (
            o.desk,
            euint16.unwrap(o.side),
            euint256.unwrap(o.size),
            euint256.unwrap(o.limit),
            o.submittedAt,
            o.status
        );
    }

    function getMatch(
        bytes32 matchId
    )
        external
        view
        returns (
            uint256 bidId,
            uint256 askId,
            bytes32 hCrossed,
            bytes32 hFillSize,
            bytes32 hFillPrice,
            uint256 plainFillSize,
            uint256 plainFillPrice,
            uint64 proposedAt,
            bool finalized,
            bool approved,
            bool consumed
        )
    {
        Match storage m = _matches[matchId];
        return (
            m.bidId,
            m.askId,
            ebool.unwrap(m.crossed),
            euint256.unwrap(m.fillSize),
            euint256.unwrap(m.fillPrice),
            m.plainFillSize,
            m.plainFillPrice,
            m.proposedAt,
            m.finalized,
            m.approved,
            m.consumed
        );
    }

    function matchCount() external view returns (uint256) {
        return _matchList.length;
    }

    function matchIdAt(uint256 index) external view returns (bytes32) {
        return _matchList[index];
    }

    /// @notice Order ids currently resting and eligible for a proposal. Used by the matcher.
    function openOrderIds() external view returns (uint256[] memory ids) {
        uint256 n;
        uint256 total = orderCount;
        for (uint256 i = 1; i <= total; ++i) {
            if (_orders[i].status == Status.Open) ++n;
        }
        ids = new uint256[](n);
        uint256 j;
        for (uint256 i = 1; i <= total; ++i) {
            if (_orders[i].status == Status.Open) ids[j++] = i;
        }
    }

    /// @notice Whether `account` may decrypt every leg of an order. Drives the auditor panel.
    function canView(uint256 orderId, address account) external view returns (bool) {
        Order storage o = _orders[orderId];
        return
            Nox.isViewer(o.side, account) &&
            Nox.isViewer(o.size, account) &&
            Nox.isViewer(o.limit, account);
    }

    // ============ Internal ============

    /**
     * @dev Materialises the trivially-encrypted constants the matcher needs. These are public
     *      handles wrapping 0, 1, 2 and the two side markers — none of them is secret, they
     *      exist only because Nox primitives operate on handles, not literals.
     */
    function _ensureConstants() internal {
        if (_constantsReady) return;
        _eZero = Nox.toEuint256(0);
        _eOne = Nox.toEuint256(1);
        _eTwo = Nox.toEuint256(2);
        _eSideBid = Nox.toEuint16(SIDE_BID);
        _eSideAsk = Nox.toEuint16(SIDE_ASK);
        _constantsReady = true;
    }
}
