// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ZerkUSD
 * @notice The cash leg of the crossing: a plain, unpermissioned, 6-decimal ERC-20.
 *
 * @dev Why this exists rather than Circle's Sepolia USDC. The demo crosses institutional size —
 *      400,000 tT-BILL at a ~99 limit is a notional near 40,000,000. Circle's faucet dispenses
 *      10 USDC an hour, so the canonical token cannot fund a trade at the scale the protocol is
 *      arguing for. Both are valueless testnet ERC-20s; only one can be minted to demo size.
 *
 *      Deliberately *not* permissioned. Only the asset leg (ZerkRWA) carries an allowlist — that
 *      asymmetry is the point: cash moves freely, the security does not.
 */
contract ZerkUSD is ERC20, Ownable {
    constructor(address owner_) ERC20("Zerk Test USD", "tUSDC") Ownable(owner_) {}

    /// @dev USDC is 6-decimal. Matching it keeps every price on the wire in the same units the
    ///      real instrument would use, so nothing downstream needs a scaling special case.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
