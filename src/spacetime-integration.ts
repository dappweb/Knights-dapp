// SpacetimeDB 鍓嶇鐩存帴杩炴帴鏂规

import { SpacetimeDBClient } from '@clockworklabs/spacetimedb-sdk';
import { useState, useEffect, useCallback } from 'react';

// 1. 閰嶇疆 SpacetimeDB 杩炴帴
const SPACETIME_CONFIG = {
  // 鏇挎崲涓轰綘鐨?SpacetimeDB 瀹炰緥鍦板潃
  host: process.env.REACT_APP_SPACETIME_HOST || 'ws://localhost:3000',
  database: 'seer_protocol_db',
  // 鍙€夛細韬唤楠岃瘉浠ょ墝
  token: process.env.REACT_APP_SPACETIME_TOKEN
};

// 2. 鍒涘缓鍏ㄥ眬瀹㈡埛绔疄渚?
let spacetimeClient: SpacetimeDBClient | null = null;

export function getSpacetimeClient(): SpacetimeDBClient {
  if (!spacetimeClient) {
    spacetimeClient = new SpacetimeDBClient({
      host: SPACETIME_CONFIG.host,
      database: SPACETIME_CONFIG.database,
      token: SPACETIME_CONFIG.token
    });
  }
  return spacetimeClient;
}

// 3. 杩炴帴鐘舵€佺鐞?Hook
export function useSpacetimeConnection() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(async () => {
    if (isConnected) return;

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const client = getSpacetimeClient();

      // 鐩戝惉杩炴帴鐘舵€?
      client.on('connected', () => {
        console.log('鉁?Connected to SpacetimeDB');
        setIsConnected(true);
        setIsConnecting(false);
      });

      client.on('disconnected', () => {
        console.log('鉂?Disconnected from SpacetimeDB');
        setIsConnected(false);
        setIsConnecting(false);
      });

      client.on('error', (error: any) => {
        console.error('馃毃 SpacetimeDB connection error:', error);
        setConnectionError(error.message || 'Connection failed');
        setIsConnecting(false);
      });

      // 寤虹珛杩炴帴
      await client.connect();

    } catch (error: any) {
      console.error('Failed to connect to SpacetimeDB:', error);
      setConnectionError(error.message || 'Failed to establish connection');
      setIsConnecting(false);
    }
  }, [isConnected]);

  const disconnect = useCallback(async () => {
    if (spacetimeClient) {
      await spacetimeClient.disconnect();
      setIsConnected(false);
      setConnectionError(null);
    }
  }, []);

  // 鑷姩杩炴帴锛堝彲閫夛級
  useEffect(() => {
    connect();

    // 椤甸潰鍗歌浇鏃舵柇寮€杩炴帴
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    isConnecting,
    connectionError,
    connect,
    disconnect
  };
}

