// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ZerkRWA
 * @notice A permissioned ERC-20 standing in for a tokenized T-bill. ERC-3643-lite: a single
 *         allowlist enforced in `_update`, which is enough to make the argument that matters —
 *         a permissioned asset cannot be dropped into a public AMM, so its holders have no
 *         secondary venue unless someone builds one.
 *
 * @dev Seaport moves tokens from its own address during fulfilment, so **Seaport must be
 *      allowlisted** or every fill reverts. See docs/DEPLOYMENT.md.
 */
contract ZerkRWA is ERC20, Ownable {
    mapping(address account => bool allowed) public permitted;

    event Permitted(address indexed account, bool status);

    error NotPermitted(address account);

    constructor(
        string memory name_,
        string memory symbol_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        permitted[owner_] = true;
        emit Permitted(owner_, true);
    }

    function setPermitted(address account, bool status) public onlyOwner {
        permitted[account] = status;
        emit Permitted(account, status);
    }

    function setPermittedBatch(address[] calldata accounts, bool status) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; ++i) {
            setPermitted(accounts[i], status);
        }
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        // Mint (from == 0) and burn (to == 0) legs skip the check; every real transfer leg
        // — including the ones Seaport performs on behalf of a fulfiller — does not.
        if (from != address(0)) require(permitted[from], NotPermitted(from));
        if (to != address(0)) require(permitted[to], NotPermitted(to));
        super._update(from, to, value);
    }
}
