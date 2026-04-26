// SpacetimeDB 闆嗘垚鏂规 - 鍖哄潡閾炬暟鎹悓姝?

import { SpacetimeDBClient } from '@clockworklabs/spacetimedb-sdk';
import { ethers } from 'ethers';

// 1. 浜嬩欢椹卞姩鍚屾 (鎺ㄨ崘 - 瀹炴椂鎬ф渶楂?
export class EventDrivenSync {
  private spacetimeClient: SpacetimeDBClient;
  private provider: ethers.Provider;
  private contracts: {
    protocol: ethers.Contract;
    minerNode: ethers.Contract;
    airdrop: ethers.Contract;
  };

  constructor(spacetimeClient: SpacetimeDBClient, provider: ethers.Provider, contracts: any) {
    this.spacetimeClient = spacetimeClient;
    this.provider = provider;
    this.contracts = contracts;
    this.setupEventListeners();
  }

  private async setupEventListeners() {
    // 鐩戝惉鍗忚鍚堢害浜嬩欢
    this.setupProtocolEvents();
    // 鐩戝惉鑺傜偣鍚堢害浜嬩欢
    this.setupNodeEvents();
    // 鐩戝惉绌烘姇鍚堢害浜嬩欢
    this.setupAirdropEvents();
  }

  private setupProtocolEvents() {
    // 鐢ㄦ埛娉ㄥ唽浜嬩欢
    this.contracts.protocol.on('UserRegistered', async (user, referrer, timestamp, event) => {
      await this.syncUserRegistration(user, referrer, timestamp, event);
    });

    // 鎸栫熆鏀剁泭棰嗗彇浜嬩欢
    this.contracts.protocol.on('MiningClaimed', async (user, seerAmount, toWithdraw, toBetting, event) => {
      await this.syncMiningClaim(user, seerAmount, toWithdraw, toBetting, event);
    });

    // 鍗曠熆鏈烘敹鐩婇鍙栦簨浠?
    this.contracts.protocol.on('MiningClaimedByMiner', async (user, minerId, seerAmount, toWithdraw, toBetting, event) => {
      await this.syncMiningClaimByMiner(user, minerId, seerAmount, toWithdraw, toBetting, event);
    });

    // 鐭挎満璐拱浜嬩欢
    this.contracts.protocol.on('MinerPurchased', async (user, tier, costUsdt, minerId, event) => {
      await this.syncMinerPurchase(user, tier, costUsdt, minerId, event);
    });

    // 鎻愮幇浜嬩欢
    this.contracts.protocol.on('Withdrawal', async (user, seerAmount, fee, event) => {
      await this.syncWithdrawal(user, seerAmount, fee, event);
    });

    // 绛惧埌浜嬩欢
    this.contracts.protocol.on('DailyCheckin', async (user, reward, timestamp, event) => {
      await this.syncDailyCheckin(user, reward, timestamp, event);
    });
  }

  private setupNodeEvents() {
    // 鑺傜偣娉ㄥ唽浜嬩欢
    this.contracts.minerNode.on('NodeRegistered', async (node, weight, tier, event) => {
      await this.syncNodeRegistration(node, weight, tier, event);
    });

    // 鑺傜偣鍒嗙孩棰嗗彇浜嬩欢
    this.contracts.minerNode.on('RewardClaimed', async (node, amount, event) => {
      await this.syncNodeRewardClaim(node, amount, event);
    });

    // 鑺傜偣甯佹潈棰嗗彇浜嬩欢
    this.contracts.minerNode.on('NodeRightsClaimed', async (node, amount, totalClaimed, event) => {
      await this.syncNodeRightsClaim(node, amount, totalClaimed, event);
    });
  }

  private setupAirdropEvents() {
    // 绌烘姇鐩稿叧浜嬩欢 (濡傛灉鏈夌殑璇?
    // this.contracts.airdrop.on('AirdropClaimed', async (user, amount, event) => {
    //   await this.syncAirdropClaim(user, amount, event);
    // });
  }

  // 鍚屾鏂规硶瀹炵幇
  private async syncUserRegistration(user: string, referrer: string, timestamp: bigint, event: any) {
    const block = await event.getBlock();
    const transaction = await this.syncTransaction(event);

    await this.spacetimeClient.insert('transactions', {
      id: `reg_${user}_${event.transactionHash}`,
      user_address: user,
      type: 'register',
      amount: '0',
      token: 'KNIGHTS',
      timestamp: Number(timestamp),
      tx_hash: event.transactionHash,
      block_number: event.blockNumber,
      data: { referrer }
    });

    await this.spacetimeClient.insert('user_activities', {
      id: `activity_${user}_${Date.now()}`,
      user_address: user,
      action: 'register',
      data: { referrer, timestamp: Number(timestamp) },
      timestamp: Date.now()
    });
  }

