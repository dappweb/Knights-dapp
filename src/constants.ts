import { MinerTier, MinerTierConfig, TeamLevel, TeamLevelConfig } from "./types";

/**
 * KNIGHTS Protocol 前端常量
 * ═══════════════════════════════════════════════════════════════
 * 与合约 SeerTokenomics.sol 保持同步
 */

// 协议版本
export const PROTOCOL_VERSION = "V1";

// ============================================================
//                        链配置
// ============================================================

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || "97");
export const CHAIN_NAME = import.meta.env.VITE_CHAIN_NAME || "BSC Testnet";
export const CHAIN_RPC_URL =
  import.meta.env.VITE_RPC_URL ||
  import.meta.env.VITE_BSC_TESTNET_RPC_URL ||
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
export const BLOCK_EXPLORER_URL =
  import.meta.env.VITE_BLOCK_EXPLORER_URL ||
  "https://testnet.bscscan.com";
export const CHAIN_NATIVE_CURRENCY = {
  name: import.meta.env.VITE_NATIVE_CURRENCY_NAME || "tBNB",
  symbol: import.meta.env.VITE_NATIVE_CURRENCY_SYMBOL || "tBNB",
  decimals: 18,
};

// ============================================================
//                        代币参数
// ============================================================

export const SEER_TOTAL_SUPPLY = 210_000_000;
export const KNT_TOTAL_SUPPLY = 210_000_000;
export const SEER_DECIMALS = 18;
export const KNT_DECIMALS = 18;
export const SEER_INITIAL_PRICE = 3; // KNT initial price target
export const KNT_INITIAL_PRICE = 3;

export const KNT_LP_MODEL = {
  initialLabubuUsdt: 600_000,
  initialKntAmount: 200_000,
  baseDailyEmission: 1_560,
  maxDailyEmission: 3_360,
  emissionStepPer10000Lp: 100,
  staticSharePercent: 50,
  dynamicSharePercent: 40,
  nodeSharePercent: 10,
  reductionPeriodDays: 50,
  reductionPercent: 20,
  reductionRounds: 10,
  nodeSelfLpUsdt: 1_000,
  nodeDirectLpUsdt: 3_000,
  effectiveDirectLpUsdt: 100,
  burnQueueRewardMultiplier: 1.2,
};

// 代币分配
export const TOKEN_ALLOCATION = {
  mining: { percent: 90, amount: 189_000_000 },
  foundation: { percent: 6, amount: 12_600_000 },
  airdrop: { percent: 2, amount: 4_200_000 },
  nodeReward: { percent: 1, amount: 2_100_000 },
  lpPool: { percent: 1, amount: 2_100_000 },
};

// ============================================================
//                        矿机配置
// ============================================================

export const MINER_TIERS: MinerTierConfig[] = [
  {
    tier: MinerTier.Basic,
    name: "基础矿机",
    costUsdt: 100,
    multiplier: 1.0,
    cycleDays: 100,
    dailyOutput: 0,       // 已废弃, 下方bVaultUsdt为准
    bVaultUsdt: 100,      // B仓收益上限 (USDT)
  },
  {
    tier: MinerTier.V1,
    name: "V1 矿机",
    costUsdt: 1_000,
    multiplier: 1.2,
    cycleDays: 120,
    dailyOutput: 0,
    bVaultUsdt: 1_200,    // 1.2x 收益上限
  },
  {
    tier: MinerTier.V2,
    name: "V2 矿机",
    costUsdt: 3_000,
    multiplier: 1.5,
    cycleDays: 60,
    dailyOutput: 0,
    bVaultUsdt: 4_500,    // 1.5x 收益上限
  },
  {
    tier: MinerTier.V3,
    name: "V3 矿机",
    costUsdt: 10_000,
    multiplier: 1.8,
    cycleDays: 30,
    dailyOutput: 0,
    bVaultUsdt: 18_000,   // 1.8x 收益上限
  },
];

// 节点招募阶段 (节点卖完或达15天后进入矿机阶段)
export const NODE_SALE_DURATION_DAYS = 15;

// 节点总量配额 (V1:600, V2:100, V3:15)
export const NODE_QUOTAS = {
  [MinerTier.V1]: 600,
  [MinerTier.V2]: 100,
  [MinerTier.V3]: 15,
} as const;

// 节点地址限购额度 (节点招募阶段, 0=无限制)
// 矿机阶段时全档位无限购
export const NODE_PURCHASE_LIMITS = {
  [MinerTier.V1]: 3,     // V1节点: 同一地址最多购3个
  [MinerTier.V2]: 1,     // V2节点: 同一地址最多购1个
  [MinerTier.V3]: 1,     // V3节点: 同一地址最多购1个
};

