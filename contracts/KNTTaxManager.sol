// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./KNTTokenomics.sol";

interface IKNTTaxBurnable is IERC20 {
    function burn(uint256 amount) external;
}

contract KNTTaxManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IKNTTaxBurnable;

    struct CostBasis {
        uint256 boughtKnt;
        uint256 spentUsdt;
    }

    IKNTTaxBurnable public immutable knt;
    address public foundationWallet;
    address public burnQueueRewardPool;
    address public dexSettlementWallet;

    mapping(address => bool) public buyRecorders;
    mapping(address => CostBasis) public costBasisOf;

    event BuyRecorded(address indexed account, uint256 kntAmount, uint256 usdtSpent);
    event SellSettled(
        address indexed account,
        uint256 grossAmount,
        uint256 netAmount,
        uint256 sellTax,
        uint256 profitTax,
        uint256 dumpTax
    );
    event RecorderUpdated(address indexed recorder, bool enabled);
    event WalletsUpdated(address foundationWallet, address burnQueueRewardPool, address dexSettlementWallet);

    constructor(
        address knt_,
        address foundationWallet_,
        address burnQueueRewardPool_,
        address dexSettlementWallet_,
        address initialOwner
    ) Ownable(initialOwner) {
        require(knt_ != address(0), "KNT required");
        knt = IKNTTaxBurnable(knt_);
        _setWallets(foundationWallet_, burnQueueRewardPool_, dexSettlementWallet_);
    }

    modifier onlyRecorder() {
        require(buyRecorders[msg.sender] || msg.sender == owner(), "Not recorder");
        _;
    }

    function recordBuy(address account, uint256 kntAmount, uint256 usdtSpent) external onlyRecorder {
        require(account != address(0), "Zero address");
        require(kntAmount > 0 && usdtSpent > 0, "Zero amount");
        costBasisOf[account].boughtKnt += kntAmount;
        costBasisOf[account].spentUsdt += usdtSpent;
        emit BuyRecorded(account, kntAmount, usdtSpent);
    }

    function settleSell(
        uint256 amount,
        uint256 currentValueUsdt,
        uint256 priceNowUsdt,
        uint256 price24hAgoUsdt
    ) external nonReentrant returns (uint256 netAmount) {
        require(amount > 0 && currentValueUsdt > 0, "Zero amount");
        knt.safeTransferFrom(msg.sender, address(this), amount);

        uint256 sellTax = (amount * KNTTokenomics.SELL_TAX_BP) / KNTTokenomics.BASIS_POINTS;
        uint256 profitTax = _profitTax(msg.sender, amount, currentValueUsdt);
        uint256 dumpTax = _dumpTax(amount, priceNowUsdt, price24hAgoUsdt);
        uint256 totalTax = sellTax + profitTax + dumpTax;
        require(totalTax <= amount, "Tax exceeds amount");

        _distributeSellTax(sellTax);
        _distributeProfitTax(profitTax);
        _distributeDumpTax(dumpTax);

        netAmount = amount - totalTax;
        if (netAmount > 0) {
            knt.safeTransfer(dexSettlementWallet, netAmount);
        }

        _consumeCostBasis(msg.sender, amount, currentValueUsdt);

        emit SellSettled(msg.sender, amount, netAmount, sellTax, profitTax, dumpTax);
    }

    function setRecorder(address recorder, bool enabled) external onlyOwner {
        buyRecorders[recorder] = enabled;
        emit RecorderUpdated(recorder, enabled);
    }

    function setWallets(address foundationWallet_, address burnQueueRewardPool_, address dexSettlementWallet_) external onlyOwner {
        _setWallets(foundationWallet_, burnQueueRewardPool_, dexSettlementWallet_);
    }

    function _profitTax(address account, uint256 amount, uint256 currentValueUsdt) internal view returns (uint256) {
        CostBasis storage basis = costBasisOf[account];
        if (basis.boughtKnt == 0 || basis.spentUsdt == 0) return 0;
        uint256 proportionalCost = (basis.spentUsdt * amount) / basis.boughtKnt;
        if (currentValueUsdt <= proportionalCost) return 0;
        uint256 profitUsdt = currentValueUsdt - proportionalCost;
        uint256 profitTaxUsdt = (profitUsdt * KNTTokenomics.PROFIT_TAX_BP) / KNTTokenomics.BASIS_POINTS;
        return (amount * profitTaxUsdt) / currentValueUsdt;
    }

    function _dumpTax(uint256 amount, uint256 priceNowUsdt, uint256 price24hAgoUsdt) internal pure returns (uint256) {
        if (priceNowUsdt == 0 || price24hAgoUsdt == 0) return 0;
        if (priceNowUsdt * KNTTokenomics.BASIS_POINTS <= price24hAgoUsdt * (KNTTokenomics.BASIS_POINTS - KNTTokenomics.DUMP_DROP_20_BP)) {
            return (amount * KNTTokenomics.DUMP_TAX_20_BP) / KNTTokenomics.BASIS_POINTS;
        }
        if (priceNowUsdt * KNTTokenomics.BASIS_POINTS <= price24hAgoUsdt * (KNTTokenomics.BASIS_POINTS - KNTTokenomics.DUMP_DROP_10_BP)) {
            return (amount * KNTTokenomics.DUMP_TAX_10_BP) / KNTTokenomics.BASIS_POINTS;
        }
        return 0;
    }

    function _distributeSellTax(uint256 amount) internal {
        if (amount == 0) return;
        uint256 toQueue = (amount * KNTTokenomics.SELL_TAX_QUEUE_BP) / KNTTokenomics.SELL_TAX_BP;
        uint256 toFoundation = amount - toQueue;
        if (toQueue > 0) knt.safeTransfer(burnQueueRewardPool, toQueue);
        if (toFoundation > 0) knt.safeTransfer(foundationWallet, toFoundation);
    }

    function _distributeProfitTax(uint256 amount) internal {
        if (amount == 0) return;
        uint256 toQueue = (amount * KNTTokenomics.PROFIT_TAX_QUEUE_BP) / KNTTokenomics.PROFIT_TAX_BP;
        uint256 toBurn = (amount * KNTTokenomics.PROFIT_TAX_BURN_BP) / KNTTokenomics.PROFIT_TAX_BP;
        uint256 toFoundation = amount - toQueue - toBurn;
        if (toQueue > 0) knt.safeTransfer(burnQueueRewardPool, toQueue);
        if (toBurn > 0) knt.burn(toBurn);
        if (toFoundation > 0) knt.safeTransfer(foundationWallet, toFoundation);
    }

    function _distributeDumpTax(uint256 amount) internal {
        if (amount == 0) return;
        uint256 toBurn = amount / 2;
        uint256 toQueue = amount - toBurn;
        if (toBurn > 0) knt.burn(toBurn);
        if (toQueue > 0) knt.safeTransfer(burnQueueRewardPool, toQueue);
    }

    function _consumeCostBasis(address account, uint256 amount, uint256 currentValueUsdt) internal {
        CostBasis storage basis = costBasisOf[account];
        if (basis.boughtKnt == 0) return;
        basis.boughtKnt = basis.boughtKnt > amount ? basis.boughtKnt - amount : 0;
        basis.spentUsdt = basis.spentUsdt > currentValueUsdt ? basis.spentUsdt - currentValueUsdt : 0;
    }

    function _setWallets(address foundationWallet_, address burnQueueRewardPool_, address dexSettlementWallet_) internal {
        require(foundationWallet_ != address(0), "Foundation required");
        require(burnQueueRewardPool_ != address(0), "Queue required");
        require(dexSettlementWallet_ != address(0), "DEX required");
        foundationWallet = foundationWallet_;
        burnQueueRewardPool = burnQueueRewardPool_;
        dexSettlementWallet = dexSettlementWallet_;
        emit WalletsUpdated(foundationWallet_, burnQueueRewardPool_, dexSettlementWallet_);
    }
}
