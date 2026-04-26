// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SeerTypes.sol";
import "../SeerTokenomics.sol";

interface IMinerNodeLibClaim {
    function removeNodeLot(address _node, uint256 _lotId) external;
}

/**
 * @title LibSeerClaim
 * @notice 提取 SeerProtocol 中最大的挖矿领取函数到外部库, 降低主合约字节码大小.
 */
library LibSeerClaim {
    event VaultBExhausted(address indexed user, uint256 minerId);

    /**
     * @dev 执行单台矿机的线性释放结算.
     * @return withdrawPart 领取至提现钱包的 SEER (A仓全额 + B仓提现份额)
     * @return bettingPart  划入投注钱包的 SEER (B仓投注份额)
     * @return bRewardPart  B仓本次释放的 SEER 总额 (用于分配动态奖励)
     */
    function claimMinerAtIndex(
        mapping(address => SeerTypes.MinerInfo[]) storage userMiners,
        mapping(address => mapping(uint256 => uint256)) storage minerNodeLotIds,
        address minerNodeAddr,
        uint256 seerPriceUsdt,
        address _user,
        uint256 index
    ) external returns (
        uint256 withdrawPart,
        uint256 bettingPart,
        uint256 bRewardPart,
        bool    deactivated
    ) {
        SeerTypes.MinerInfo storage miner = userMiners[_user][index];

        if (!miner.active) return (0, 0, 0, false);

        uint256 elapsed = block.timestamp - miner.lastClaimTime;
        if (elapsed == 0) return (0, 0, 0, false);

        uint256 cycleDays = miner.cycleDays;
        if (cycleDays == 0) return (0, 0, 0, false);

        uint256 elapsedDays = elapsed / SeerTokenomics.CYCLE_DAY_SECONDS;
        if (elapsedDays == 0) return (0, 0, 0, false);
        if (elapsedDays > cycleDays) elapsedDays = cycleDays;

        uint256 aRemainingDays = cycleDays > miner.aReleasedDays ? cycleDays - miner.aReleasedDays : 0;
        uint256 bRemainingDays = cycleDays > miner.bReleasedDays ? cycleDays - miner.bReleasedDays : 0;

        uint256 aDaysToRelease = elapsedDays < aRemainingDays ? elapsedDays : aRemainingDays;
        uint256 aReleaseUsdt = _calcLinearRelease(
            miner.vaultA_initialUsdt,
            miner.vaultA_usdt,
            miner.aReleasedDays,
            aDaysToRelease,
            cycleDays
        );

        bool bPaused = false;
        if (!miner.isAutoGifted && miner.vaultB_usdt > 0) {
            uint256 aRemaining = miner.vaultA_usdt - aReleaseUsdt;
            bPaused = (aRemaining * SeerTokenomics.BASIS_POINTS) <
                      (miner.vaultB_usdt * SeerTokenomics.VAULT_A_MIN_RATIO_OF_B_BP);
        }

        uint256 bReleaseUsdt = 0;
        if (!bPaused && miner.vaultB_usdt > 0) {
            uint256 bDaysToRelease = elapsedDays < bRemainingDays ? elapsedDays : bRemainingDays;
            bReleaseUsdt = _calcLinearRelease(
                miner.vaultB_initialUsdt,
                miner.vaultB_usdt,
                miner.bReleasedDays,
                bDaysToRelease,
                cycleDays
            );
            miner.bReleasedDays += bDaysToRelease;
        }

        if (aDaysToRelease > 0 && miner.vaultA_initialUsdt > 0) {
            miner.aReleasedDays += aDaysToRelease;
        }

        if (aReleaseUsdt == 0 && bReleaseUsdt == 0) return (0, 0, 0, false);

        miner.vaultA_usdt -= aReleaseUsdt;
        miner.vaultB_usdt -= bReleaseUsdt;
        miner.lastClaimTime = block.timestamp;

        if (miner.vaultB_usdt == 0) {
            miner.active = false;
            deactivated = true;

            if (miner.tier != SeerTypes.MinerTier.Basic && !miner.isAutoGifted && minerNodeAddr != address(0)) {
                uint256 lotId = minerNodeLotIds[_user][index];
                if (lotId > 0) {
                    IMinerNodeLibClaim(minerNodeAddr).removeNodeLot(_user, lotId);
                }
            }

            emit VaultBExhausted(_user, index);
        }

        uint256 aSeer = aReleaseUsdt * (10 ** SeerTokenomics.SEER_DECIMALS) / seerPriceUsdt;
        uint256 bSeer = bReleaseUsdt * (10 ** SeerTokenomics.SEER_DECIMALS) / seerPriceUsdt;

        uint256 bWithdraw = (bSeer * SeerTokenomics.VAULT_B_WITHDRAW_SHARE_BP) / SeerTokenomics.BASIS_POINTS;
        bettingPart = bSeer - bWithdraw;
        withdrawPart = aSeer + bWithdraw;
        bRewardPart = bSeer;

        miner.totalClaimed += aSeer + bSeer;
    }

    function _calcLinearRelease(
        uint256 initialUsdt,
        uint256 remainingUsdt,
        uint256 releasedDays,
        uint256 daysToRelease,
        uint256 cycleDays
    ) internal pure returns (uint256 releaseUsdt) {
        if (initialUsdt == 0 || remainingUsdt == 0 || daysToRelease == 0 || cycleDays == 0) return 0;

        uint256 newReleasedDays = releasedDays + daysToRelease;
        if (newReleasedDays >= cycleDays) return remainingUsdt;

        uint256 cumulativeTarget = (initialUsdt * newReleasedDays) / cycleDays;
        uint256 alreadyReleased = initialUsdt - remainingUsdt;
        if (cumulativeTarget <= alreadyReleased) return 0;

        releaseUsdt = cumulativeTarget - alreadyReleased;
        if (releaseUsdt > remainingUsdt) releaseUsdt = remainingUsdt;
    }

    /// @notice 只读预估单台矿机可领取的SEER (与 claimMinerAtIndex 逻辑保持一致)
    function getPendingRewardByMiner(
        mapping(address => SeerTypes.MinerInfo[]) storage userMiners,
        uint256 seerPriceUsdt,
        address _user,
        uint256 index
    ) external view returns (
        uint256 totalReward,
        uint256 toWithdraw,
        uint256 toBetting,
        bool bPaused
    ) {
        SeerTypes.MinerInfo storage miner = userMiners[_user][index];
        if (!miner.active) return (0, 0, 0, false);

        uint256 elapsed = block.timestamp - miner.lastClaimTime;
        if (elapsed == 0 || miner.cycleDays == 0) return (0, 0, 0, false);

        uint256 elapsedDays = elapsed / SeerTokenomics.CYCLE_DAY_SECONDS;
        if (elapsedDays == 0) return (0, 0, 0, false);
        if (elapsedDays > miner.cycleDays) elapsedDays = miner.cycleDays;

        uint256 aRemainingDays = miner.cycleDays > miner.aReleasedDays ? miner.cycleDays - miner.aReleasedDays : 0;
        uint256 bRemainingDays = miner.cycleDays > miner.bReleasedDays ? miner.cycleDays - miner.bReleasedDays : 0;

        uint256 aDaysToRelease = elapsedDays < aRemainingDays ? elapsedDays : aRemainingDays;
        uint256 aRelease = _calcLinearRelease(
            miner.vaultA_initialUsdt,
            miner.vaultA_usdt,
            miner.aReleasedDays,
            aDaysToRelease,
            miner.cycleDays
        );

        if (!miner.isAutoGifted && miner.vaultB_usdt > 0) {
            uint256 aRemaining = miner.vaultA_usdt - aRelease;
            bPaused = (aRemaining * SeerTokenomics.BASIS_POINTS) <
                      (miner.vaultB_usdt * SeerTokenomics.VAULT_A_MIN_RATIO_OF_B_BP);
        }

        uint256 bRelease = 0;
        if (!bPaused && miner.vaultB_usdt > 0) {
            uint256 bDaysToRelease = elapsedDays < bRemainingDays ? elapsedDays : bRemainingDays;
            bRelease = _calcLinearRelease(
                miner.vaultB_initialUsdt,
                miner.vaultB_usdt,
                miner.bReleasedDays,
                bDaysToRelease,
                miner.cycleDays
            );
        }

        uint256 aSeer = seerPriceUsdt == 0 ? 0 : aRelease * 1e18 / seerPriceUsdt;
        uint256 bSeer = seerPriceUsdt == 0 ? 0 : bRelease * 1e18 / seerPriceUsdt;

        uint256 bWithdraw = (bSeer * SeerTokenomics.VAULT_B_WITHDRAW_SHARE_BP) / SeerTokenomics.BASIS_POINTS;
        toBetting = bSeer - bWithdraw;
        toWithdraw = aSeer + bWithdraw;
        totalReward = toWithdraw + toBetting;
    }
}