  private async syncMiningClaim(user: string, seerAmount: bigint, toWithdraw: bigint, toBetting: bigint, event: any) {
    await this.syncTransaction(event, {
      type: 'mining_claim',
      amount: ethers.formatEther(seerAmount),
      token: 'KNIGHTS',
      data: { toWithdraw: ethers.formatEther(toWithdraw), toBetting: ethers.formatEther(toBetting) }
    });
  }

  private async syncTransaction(event: any, overrides: any = {}) {
    const block = await event.getBlock();

    const transaction = {
      id: `${overrides.type || 'unknown'}_${event.transactionHash}`,
      user_address: event.args?.[0] || '',
      type: overrides.type || 'unknown',
      amount: overrides.amount || '0',
      token: overrides.token || 'UNKNOWN',
      timestamp: block.timestamp,
      tx_hash: event.transactionHash,
      block_number: event.blockNumber,
      data: overrides.data || {}
    };

    await this.spacetimeClient.insert('transactions', transaction);
    return transaction;
  }

  // 鍏朵粬鍚屾鏂规硶...
  private async syncMiningClaimByMiner(user: string, minerId: bigint, seerAmount: bigint, toWithdraw: bigint, toBetting: bigint, event: any) {
    await this.syncTransaction(event, {
      type: 'mining_claim_by_miner',
      amount: ethers.formatEther(seerAmount),
      token: 'KNIGHTS',
      data: { minerId: Number(minerId), toWithdraw: ethers.formatEther(toWithdraw), toBetting: ethers.formatEther(toBetting) }
    });
  }

  private async syncMinerPurchase(user: string, tier: bigint, costUsdt: bigint, minerId: bigint, event: any) {
    await this.syncTransaction(event, {
      type: 'miner_purchase',
      amount: ethers.formatUnits(costUsdt, 18),
      token: 'USDT',
      data: { tier: Number(tier), minerId: Number(minerId) }
    });
  }

  private async syncWithdrawal(user: string, seerAmount: bigint, fee: bigint, event: any) {
    await this.syncTransaction(event, {
      type: 'withdrawal',
      amount: ethers.formatEther(seerAmount),
      token: 'KNIGHTS',
      data: { fee: ethers.formatEther(fee) }
    });
  }

  private async syncDailyCheckin(user: string, reward: bigint, timestamp: bigint, event: any) {
    await this.syncTransaction(event, {
      type: 'checkin',
      amount: ethers.formatEther(reward),
      token: 'KNIGHTS',
      data: { timestamp: Number(timestamp) }
    });
  }

  private async syncNodeRegistration(node: string, weight: bigint, tier: bigint, event: any) {
    await this.syncTransaction(event, {
      type: 'node_registered',
      amount: '0',
      token: 'KNIGHTS',
      data: { weight: Number(weight), tier: Number(tier) }
    });
  }

  private async syncNodeRewardClaim(node: string, amount: bigint, event: any) {
    await this.syncTransaction(event, {
      type: 'node_reward_claim',
      amount: ethers.formatEther(amount),
      token: 'KNIGHTS'
    });
  }

  private async syncNodeRightsClaim(node: string, amount: bigint, totalClaimed: bigint, event: any) {
    await this.syncTransaction(event, {
      type: 'node_rights_claim',
      amount: ethers.formatEther(amount),
      token: 'KNIGHTS',
      data: { totalClaimed: ethers.formatEther(totalClaimed) }
    });
  }
}

// 2. 瀹氭椂鍚屾鏂规 (琛ュ厖浜嬩欢椹卞姩)
export class PeriodicSync {
  private spacetimeClient: SpacetimeDBClient;
  private contracts: any;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(spacetimeClient: SpacetimeDBClient, contracts: any) {
    this.spacetimeClient = spacetimeClient;
    this.contracts = contracts;
  }

  // 鍚姩瀹氭椂鍚屾
  start(intervalMs: number = 30000) { // 榛樿30绉?
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.syncInterval = setInterval(() => {
      this.performSync();
    }, intervalMs);
  }

  // 鍋滄瀹氭椂鍚屾
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // 鎵ц鍚屾
  private async performSync() {
    try {
      // 鍚屾鐢ㄦ埛鐘舵€?
      await this.syncUserStates();
      // 鍚屾鎸栫熆鐘舵€?
      await this.syncMiningStates();
      // 鍚屾鑺傜偣鐘舵€?
      await this.syncNodeStates();
      // 鍚屾鍏ㄥ眬缁熻
      await this.syncGlobalStats();
    } catch (error) {
      console.error('Periodic sync failed:', error);
    }
  }

