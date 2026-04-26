import { useCallback, useContext, createContext, ReactNode, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../src/Web3Context';

interface GlobalRefreshContextType {
  // 余额数据
  balances: {
    usdt: string;
    seer: string;
    eth: string;
    lastUpdated: number;
  };

  // SEER 价格
  seerPrice: number;

  // 刷新函数
  refreshBalances: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // 交易后刷新
  onTransactionSuccess: (type: TransactionType) => Promise<void>;

  // 加载状态
  isRefreshing: boolean;
}

type TransactionType = 'miner_purchase' | 'mining_claim' | 'checkin' | 'withdraw' | 'airdrop';

const GlobalRefreshContext = createContext<GlobalRefreshContextType | null>(null);

export const GlobalRefreshProvider = ({ children }: { children: ReactNode }) => {
  const {
    isConnected, refreshBalances: web3Refresh,
    usdtBalance, seerBalance, ethBalance, protocolContract,
    usdtDecimals, seerDecimals
  } = useWeb3();

  const [balances, setBalances] = useState({
    usdt: '0',
    seer: '0',
    eth: '0',
    lastUpdated: 0,
  });

  const [seerPrice, setSeerPrice] = useState(0.10);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 刷新余额
  const refreshBalances = useCallback(async () => {
    try {
      await web3Refresh();
      setBalances({
        usdt: usdtBalance != null ? ethers.formatUnits(usdtBalance, usdtDecimals) : '0',
        seer: seerBalance != null ? ethers.formatUnits(seerBalance, seerDecimals) : '0',
        eth: ethBalance != null ? ethers.formatUnits(ethBalance, 18) : '0',
        lastUpdated: Date.now(),
      });

      window.dispatchEvent(new CustomEvent('balanceUpdated', { detail: balances }));
    } catch (error) {
      console.error('[GlobalRefresh] 余额更新失败:', error);
    }
  }, [web3Refresh, usdtBalance, seerBalance, ethBalance, usdtDecimals, seerDecimals]);

  // 获取 SEER 价格
  const refreshPrice = useCallback(async () => {
    if (!protocolContract) return;
    try {
      const price = await protocolContract.seerPriceUsdt();
      setSeerPrice(Number(price) / 1e6);
    } catch {
      // 保持默认价格
    }
  }, [protocolContract]);

  // 刷新所有
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshBalances(), refreshPrice()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshBalances, refreshPrice]);

  // 交易成功后刷新
  const onTransactionSuccess = useCallback(async (type: TransactionType) => {
    setIsRefreshing(true);
    try {
      await refreshBalances();
      switch (type) {
        case 'miner_purchase':
          window.dispatchEvent(new CustomEvent('minerStatusChanged'));
          break;
        case 'mining_claim':
        case 'checkin':
          window.dispatchEvent(new CustomEvent('rewardsChanged'));
          break;
        case 'withdraw':
          window.dispatchEvent(new CustomEvent('withdrawComplete'));
          break;
        case 'airdrop':
          window.dispatchEvent(new CustomEvent('airdropClaimed'));
          break;
        default:
          await refreshAll();
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshBalances, refreshAll]);

  // 定期刷新（60秒间隔）
  useEffect(() => {
    if (isConnected) {
      refreshAll();
      const interval = setInterval(refreshAll, 60000);
      return () => clearInterval(interval);
    }
  }, [isConnected, refreshAll]);

  const value: GlobalRefreshContextType = {
    balances,
    seerPrice,
    refreshBalances,
    refreshAll,
    onTransactionSuccess,
    isRefreshing,
  };

  return (
    <GlobalRefreshContext.Provider value={value}>
      {children}
    </GlobalRefreshContext.Provider>
  );
};

export const useGlobalRefresh = () => {
  const context = useContext(GlobalRefreshContext);
  if (!context) {
    throw new Error('useGlobalRefresh must be used within GlobalRefreshProvider');
  }
  return context;
};

export const useEventRefresh = (eventName: string, callback: () => void) => {
  useEffect(() => {
    window.addEventListener(eventName, callback);
    return () => window.removeEventListener(eventName, callback);
  }, [eventName, callback]);
};
