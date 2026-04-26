// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./KNTTokenomics.sol";

contract KNT is ERC20, ERC20Burnable, Ownable {
    uint256 public totalBurned;

    constructor(address initialOwner) ERC20("Knight Token", "KNT") Ownable(initialOwner) {
        _mint(initialOwner, KNTTokenomics.TOTAL_SUPPLY);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (to == address(0) && from != address(0)) {
            totalBurned += value;
        }
        super._update(from, to, value);
    }
}