// 矿机购买限额 (矿机阶段: 全档位无限制)
// 节点阶段限额见 NODE_PURCHASE_LIMITS / 合约执行
export const MINER_PURCHASE_LIMITS = {
  [MinerTier.Basic]: 0,  // 无限制
  [MinerTier.V1]: 0,     // 无限制 (矿机阶段)
  [MinerTier.V2]: 0,     // 无限制 (矿机阶段)
  [MinerTier.V3]: 0,     // 无限制 (矿机阶段)
};

// 节点币权 (KNIGHTS数量, 每个节点的锁仓币权)
// 总计210万KNIGHTS: V1 600×2000=120万, V2 100×6000=60万, V3 15×20000=30万
export const NODE_TOKEN_RIGHTS = {
  [MinerTier.V1]: 2_000,   // V1: 每个节点2000枚 KNIGHTS
  [MinerTier.V2]: 6_000,   // V2: 每个节点6000枚 KNIGHTS
  [MinerTier.V3]: 20_000,  // V3: 每个节点20000枚 KNIGHTS
};

// 节点币权释放规则: KNIGHTS价格每上涨0.5U, 释放锁仓币权总量的1%
// 释放价格以历史最高价为基准
export const NODE_RIGHTS_UNLOCK_PRICE_STEP_USDT = 0.5;  // 每0.5U一个档位
export const NODE_RIGHTS_UNLOCK_RATE_PERCENT     = 1;    // 每档位释放1%
export const NODE_LEVEL_PROTECTION_DAYS = 90;

// ============================================================
//                        团队等级
// ============================================================

export const TEAM_LEVELS: TeamLevelConfig[] = [
  { level: TeamLevel.V1, name: "V1", thresholdUsdt: 30_000, rewardPercent: 10, withdrawReleasePercent: 50 },
  { level: TeamLevel.V2, name: "V2", thresholdUsdt: 100_000, rewardPercent: 20, withdrawReleasePercent: 40 },
  { level: TeamLevel.V3, name: "V3", thresholdUsdt: 300_000, rewardPercent: 30, withdrawReleasePercent: 30 },
  { level: TeamLevel.V4, name: "V4", thresholdUsdt: 1_000_000, rewardPercent: 40, withdrawReleasePercent: 20 },
  { level: TeamLevel.V5, name: "V5", thresholdUsdt: 5_000_000, rewardPercent: 50, withdrawReleasePercent: 10 },
];

// ============================================================
//                        奖励参数
// ============================================================

export const REFERRAL_MAX_DEPTH = 8;
export const DIRECT_REFERRAL_PERCENT = 10;
export const DIFFERENTIAL_MATCHING_PERCENT = 5;
export const EQUAL_LEVEL_BONUS_PERCENT = 10;
export const COMMUNITY_TAX_PERCENT = 2;
export const DAILY_CHECKIN_PERCENT = 0.5;

// ============================================================
//                        DEX 交易税
// ============================================================

export const BUY_TAX_PERCENT = 0;
export const SELL_TAX_PERCENT = 5;

// 税收分配 (占税额比例)
export const TAX_DISTRIBUTION = {
  queue: 40,
  foundation: 60,
};

// ============================================================
//                        空投参数
// ============================================================

export const AIRDROP_REGISTER_AMOUNT = 20;
export const AIRDROP_UNLOCK_MIN_MINER = 100;

// ============================================================
//                    双仓位分配参数（前端展示）
// ============================================================

export const DEFAULT_LOCK_PERCENT = 70;
export const LOCK_UNLOCK_PRICE_TIER = 0.5;      // 每0.5USDT解锁1%
export const LOCK_UNLOCK_PER_TIER_PERCENT = 1;  // 每层级1%

// ============================================================
//                        协议参数
// ============================================================

export const MIN_INVESTMENT_USDT = 10;
export const CHECKIN_INTERVAL_HOURS = 24;

// ============================================================
//                        Mock 数据
// ============================================================

export const MOCK_USER_STATS = {
  balanceUsdt: 5_000,
  balanceSeer: 12_500,
  seerBetting: 8_750,
  totalEarned: 21_250,
  currentLevel: "V2",
  teamVolume: 150_000,
  teamCount: 42,
  pendingRewards: 1_200,
  canCheckin: true,
};

// Optional external API base URL. Empty means frontend-only mode.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