// 4. 瀹炴椂鏁版嵁鏌ヨ Hook
export function useRealtimeData<T>(
  tableName: string,
  query?: any,
  options?: {
    subscribe?: boolean;
    pollInterval?: number;
  }
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isConnected } = useSpacetimeConnection();

  useEffect(() => {
    if (!isConnected) return;

    const client = getSpacetimeClient();
    let unsubscribe: (() => void) | null = null;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        let result;
        if (query) {
          result = await client.query(tableName, query);
        } else {
          result = await client.query(tableName);
        }

        setData(result || []);
      } catch (err: any) {
        console.error(`Failed to fetch ${tableName}:`, err);
        setError(err.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    // 鍒濆鏁版嵁鑾峰彇
    fetchData();

    // 璁剧疆瀹炴椂璁㈤槄锛堝鏋滃惎鐢級
    if (options?.subscribe) {
      unsubscribe = client.subscribe(tableName, (updates: T[]) => {
        setData(updates);
      });
    }

    // 璁剧疆杞锛堝鏋滄寚瀹氶棿闅旓級
    let pollTimer: NodeJS.Timeout | null = null;
    if (options?.pollInterval && options?.pollInterval > 0) {
      pollTimer = setInterval(fetchData, options.pollInterval);
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [isConnected, tableName, query, options?.subscribe, options?.pollInterval]);

  return { data, loading, error, refetch: fetchData };
}

// 5. 鏁版嵁鎿嶄綔 Hook
export function useSpacetimeMutation() {
  const { isConnected } = useSpacetimeConnection();
  const [mutating, setMutating] = useState(false);

  const insert = useCallback(async (tableName: string, data: any) => {
    if (!isConnected) throw new Error('Not connected to SpacetimeDB');

    setMutating(true);
    try {
      const client = getSpacetimeClient();
      const result = await client.insert(tableName, data);
      return result;
    } finally {
      setMutating(false);
    }
  }, [isConnected]);

  const update = useCallback(async (tableName: string, query: any, updates: any) => {
    if (!isConnected) throw new Error('Not connected to SpacetimeDB');

    setMutating(true);
    try {
      const client = getSpacetimeClient();
      const result = await client.update(tableName, query, updates);
      return result;
    } finally {
      setMutating(false);
    }
  }, [isConnected]);

  const delete_ = useCallback(async (tableName: string, query: any) => {
    if (!isConnected) throw new Error('Not connected to SpacetimeDB');

    setMutating(true);
    try {
      const client = getSpacetimeClient();
      const result = await client.delete(tableName, query);
      return result;
    } finally {
      setMutating(false);
    }
  }, [isConnected]);

  return {
    insert,
    update,
    delete: delete_,
    mutating
  };
}

// 6. 浜ゆ槗鍘嗗彶涓撶敤 Hook
export function useTransactionHistory(userAddress?: string) {
  const query = userAddress ? { user_address: userAddress } : undefined;

  const { data: transactions, loading, error, refetch } = useRealtimeData(
    'transactions',
    query,
    {
      subscribe: true, // 鍚敤瀹炴椂璁㈤槄
      pollInterval: 30000 // 30绉掕疆璇綔涓哄浠?
    }
  );

  // 鎸夋椂闂存帓搴忥紙鏈€鏂扮殑鍦ㄥ墠锛?
  const sortedTransactions = [...transactions].sort(
    (a: any, b: any) => b.timestamp - a.timestamp
  );

  return {
    transactions: sortedTransactions,
    loading,
    error,
    refetch
  };
}

// 7. 鐢ㄦ埛鐘舵€佷笓鐢?Hook
export function useUserState(userAddress: string) {
  const { data: userStates, loading, error } = useRealtimeData(
    'user_states',
    { address: userAddress },
    {
      subscribe: true,
      pollInterval: 60000 // 1鍒嗛挓杞
    }
  );

  return {
    userState: userStates[0] || null,
    loading,
    error
  };
}

// 8. 鎸栫熆鐘舵€佷笓鐢?Hook
export function useMiningStates(userAddress: string) {
  const { data: miningStates, loading, error } = useRealtimeData(
    'mining_states',
    { user_address: userAddress },
    {
      subscribe: true,
      pollInterval: 30000
    }
  );

  return {
    miningStates,
    loading,
    error
  };
}

// 9. 鍏ㄥ眬缁熻涓撶敤 Hook
export function useGlobalStats() {
  const { data: stats, loading, error } = useRealtimeData(
    'global_stats',
    undefined,
    {
      subscribe: true,
      pollInterval: 60000 // 1鍒嗛挓鏇存柊鍏ㄥ眬缁熻
    }
  );

  return {
    stats: stats[0] || null,
    loading,
    error
  };
}

// 10. 瀹屾暣鐨勫墠绔泦鎴愮ず渚?
export function SpacetimeDBProvider({ children }: { children: React.ReactNode }) {
  const { isConnected, isConnecting, connectionError } = useSpacetimeConnection();

  if (connectionError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="text-red-800 font-semibold">SpacetimeDB 杩炴帴閿欒</h3>
        <p className="text-red-600 text-sm mt-1">{connectionError}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
        >
          閲嶈瘯杩炴帴
        </button>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-blue-800">杩炴帴鍒?SpacetimeDB...</span>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="text-yellow-800 font-semibold">SpacetimeDB 鏈繛鎺?/h3>
        <p className="text-yellow-600 text-sm mt-1">瀹炴椂鏁版嵁鍔熻兘涓嶅彲鐢紝灏嗕娇鐢ㄥ尯鍧楅摼鐩存帴鏌ヨ</p>
      </div>
    );
  }

  return <>{children}</>;
}

// 11. 浣跨敤绀轰緥缁勪欢
export function TransactionHistoryWithSpacetime() {
  const { transactions, loading, error } = useTransactionHistory();
  const { insert, mutating } = useSpacetimeMutation();

  const addTestTransaction = async () => {
    try {
      await insert('transactions', {
        id: `test_${Date.now()}`,
        user_address: '0x123...',
        type: 'test_transaction',
        amount: '100',
        token: 'KNIGHTS',
        timestamp: Date.now(),
        tx_hash: `0x${Math.random().toString(16).substr(2, 64)}`,
        block_number: 12345,
        data: { test: true }
      });
    } catch (err) {
      console.error('Failed to add test transaction:', err);
    }
  };

  if (loading) return <div>鍔犺浇浜ゆ槗鍘嗗彶...</div>;
  if (error) return <div>閿欒: {error}</div>;

  return (
    <div>
      <h2>浜ゆ槗鍘嗗彶 (SpacetimeDB)</h2>
      <button
        onClick={addTestTransaction}
        disabled={mutating}
        className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {mutating ? '娣诲姞涓?..' : '娣诲姞娴嬭瘯浜ゆ槗'}
      </button>

      <div className="space-y-2">
        {transactions.map((tx: any) => (
          <div key={tx.id} className="p-3 border rounded">
            <div className="flex justify-between">
              <span>{tx.type}</span>
              <span>{tx.amount} {tx.token}</span>
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {new Date(tx.timestamp).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 3. 瀹氫箟鏁版嵁琛ㄧ粨鏋?
export interface RealtimeTransaction {
  id: string;
  userAddress: string;
  type: string;
  amount: string;
  token: string;
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

export interface RealtimeUserActivity {
  id: string;
  userAddress: string;
  action: string;
  data: any;
  timestamp: number;
}

export interface RealtimeMiningStatus {
  id: string;
  userAddress: string;
  minerId: number;
  pendingReward: string;
  lastUpdate: number;
}

// 4. 瀹炴椂鍚屾鏈嶅姟
export class RealtimeSyncService {
  private client: SpacetimeDBClient;

  constructor() {
    this.client = spacetimeClient;
    this.setupSubscriptions();
  }

  // 璁㈤槄浜ゆ槗鍘嗗彶鏇存柊
  private setupSubscriptions() {
    // 鐩戝惉鏂颁氦鏄?
    this.client.subscribe('transactions', (tx: RealtimeTransaction) => {
      // 骞挎挱缁欐墍鏈夎繛鎺ョ殑瀹㈡埛绔?
      this.broadcastTransaction(tx);
    });

    // 鐩戝惉鐢ㄦ埛娲诲姩
    this.client.subscribe('user_activities', (activity: RealtimeUserActivity) => {
      this.broadcastActivity(activity);
    });

    // 鐩戝惉鎸栫熆鐘舵€佸彉鍖?
    this.client.subscribe('mining_status', (status: RealtimeMiningStatus) => {
      this.broadcastMiningUpdate(status);
    });
  }

  // 骞挎挱浜ゆ槗鍒版墍鏈夊鎴风
  private broadcastTransaction(tx: RealtimeTransaction) {
    // 浣跨敤 WebSocket 鎴栧叾浠栧疄鏃堕€氫俊鏂瑰紡骞挎挱
    this.notifyClients('new_transaction', tx);
  }

  // 骞挎挱鐢ㄦ埛娲诲姩
  private broadcastActivity(activity: RealtimeUserActivity) {
    this.notifyClients('user_activity', activity);
  }

  // 骞挎挱鎸栫熆鐘舵€佹洿鏂?
  private broadcastMiningUpdate(status: RealtimeMiningStatus) {
    this.notifyClients('mining_update', status);
  }

  // 閫氱煡鎵€鏈夊鎴风
  private notifyClients(event: string, data: any) {
    // 瀹炵幇瀹㈡埛绔€氱煡閫昏緫
    console.log(`Broadcasting ${event}:`, data);
  }

  // 娣诲姞鏂颁氦鏄撳埌 SpacetimeDB
  async addTransaction(tx: Omit<RealtimeTransaction, 'id'>) {
    const transaction = {
      id: `${tx.txHash}_${Date.now()}`,
      ...tx
    };

    await this.client.insert('transactions', transaction);
  }

  // 鏇存柊鎸栫熆鐘舵€?
  async updateMiningStatus(status: Omit<RealtimeMiningStatus, 'id'>) {
    const miningStatus = {
      id: `${status.userAddress}_${status.minerId}_${Date.now()}`,
      ...status
    };

    await this.client.insert('mining_status', miningStatus);
  }

  // 璁板綍鐢ㄦ埛娲诲姩
  async logUserActivity(activity: Omit<RealtimeUserActivity, 'id'>) {
    const userActivity = {
      id: `${activity.userAddress}_${Date.now()}`,
      ...activity
    };

    await this.client.insert('user_activities', userActivity);
  }
}

// 5. React Hook for 瀹炴椂鏁版嵁
export function useRealtimeData() {
  const [transactions, setTransactions] = useState<RealtimeTransaction[]>([]);
  const [activities, setActivities] = useState<RealtimeUserActivity[]>([]);
  const [miningStatuses, setMiningStatuses] = useState<RealtimeMiningStatus[]>([]);

  useEffect(() => {
    const syncService = new RealtimeSyncService();

    // 鐩戝惉瀹炴椂鏇存柊
    const handleTransaction = (tx: RealtimeTransaction) => {
      setTransactions(prev => [tx, ...prev.slice(0, 99)]); // 淇濇寔鏈€杩?00鏉?
    };

    const handleActivity = (activity: RealtimeUserActivity) => {
      setActivities(prev => [activity, ...prev.slice(0, 49)]); // 淇濇寔鏈€杩?0鏉?
    };

    const handleMiningUpdate = (status: RealtimeMiningStatus) => {
      setMiningStatuses(prev => {
        const filtered = prev.filter(s => !(s.userAddress === status.userAddress && s.minerId === status.minerId));
        return [status, ...filtered.slice(0, 9)]; // 姣忎釜鐢ㄦ埛鏈€澶?0涓熆鏈虹姸鎬?
      });
    };

    // 娉ㄥ唽浜嬩欢鐩戝惉鍣?
    syncService.client.on('new_transaction', handleTransaction);
    syncService.client.on('user_activity', handleActivity);
    syncService.client.on('mining_update', handleMiningUpdate);

    return () => {
      // 娓呯悊鐩戝惉鍣?
      syncService.client.off('new_transaction', handleTransaction);
      syncService.client.off('user_activity', handleActivity);
      syncService.client.off('mining_update', handleMiningUpdate);
    };
  }, []);

  return { transactions, activities, miningStatuses };
}

// 6. 闆嗘垚鍒扮幇鏈夌粍浠剁殑绀轰緥
export function EnhancedTransactionHistory() {
  const { transactions: realtimeTxs } = useRealtimeData();
  const { transactions: blockchainTxs, loading } = useBlockchainTransactions();

  // 鍚堝苟瀹炴椂鏁版嵁鍜屽尯鍧楅摼鏁版嵁
  const allTransactions = useMemo(() => {
    const combined = [...realtimeTxs, ...blockchainTxs];
    return combined.sort((a, b) => b.timestamp - a.timestamp);
  }, [realtimeTxs, blockchainTxs]);

  return (
    <div>
      {/* 鏄剧ず鍚堝苟鍚庣殑浜ゆ槗鍘嗗彶 */}
      {allTransactions.map(tx => (
        <TransactionItem key={tx.id || tx.txHash} transaction={tx} />
      ))}
    </div>
  );
}