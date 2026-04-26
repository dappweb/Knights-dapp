/**
 * KNIGHTS Protocol 前端类型定义
 * ═══════════════════════════════════════════════════════════════
 */

// ============================================================
//                        应用标签页
// ============================================================

export enum AppTab {
  HOME = 'HOME',
  NODE = 'NODE',
  SWAP = 'SWAP',
  LP_MINING = 'LP_MINING',
  BURN_QUEUE = 'BURN_QUEUE',
  MIGRATION = 'MIGRATION',
  MINER = 'MINER',
  TEAM = 'TEAM',
  HISTORY = 'HISTORY',
  ADMIN = 'ADMIN',
}

// ============================================================
//                        矿机相关
// ============================================================

/** 矿机等级枚举 (与合约 MinerTier 对应) */
export enum MinerTier {
  Basic = 0,
  V1 = 1,
  V2 = 2,
  V3 = 3,
}

/** 矿机档位配置 (双仓位展示) */
export interface MinerTierConfig {
  tier: MinerTier;
  name: string;
  costUsdt: number;
  multiplier: number;
  cycleDays: number;
  dailyOutput: number;   // 已废弃: 原固定日产量, 现在按仓位比例释放
  bVaultUsdt?: number;  // B仓收益上限 (USDT价值)
  soldCount?: number;
  maxSupply?: number;
  enabled?: boolean;
}

/** 用户矿机信息 (链上数据 - 双仓位模型) */
export interface MinerInfo {
  tier: MinerTier;
  costUsdt: bigint;
  vaultA_usdt: bigint;     // A仓剩余 (USDT价值, 6位)
  vaultB_usdt: bigint;     // B仓剩余 (USDT价值, 6位)
  purchaseTime: bigint;
  lastClaimTime: bigint;
  totalClaimed: bigint;
  cycleDays: bigint;
  active: boolean;
  isAutoGifted?: boolean;
  vaultA_initialUsdt: bigint;
  vaultB_initialUsdt: bigint;
  aReleasedDays: bigint;
  bReleasedDays: bigint;
}

// ============================================================
//                        团队等级
// ============================================================

/** 团队等级枚举 (与合约 TeamLevel 对应) */
export enum TeamLevel {
  None = 0,
  V1 = 1,
  V2 = 2,
  V3 = 3,
  V4 = 4,
  V5 = 5,
}

/** 团队等级配置 */
export interface TeamLevelConfig {
  level: TeamLevel;
  name: string;
  thresholdUsdt: number;
  rewardPercent: number;
  withdrawReleasePercent: number;
}

// ============================================================
//                        用户信息
// ============================================================

/** 用户链上信息 */
export interface UserInfo {
  registered: boolean;
  referrer: string;
  teamLevel: TeamLevel; // 链上结算等级
  totalInvestedUsdt: bigint;
  teamVolumeUsdt: bigint;
  seerBalance: bigint;
  seerBetting: bigint;
  totalEarnedSeer: bigint;
  directReferralCount: bigint;
}

/** 用户前端展示数据 */
export interface UserStats {
  balanceUsdt: number;
  balanceSeer: number;
  seerBetting: number;
  totalEarned: number;
  currentLevel: string;
  teamVolume: number;
  teamCount: number;
  pendingRewards: number;
  canCheckin: boolean;
}

// ============================================================
//                        空投信息
// ============================================================

export interface AirdropInfo {
  amount: bigint;
  claimed: boolean;
  unlocked: boolean;
  withdrawn: boolean;
}

// ============================================================
//                        节点信息
// ============================================================

export interface NodeInfo {
  weight: bigint;
  pendingReward: bigint;
  isNode: boolean;
}

// ============================================================
//                        交易记录
// ============================================================

export type TransactionType =
  | 'register'
  | 'miner_purchase'
  | 'mining_claim'
  | 'referral_reward'
  | 'daily_checkin'
  | 'withdrawal'
  | 'airdrop_claim'
  | 'airdrop_unlock'
  | 'node_reward';

export interface TransactionRecord {
  type: TransactionType;
  hash: string;
  timestamp: number;
  amount: string;
  details?: string;
}