  private async syncUserStates() {
    // 鑾峰彇娲昏穬鐢ㄦ埛鍒楄〃 (闇€瑕佷粠鍚堢害鎴栦簨浠舵棩蹇椾腑鑾峰彇)
    const activeUsers = await this.getActiveUsers();

    for (const user of activeUsers) {
      try {
        const userInfo = await this.contracts.protocol.getUserInfo(user);
        await this.spacetimeClient.insert('user_states', {
          id: `user_${user}`,
          address: user,
          registered: userInfo[0],
          referrer: userInfo[1],
          team_level: Number(userInfo[2]),
          total_invested_usdt: userInfo[3].toString(),
          team_volume_usdt: userInfo[4].toString(),
          seer_balance: userInfo[5].toString(),
          seer_betting: userInfo[6].toString(),
          total_earned_seer: userInfo[7].toString(),
          direct_referral_count: Number(userInfo[8]),
          last_updated: Date.now()
        });
      } catch (error) {
        console.warn(`Failed to sync user ${user}:`, error);
      }
    }
  }

  private async syncMiningStates() {
    const activeUsers = await this.getActiveUsers();

    for (const user of activeUsers) {
      try {
        const minerCount = await this.contracts.protocol.getUserMinerCount(user);

        for (let i = 0; i < Number(minerCount); i++) {
          const minerInfo = await this.contracts.protocol.getUserMiner(user, i);
          const pendingReward = await this.contracts.protocol.getPendingRewardByMiner(user, i);

          await this.spacetimeClient.insert('mining_states', {
            id: `miner_${user}_${i}`,
            user_address: user,
            miner_id: i,
            tier: Number(minerInfo[0]),
            cost_usdt: minerInfo[1].toString(),
            vault_a_usdt: minerInfo[2].toString(),
            vault_b_usdt: minerInfo[3].toString(),
            purchase_time: Number(minerInfo[4]),
            last_claim_time: Number(minerInfo[5]),
            total_claimed: minerInfo[6].toString(),
            cycle_days: Number(minerInfo[7]),
            active: minerInfo[8],
            pending_reward: pendingReward[0].toString(),
            last_updated: Date.now()
          });
        }
      } catch (error) {
        console.warn(`Failed to sync mining state for ${user}:`, error);
      }
    }
  }

  private async syncNodeStates() {
    const activeUsers = await this.getActiveUsers();

    for (const user of activeUsers) {
      try {
        const nodeInfo = await this.contracts.minerNode.nodes(user);
        const rightsInfo = await this.contracts.minerNode.getNodeRightsInfo(user);

        await this.spacetimeClient.insert('node_states', {
          id: `node_${user}`,
          address: user,
          weight: Number(nodeInfo[0]),
          reward_debt: nodeInfo[1].toString(),
          pending_reward: nodeInfo[2].toString(),
          is_node: nodeInfo[3],
          allocated_rights: rightsInfo[0].toString(),
          claimed_rights: rightsInfo[1].toString(),
          pending_rights: rightsInfo[2].toString(),
          rights_unlocked_bp: Number(rightsInfo[3]),
          current_tier: Number(rightsInfo[4]),
          max_tier: Number(rightsInfo[5]),
          protection_until: Number(rightsInfo[6]),
          last_updated: Date.now()
        });
      } catch (error) {
        console.warn(`Failed to sync node state for ${user}:`, error);
      }
    }
  }

  private async syncGlobalStats() {
    try {
      const [
        totalUsers,
        totalActiveMiners,
        totalUsdtReceived,
        totalSeerDistributed,
        miningPool,
        miningPoolRemaining
      ] = await Promise.all([
        this.contracts.protocol.totalUsers(),
        this.contracts.protocol.totalActiveMiners(),
        this.contracts.protocol.totalUsdtReceived(),
        this.contracts.protocol.totalSeerDistributed(),
        this.contracts.protocol.miningPool(),
        this.contracts.protocol.miningPoolRemaining()
      ]);

      await this.spacetimeClient.insert('global_stats', {
        id: 'global_stats',
        total_users: Number(totalUsers),
        total_active_miners: Number(totalActiveMiners),
        total_usdt_received: totalUsdtReceived.toString(),
        total_seer_distributed: totalSeerDistributed.toString(),
        mining_pool: miningPool.toString(),
        mining_pool_remaining: miningPoolRemaining.toString(),
        last_updated: Date.now()
      });
    } catch (error) {
      console.warn('Failed to sync global stats:', error);
    }
  }

