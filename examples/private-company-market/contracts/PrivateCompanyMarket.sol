// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PrivateCompanyMarket
/// @notice Internal, member-only prediction market with private positions and public totals.
/// @dev Designed for Prividium: use storage reads, no events, and keep logic simple.
contract PrivateCompanyMarket {
    /// @dev Market lifecycle tracked on-chain to keep UI data storage-based.
    enum MarketStatus {
        Open,
        Closed,
        Resolved,
        Cancelled
    }

    /// @dev Outcome is unset until a resolver settles the market.
    enum Outcome {
        Unset,
        Yes,
        No
    }

    struct Market {
        uint256 id;
        string question;
        uint64 closeTime;
        MarketStatus status;
        uint256 totalYes;
        uint256 totalNo;
        Outcome outcome;
    }

    struct MarketView {
        uint256 id;
        string question;
        uint64 closeTime;
        MarketStatus status;
        uint256 totalYes;
        uint256 totalNo;
        Outcome outcome;
    }

    address public owner;

    // Allowlists are stored on-chain (private where possible).
    mapping(address => bool) private members;
    mapping(address => bool) private creators;
    mapping(address => bool) private resolvers;

    // Per-market storage.
    Market[] private markets;

    // Private per-user positions.
    mapping(uint256 => mapping(address => uint256)) private yesAmount;
    mapping(uint256 => mapping(address => uint256)) private noAmount;
    mapping(uint256 => mapping(address => bool)) private claimed;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyMember() {
        require(members[msg.sender], "Members only");
        _;
    }

    modifier onlyCreator() {
        require(creators[msg.sender], "Creators only");
        _;
    }

    modifier onlyResolver() {
        require(resolvers[msg.sender], "Resolvers only");
        _;
    }

    constructor(
        address[] memory initialMembers,
        address[] memory initialCreators,
        address[] memory initialResolvers
    ) {
        owner = msg.sender;
        // Owner is always part of every allowlist for easy setup.
        members[msg.sender] = true;
        creators[msg.sender] = true;
        resolvers[msg.sender] = true;

        _setAllowlist(initialMembers, members);
        _setAllowlist(initialCreators, creators);
        _setAllowlist(initialResolvers, resolvers);
    }

    function _setAllowlist(address[] memory list, mapping(address => bool) storage allowlist) private {
        for (uint256 i = 0; i < list.length; i++) {
            allowlist[list[i]] = true;
        }
    }

    // ---------------------------------------------------------------------
    // Access control helpers (private where possible).
    // These return data for the caller's own address only.
    // ---------------------------------------------------------------------

    function isMember(address user) external view returns (bool) {
        require(user == msg.sender, "Self lookup only");
        return members[user];
    }

    function isCreator(address user) external view returns (bool) {
        require(user == msg.sender, "Self lookup only");
        return creators[user];
    }

    function isResolver(address user) external view returns (bool) {
        require(user == msg.sender, "Self lookup only");
        return resolvers[user];
    }

    function addMember(address user) external onlyOwner {
        members[user] = true;
    }

    function removeMember(address user) external onlyOwner {
        members[user] = false;
    }

    function addCreator(address user) external onlyOwner {
        creators[user] = true;
    }

    function removeCreator(address user) external onlyOwner {
        creators[user] = false;
    }

    function addResolver(address user) external onlyOwner {
        resolvers[user] = true;
    }

    function removeResolver(address user) external onlyOwner {
        resolvers[user] = false;
    }

    // ---------------------------------------------------------------------
    // Market listing (storage-based views).
    // ---------------------------------------------------------------------

    function getMarketsCount() external view onlyMember returns (uint256) {
        return markets.length;
    }

    /// @notice Returns recent markets in reverse chronological order.
    /// @param limit Max number of markets to return.
    /// @param offset Number of newest markets to skip (cursor).
    function getRecentMarkets(uint256 limit, uint256 offset) external view onlyMember returns (MarketView[] memory) {
        uint256 total = markets.length;
        if (offset >= total || limit == 0) {
            return new MarketView[](0);
        }

        uint256 available = total - offset;
        uint256 count = limit < available ? limit : available;
        MarketView[] memory result = new MarketView[](count);

        for (uint256 i = 0; i < count; i++) {
            uint256 marketId = total - offset - 1 - i;
            Market storage market = markets[marketId];
            result[i] = _toView(market);
        }

        return result;
    }

    function getMarket(uint256 marketId) external view onlyMember returns (MarketView memory) {
        require(marketId < markets.length, "Market not found");
        Market storage market = markets[marketId];
        return _toView(market);
    }

    function _toView(Market storage market) private view returns (MarketView memory) {
        MarketStatus status = market.status;
        if (status == MarketStatus.Open && block.timestamp >= market.closeTime) {
            status = MarketStatus.Closed;
        }

        return
            MarketView({
                id: market.id,
                question: market.question,
                closeTime: market.closeTime,
                status: status,
                totalYes: market.totalYes,
                totalNo: market.totalNo,
                outcome: market.outcome
            });
    }

    // ---------------------------------------------------------------------
    // Market creation.
    // ---------------------------------------------------------------------

    function createMarket(string calldata question, uint64 closeTime) external onlyCreator returns (uint256 marketId) {
        require(closeTime > block.timestamp, "Close time must be in the future");
        marketId = markets.length;
        markets.push(
            Market({
                id: marketId,
                question: question,
                closeTime: closeTime,
                status: MarketStatus.Open,
                totalYes: 0,
                totalNo: 0,
                outcome: Outcome.Unset
            })
        );
    }

    // ---------------------------------------------------------------------
    // Betting.
    // ---------------------------------------------------------------------

    function betYes(uint256 marketId) external payable onlyMember {
        _placeBet(marketId, true);
    }

    function betNo(uint256 marketId) external payable onlyMember {
        _placeBet(marketId, false);
    }

    function _placeBet(uint256 marketId, bool yesSide) private {
        require(marketId < markets.length, "Market not found");
        require(msg.value > 0, "Bet must be > 0");

        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Open, "Market not open");
        require(block.timestamp < market.closeTime, "Market closed");

        if (yesSide) {
            yesAmount[marketId][msg.sender] += msg.value;
            market.totalYes += msg.value;
        } else {
            noAmount[marketId][msg.sender] += msg.value;
            market.totalNo += msg.value;
        }
    }

    // ---------------------------------------------------------------------
    // Private user views.
    // ---------------------------------------------------------------------

    function getMyPosition(uint256 marketId) external view onlyMember returns (uint256, uint256) {
        require(marketId < markets.length, "Market not found");
        return (yesAmount[marketId][msg.sender], noAmount[marketId][msg.sender]);
    }

    function getMyClaimStatus(uint256 marketId) external view onlyMember returns (bool) {
        require(marketId < markets.length, "Market not found");
        return claimed[marketId][msg.sender];
    }

    function quotePayout(uint256 marketId, address user) external view onlyMember returns (uint256) {
        require(user == msg.sender, "Self lookup only");
        require(marketId < markets.length, "Market not found");
        Market storage market = markets[marketId];

        if (market.status == MarketStatus.Cancelled) {
            return yesAmount[marketId][user] + noAmount[marketId][user];
        }

        if (market.status != MarketStatus.Resolved) {
            return 0;
        }

        uint256 pool = market.totalYes + market.totalNo;
        if (market.outcome == Outcome.Yes && market.totalYes > 0) {
            return (yesAmount[marketId][user] * pool) / market.totalYes;
        }
        if (market.outcome == Outcome.No && market.totalNo > 0) {
            return (noAmount[marketId][user] * pool) / market.totalNo;
        }
        return 0;
    }

    // ---------------------------------------------------------------------
    // Resolution.
    // ---------------------------------------------------------------------

    function resolve(uint256 marketId, bool outcomeYes) external onlyResolver {
        require(marketId < markets.length, "Market not found");
        Market storage market = markets[marketId];
        require(block.timestamp >= market.closeTime, "Market still open");
        require(market.status != MarketStatus.Resolved, "Already resolved");
        require(market.status != MarketStatus.Cancelled, "Market cancelled");

        if (outcomeYes) {
            require(market.totalYes > 0, "No YES bets");
            market.outcome = Outcome.Yes;
        } else {
            require(market.totalNo > 0, "No NO bets");
            market.outcome = Outcome.No;
        }

        market.status = MarketStatus.Resolved;
    }

    function cancel(uint256 marketId) external onlyResolver {
        require(marketId < markets.length, "Market not found");
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Open || market.status == MarketStatus.Closed, "Not cancellable");
        market.status = MarketStatus.Cancelled;
        market.outcome = Outcome.Unset;
    }

    // ---------------------------------------------------------------------
    // Claiming.
    // ---------------------------------------------------------------------

    function claim(uint256 marketId) external onlyMember {
        require(marketId < markets.length, "Market not found");
        Market storage market = markets[marketId];
        require(market.status == MarketStatus.Resolved || market.status == MarketStatus.Cancelled, "Not claimable");
        require(!claimed[marketId][msg.sender], "Already claimed");

        uint256 refund = yesAmount[marketId][msg.sender] + noAmount[marketId][msg.sender];
        require(refund > 0, "No position");

        claimed[marketId][msg.sender] = true;

        uint256 payout = refund;
        if (market.status == MarketStatus.Resolved) {
            payout = 0;
            uint256 pool = market.totalYes + market.totalNo;
            if (market.outcome == Outcome.Yes && market.totalYes > 0) {
                payout = (yesAmount[marketId][msg.sender] * pool) / market.totalYes;
            } else if (market.outcome == Outcome.No && market.totalNo > 0) {
                payout = (noAmount[marketId][msg.sender] * pool) / market.totalNo;
            }
        }

        if (payout > 0) {
            (bool sent, ) = payable(msg.sender).call{value: payout}('');
            require(sent, "Payout failed");
        }
    }
}
