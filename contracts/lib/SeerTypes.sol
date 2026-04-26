// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SeerTypes
 * @notice 共享枚举/结构体, 由 SeerProtocol 与外部库共用, 确保 storage 引用类型兼容.
 * @dev 字段布局与旧 SeerProtocol.MinerInfo / MinerTier 完全一致, 因此 UUPS 升级不改变 slot.
 */
library SeerTypes {
    enum MinerTier { Basic, V1, V2, V3 }

    struct MinerInfo {
        MinerTier tier;
        uint256 costUsdt;
        uint256 vaultA_usdt;
        uint256 vaultB_usdt;
        uint256 purchaseTime;
        uint256 lastClaimTime;
        uint256 totalClaimed;
        uint256 cycleDays;
        bool active;
        bool isAutoGifted;
        uint256 vaultA_initialUsdt;
        uint256 vaultB_initialUsdt;
        uint256 aReleasedDays;
        uint256 bReleasedDays;
    }
}