  private async getActiveUsers(): Promise<string[]> {
    // 浠庢渶杩戠殑浜嬩欢鏃ュ織涓幏鍙栨椿璺冪敤鎴?
    // 杩欓噷闇€瑕佸疄鐜板叿浣撶殑閫昏緫鏉ヨ幏鍙栨椿璺冪敤鎴峰垪琛?
    // 鍙互浠嶮inerPurchased, UserRegistered绛変簨浠朵腑鎻愬彇
    return [];
  }
}

// 3. 缂撳瓨绛栫暐鍚屾
export class CacheSyncStrategy {
  private spacetimeClient: SpacetimeDBClient;
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();

  constructor(spacetimeClient: SpacetimeDBClient) {
    this.spacetimeClient = spacetimeClient;
  }

  // 缂撳瓨浼樺厛绛栫暐
  async getCachedData<T>(key: string, fetcher: () => Promise<T>, ttlMs: number = 30000): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(key);
    const expiry = this.cacheExpiry.get(key);

    if (cached && expiry && now < expiry) {
      return cached;
    }

    // 缂撳瓨杩囨湡鎴栦笉瀛樺湪锛屼粠SpacetimeDB鑾峰彇
    try {
      const spacetimeData = await this.spacetimeClient.query(key);
      if (spacetimeData) {
        this.cache.set(key, spacetimeData);
        this.cacheExpiry.set(key, now + ttlMs);
        return spacetimeData;
      }
    } catch (error) {
      console.warn(`Failed to get cached data from SpacetimeDB for ${key}:`, error);
    }

    // SpacetimeDB鑾峰彇澶辫触锛屼粠鍖哄潡閾捐幏鍙栧苟鍚屾
    const freshData = await fetcher();
    await this.syncToSpacetimeDB(key, freshData);
    this.cache.set(key, freshData);
    this.cacheExpiry.set(key, now + ttlMs);
    return freshData;
  }

  private async syncToSpacetimeDB(key: string, data: any) {
    try {
      await this.spacetimeClient.insert(key, {
        ...data,
        id: key,
        last_updated: Date.now()
      });
    } catch (error) {
      console.warn(`Failed to sync data to SpacetimeDB for ${key}:`, error);
    }
  }

  // 娓呯悊杩囨湡缂撳瓨
  cleanupExpiredCache() {
    const now = Date.now();
    for (const [key, expiry] of this.cacheExpiry.entries()) {
      if (now > expiry) {
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }
}

// 4. 鍙屽悜鍚屾绛栫暐 (鎺ㄨ崘)
export class BidirectionalSync {
  private eventDrivenSync: EventDrivenSync;
  private periodicSync: PeriodicSync;
  private cacheSync: CacheSyncStrategy;
  private cacheCleanupInterval: NodeJS.Timeout | null = null;

  constructor(spacetimeClient: SpacetimeDBClient, provider: ethers.Provider, contracts: any) {
    this.eventDrivenSync = new EventDrivenSync(spacetimeClient, provider, contracts);
    this.periodicSync = new PeriodicSync(spacetimeClient, contracts);
    this.cacheSync = new CacheSyncStrategy(spacetimeClient);
  }

  // 鍚姩鎵€鏈夊悓姝ョ瓥鐣?
  async start() {
    // 鍚姩浜嬩欢椹卞姩鍚屾 (瀹炴椂)
    // EventDrivenSync 鍦ㄦ瀯閫犲嚱鏁颁腑宸插惎鍔?

    // 鍚姩瀹氭椂鍚屾 (30绉掗棿闅?
    this.periodicSync.start(30000);

    // 鍚姩缂撳瓨娓呯悊 (5鍒嗛挓闂撮殧)
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    this.cacheCleanupInterval = setInterval(() => {
      this.cacheSync.cleanupExpiredCache();
    }, 5 * 60 * 1000);
  }

  // 鍋滄鎵€鏈夊悓姝?
  stop() {
    this.periodicSync.stop();
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
  }

  // 鑾峰彇鏁版嵁 (缂撳瓨浼樺厛)
  async getData<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    return this.cacheSync.getCachedData(key, fetcher);
  }

  // 寮哄埗浠庡尯鍧楅摼鍚屾鏁版嵁
  async forceSyncFromBlockchain() {
    await this.periodicSync.performSync();
  }
}

// 浣跨敤绀轰緥
export function createSyncManager(spacetimeClient: SpacetimeDBClient, provider: ethers.Provider, contracts: any) {
  return new BidirectionalSync(spacetimeClient, provider, contracts);
}