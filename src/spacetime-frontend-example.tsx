// 鍓嶇鐩存帴杩炴帴 SpacetimeDB 鐨勪娇鐢ㄧず渚?

import {
  SpacetimeDBProvider,
  useGlobalStats,
  useMiningStates,
  useSpacetimeMutation,
  useTransactionHistory,
  useUserState
} from './spacetime-integration';

// 1. 鍦?App.tsx 涓寘瑁呭簲鐢?
function App() {
  return (
    <SpacetimeDBProvider>
      {/* 浣犵殑搴旂敤缁勪欢 */}
      <Dashboard />
    </SpacetimeDBProvider>
  );
}

// 2. 澧炲己鐨勪氦鏄撳巻鍙茬粍浠?
function EnhancedTransactionHistory() {
  const { transactions, loading, error, refetch } = useTransactionHistory();
  const { insert, mutating } = useSpacetimeMutation();

  // 娣诲姞鏂颁氦鏄撳埌 SpacetimeDB锛堜緥濡備粠鍖哄潡閾句簨浠跺悓姝ワ級
  const syncTransactionFromBlockchain = async (blockchainTx: any) => {
    await insert('transactions', {
      id: `${blockchainTx.type}_${blockchainTx.txHash}`,
      user_address: blockchainTx.userAddress,
      type: blockchainTx.type,
      amount: blockchainTx.amount,
      token: blockchainTx.token,
      timestamp: blockchainTx.timestamp,
      tx_hash: blockchainTx.txHash,
      block_number: blockchainTx.blockNumber,
      data: blockchainTx.data || {}
    });
  };

  if (loading) return <div className="p-4">鍔犺浇浜ゆ槗鍘嗗彶...</div>;
  if (error) return <div className="p-4 text-red-600">閿欒: {error}</div>;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">浜ゆ槗鍘嗗彶 (瀹炴椂鍚屾)</h2>
        <button
          onClick={refetch}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          鍒锋柊
        </button>
      </div>

      <div className="space-y-2">
        {transactions.map((tx: any) => (
          <div key={tx.id} className="p-3 border border-gray-200 rounded-lg bg-white">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold text-gray-900">{tx.type}</div>
                <div className="text-sm text-gray-500">
                  {new Date(tx.timestamp).toLocaleString()}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  TX: {tx.tx_hash?.slice(0, 10)}...
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-green-600">
                  {tx.amount} {tx.token}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 3. 瀹炴椂鐢ㄦ埛鐘舵€佺粍浠?
function UserStatusCard({ userAddress }: { userAddress: string }) {
  const { userState, loading, error } = useUserState(userAddress);

  if (loading) return <div className="p-4 bg-gray-50 rounded">鍔犺浇鐢ㄦ埛鐘舵€?..</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded">閿欒: {error}</div>;
  if (!userState) return <div className="p-4 bg-gray-50 rounded">鐢ㄦ埛鏈壘鍒?/div>;

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg">
      <h3 className="font-bold mb-3">鐢ㄦ埛鐘舵€?(瀹炴椂)</h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">鍥㈤槦绛夌骇:</span>
          <span className="ml-2 font-semibold">{userState.team_level}</span>
        </div>
        <div>
          <span className="text-gray-500">鐩存帹浜烘暟:</span>
          <span className="ml-2 font-semibold">{userState.direct_referral_count}</span>
        </div>
        <div>
          <span className="text-gray-500">鎬绘姇璧?</span>
          <span className="ml-2 font-semibold">{userState.total_invested_usdt} USDT</span>
        </div>
        <div>
          <span className="text-gray-500">KNIGHTS浣欓:</span>
          <span className="ml-2 font-semibold">{userState.seer_balance}</span>
        </div>
      </div>
    </div>
  );
}

// 4. 瀹炴椂鎸栫熆鐘舵€佺粍浠?
function MiningStatusCard({ userAddress }: { userAddress: string }) {
  const { miningStates, loading, error } = useMiningStates(userAddress);

  if (loading) return <div className="p-4 bg-gray-50 rounded">鍔犺浇鎸栫熆鐘舵€?..</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded">閿欒: {error}</div>;

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg">
      <h3 className="font-bold mb-3">鎸栫熆鐘舵€?(瀹炴椂)</h3>
      {miningStates.length === 0 ? (
        <p className="text-gray-500">鏆傛棤鐭挎満</p>
      ) : (
        <div className="space-y-2">
          {miningStates.map((miner: any) => (
            <div key={miner.id} className="p-2 bg-gray-50 rounded text-sm">
              <div className="flex justify-between">
                <span>鐭挎満 #{miner.miner_id + 1}</span>
                <span className="font-semibold">{miner.pending_reward} KNIGHTS</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                绛夌骇: {miner.tier} | 寰呴鍙栨敹鐩?
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 5. 鍏ㄥ眬缁熻缁勪欢
function GlobalStatsCard() {
  const { stats, loading, error } = useGlobalStats();

  if (loading) return <div className="p-4 bg-gray-50 rounded">鍔犺浇鍏ㄥ眬缁熻...</div>;
  if (error) return <div className="p-4 bg-red-50 text-red-600 rounded">閿欒: {error}</div>;
  if (!stats) return <div className="p-4 bg-gray-50 rounded">鏆傛棤缁熻鏁版嵁</div>;

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg">
      <h3 className="font-bold mb-3">鍏ㄥ眬缁熻 (瀹炴椂)</h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">鎬荤敤鎴锋暟:</span>
          <span className="ml-2 font-semibold">{stats.total_users}</span>
        </div>
        <div>
          <span className="text-gray-500">娲昏穬鐭挎満:</span>
          <span className="ml-2 font-semibold">{stats.total_active_miners}</span>
        </div>
        <div>
          <span className="text-gray-500">鎬绘姇璧?</span>
          <span className="ml-2 font-semibold">{stats.total_usdt_received} USDT</span>
        </div>
        <div>
          <span className="text-gray-500">宸插垎鍙?</span>
          <span className="ml-2 font-semibold">{stats.total_seer_distributed} KNIGHTS</span>
        </div>
      </div>
    </div>
  );
}

// 6. 涓讳华琛ㄦ澘缁勪欢
function Dashboard() {
  const userAddress = "0x123456789..."; // 浠庨挶鍖呰幏鍙?

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-center">KNIGHTS Protocol 浠〃鏉?/h1>

        {/* 鍏ㄥ眬缁熻 */}
        <GlobalStatsCard />

        {/* 鐢ㄦ埛鐘舵€佸拰鎸栫熆鐘舵€?*/}
        <div className="grid md:grid-cols-2 gap-4">
          <UserStatusCard userAddress={userAddress} />
          <MiningStatusCard userAddress={userAddress} />
        </div>

        {/* 浜ゆ槗鍘嗗彶 */}
        <EnhancedTransactionHistory />
      </div>
    </div>
  );
}

export default Dashboard;