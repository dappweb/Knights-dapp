// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SeerTokenomics
 * @notice SEER代币经济模型常量库
 * @dev 所有经济参数集中在此，便于审计和维护
 *
 * 代币分配 (总量 210,000,000 SEER):
 *   - 挖矿产出: 90% = 189,000,000
 *   - 基金会:    6% =  12,600,000
 *   - 空投:      2% =   4,200,000
 *   - 节点奖励:  1% =   2,100,000
 *   - LP池:      1% =   2,100,000
 */
library SeerTokenomics {

    // ============================================================
    //                      代币基础参数
    // ============================================================

    /// @notice 代币总供应量: 210,000,000 SEER
    uint256 constant TOTAL_SUPPLY = 210_000_000 * 1e18;

    /// @notice 初始价格: 0.1 USDT per SEER (用18位USDT精度表示)
    uint256 constant INITIAL_PRICE_USDT = 1e17; // 0.1 USDT, 18 decimals

    /// @notice 代币精度
    uint8 constant SEER_DECIMALS = 18;
    uint8 constant USDT_DECIMALS = 18;

    // ============================================================
    //                      代币分配比例 (基数10000)
    // ============================================================

    uint256 constant BASIS_POINTS = 10000;

    /// @notice 挖矿占比 90%
    uint256 constant MINING_ALLOCATION_BP = 9000;
    /// @notice 基金会占比 6%
    uint256 constant FOUNDATION_ALLOCATION_BP = 600;
    /// @notice 空投占比 2%
    uint256 constant AIRDROP_ALLOCATION_BP = 200;
    /// @notice 节点奖励占比 1%
    uint256 constant NODE_REWARD_ALLOCATION_BP = 100;
    /// @notice LP池占比 1%
    uint256 constant LP_POOL_ALLOCATION_BP = 100;

    /// @notice 挖矿分配量
    uint256 constant MINING_SUPPLY = 189_000_000 * 1e18;
    /// @notice 基金会分配量
    uint256 constant FOUNDATION_SUPPLY = 12_600_000 * 1e18;
    /// @notice 空投分配量
    uint256 constant AIRDROP_SUPPLY = 4_200_000 * 1e18;
    /// @notice 节点奖励分配量
    uint256 constant NODE_REWARD_SUPPLY = 2_100_000 * 1e18;
    /// @notice LP池分配量
    uint256 constant LP_POOL_SUPPLY = 2_100_000 * 1e18;

    // ============================================================
    //                      矿机参数
    // ============================================================

    /// @notice 矿机等级数量
    uint256 constant MINER_TIER_COUNT = 4;

    // 矿机投入金额 (USDT, 18位精度)
    uint256 constant MINER_BASIC_COST   = 100 * 1e18;    // 100 USDT
    uint256 constant MINER_V1_COST      = 1_000 * 1e18;  // 1,000 USDT
    uint256 constant MINER_V2_COST      = 3_000 * 1e18;  // 3,000 USDT
    uint256 constant MINER_V3_COST      = 10_000 * 1e18; // 10,000 USDT

    // 矿机产出倍率 (基数1000, 即1000=1x)
    uint256 constant MINER_BASIC_MULTIPLIER = 1000;  // 1.0x
    uint256 constant MINER_V1_MULTIPLIER    = 1200;  // 1.2x
    uint256 constant MINER_V2_MULTIPLIER    = 1500;  // 1.5x
    uint256 constant MINER_V3_MULTIPLIER    = 1800;  // 1.8x

    // 矿机周期 (天数) - 决定A仓/B仓每日释放速率
    uint256 constant MINER_BASIC_CYCLE_DAYS = 100;  // 基础矿机100天释放完
    uint256 constant MINER_V1_CYCLE_DAYS    = 120;  // 120天释放完
    uint256 constant MINER_V2_CYCLE_DAYS    = 60;   // 60天释放完
    uint256 constant MINER_V3_CYCLE_DAYS    = 30;   // 30天释放完

    // 【金本位】矿机B仓总产出 (兑换价值, USDT, 18位精度)
    //   用户买1000U → B仓上限=1200U等值的SEER → 金本位按购买时价释放
    uint256 constant MINER_BASIC_B_VAULT_USDT = 100 * 1e18;    // 1.0x  → 100U价值
    uint256 constant MINER_V1_B_VAULT_USDT    = 1_200 * 1e18;  // 1.2x  → 1200U价值
    uint256 constant MINER_V2_B_VAULT_USDT    = 4_500 * 1e18;  // 1.5x  → 4500U价值
    uint256 constant MINER_V3_B_VAULT_USDT    = 18_000 * 1e18; // 1.8x  → 18000U价值

    // A仓/B仓联锁安全阈值: A仓剩余不得低于B仓剩余的20%
    uint256 constant VAULT_A_MIN_RATIO_OF_B_BP = 2000;  // 20% (基数10000)

    // B仓每日释放后的分配比例
    uint256 constant VAULT_B_WITHDRAW_SHARE_BP = 7000;  // 70% → 提现钱包
    uint256 constant VAULT_B_BETTING_SHARE_BP  = 3000;  // 30% → 投注钱包

    // 节点购买限额 (节点招募阶段, 0表示无限制)
    // 节点卖完后进入矿机阶段, 矿机阶段无购买限制
    uint256 constant MINER_V1_PURCHASE_LIMIT = 3;   // V1节点: 同一地址最多购买3个
    uint256 constant MINER_V2_PURCHASE_LIMIT = 1;   // V2节点: 同一地址最多购买1个
    uint256 constant MINER_V3_PURCHASE_LIMIT = 1;   // V3节点: 同一地址最多购买1个

    // ============================================================
    //                      节点招募参数
    // ============================================================

    /// @notice 节点招募持续时间 (15天, 提前售完即结束)
    uint256 constant NODE_SALE_DURATION = 15 days;

    // 各等级节点总量上限
    uint256 constant NODE_V1_MAX_COUNT = 600;   // V1节点总量 600个
    uint256 constant NODE_V2_MAX_COUNT = 100;   // V2节点总量 100个
    uint256 constant NODE_V3_MAX_COUNT = 15;    // V3节点总量 15个

    // 节点币权 (每个节点锁仓SEER数量, 18位精度)
    // 总计210万SEER: V1 600×2000=120万, V2 100×6000=60万, V3 15×20000=30万
    uint256 constant NODE_V1_TOKEN_RIGHTS = 2_000 * 1e18;    // V1节点币权: 2000枚SEER
    uint256 constant NODE_V2_TOKEN_RIGHTS = 6_000 * 1e18;    // V2节点币权: 6000枚SEER
    uint256 constant NODE_V3_TOKEN_RIGHTS = 20_000 * 1e18;   // V3节点币权: 20000枚SEER

    // 节点币权释放规则: 代币价格每上涨0.5U, 释放总锁仓量的1%
    // 释放价格以历史最高价为基准
    uint256 constant NODE_RIGHTS_UNLOCK_PRICE_STEP = 5e17; // 0.5 USDT (18位精度)
    uint256 constant NODE_RIGHTS_UNLOCK_RATE_BP    = 100;      // 每档释放1% (基数10000)

    // 节点等级保护期: 3个月内不降级
    uint256 constant NODE_LEVEL_PROTECTION_PERIOD = 90 days;

    // ============================================================
    //                      团队等级参数
    // ============================================================

    /// @notice 团队等级数量 (V1-V5)
    uint256 constant TEAM_LEVEL_COUNT = 5;

    // 团队业绩门槛 (USDT, 18位精度)
    uint256 constant TEAM_V1_THRESHOLD =   30_000 * 1e18;   // 3万U
    uint256 constant TEAM_V2_THRESHOLD =  100_000 * 1e18;   // 10万U
    uint256 constant TEAM_V3_THRESHOLD =  300_000 * 1e18;   // 30万U
    uint256 constant TEAM_V4_THRESHOLD = 1_000_000 * 1e18;  // 100万U
    uint256 constant TEAM_V5_THRESHOLD = 5_000_000 * 1e18;  // 500万U

    // 团队奖励比例 (基数10000)
    uint256 constant TEAM_V1_REWARD_BP = 1000;  // 10%
    uint256 constant TEAM_V2_REWARD_BP = 2000;  // 20%
    uint256 constant TEAM_V3_REWARD_BP = 3000;  // 30%
    uint256 constant TEAM_V4_REWARD_BP = 4000;  // 40%
    uint256 constant TEAM_V5_REWARD_BP = 5000;  // 50%

    // 团队日释放比例 (基数10000)
    uint256 constant TEAM_V1_WITHDRAW_FEE_BP = 5000;  // 50%
    uint256 constant TEAM_V2_WITHDRAW_FEE_BP = 4000;  // 40%
    uint256 constant TEAM_V3_WITHDRAW_FEE_BP = 3000;  // 30%
    uint256 constant TEAM_V4_WITHDRAW_FEE_BP = 2000;  // 20%
    uint256 constant TEAM_V5_WITHDRAW_FEE_BP = 1000;  // 10%

    // ============================================================
    //                      奖励参数
    // ============================================================

    /// @notice 直推奖励比例 10% (适用于8层)
    uint256 constant DIRECT_REFERRAL_BP = 1000;  // 10%

    /// @notice 直推最大层数
    uint256 constant REFERRAL_MAX_DEPTH = 8;

    /// @notice 级差奖励比例 5%
    uint256 constant DIFFERENTIAL_MATCHING_BP = 500;  // 5%

    /// @notice 平级奖励 10%
    uint256 constant EQUAL_LEVEL_BONUS_BP = 1000;  // 10%

    /// @notice 社区税 2% (V1+团队领导)
    uint256 constant COMMUNITY_TAX_BP = 200;  // 2%

    /// @notice 每日签到奖励 0.5% (持仓量的)
    uint256 constant DAILY_CHECKIN_RATE_BP = 50;  // 0.5%

    // ============================================================
    //                      DEX / 交易税
    // ============================================================

    /// @notice 买入税率 2%
    uint256 constant BUY_TAX_BP = 200;

    /// @notice 卖出税率 2%
    uint256 constant SELL_TAX_BP = 200;

    // 税收分配 (买卖税的分配比例, 基数为税额本身)
    // 2%税中: 1%销毁 + 0.5%节点 + 0.5%基金会
    // 用基数10000的比例表示在总税额中的占比:
    /// @notice 销毁占税额比例 50% (2%的50% = 1%)
    uint256 constant TAX_BURN_SHARE_BP = 5000;
    /// @notice 节点奖励占税额比例 25% (2%的25% = 0.5%)
    uint256 constant TAX_NODE_SHARE_BP = 2500;
    /// @notice 基金会占税额比例 25% (2%的25% = 0.5%)
    uint256 constant TAX_FOUNDATION_SHARE_BP = 2500;

    // ============================================================
    //                      双仓位释放说明
    // ============================================================
    //
    // 【A仓 本金仓】: 用户本金等值SEER (costUsdt)
    //   - 每日释放 = A仓剩余USDT价值 / cycleDays
    //   - 释放的SEER全部进入 提现钱包 (可随时提现)
    //
    // 【B仓 收益仓】: 用户本金×倍率等值SEER (B_VAULT_USDT)
    //   - 每日释放 = B仓剩余USDT价值 / cycleDays
    //   - 释放的SEER: 70% → 提现钱包, 30% → 投注钱包
    //
    // 【联锁规则】: A仓剩余 < B仓剩余×20% 时, B仓暂停释放
    //
    // 【出局条件】: B仓耗尽 → 矿机标记为非活跃
    //
    // ============================================================
    //                      锁仓参数 (已废弃固定锁仓比例)
    // ============================================================

    /// @notice 原固定锁仓70%已改为双仓位模型
    /// @dev B仓分配: 70%→提现, 30%→投注 (由VAULT_B_WITHDRAW_SHARE_BP控制)
    uint256 constant DEFAULT_LOCK_RATE_BP = 7000;  // 保留兼容性, 勿直接用于claimMining

    // ============================================================
    //                      空投参数
    // ============================================================

    /// @notice 注册空投数量: 20 SEER
    uint256 constant AIRDROP_REGISTER_AMOUNT = 20 * 1e18;

    /// @notice 解锁空投所需最低矿机等级 (购买100U矿机解锁)
    uint256 constant AIRDROP_UNLOCK_MIN_MINER_COST = 100 * 1e18;

    // ============================================================
    //                      协议参数
    // ============================================================

    /// @notice 最低投入金额 10 USDT
    uint256 constant MIN_INVESTMENT_USDT = 10 * 1e18;

    /// @notice 签到间隔 (秒)
    uint256 constant CHECKIN_INTERVAL = 24 hours;

    /// @notice 矿机周期时间单位 (秒)
    uint256 constant CYCLE_DAY_SECONDS = 1 days;
}
