import { ethers } from "ethers";
import { BarChart3, Coins, Copy, Flame, Gift, Lock, Shield, Target, TrendingUp, Users, Wallet, Zap } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useWeb3 } from "../src/Web3Context";
import { AIRDROP_REGISTER_AMOUNT, BUY_TAX_PERCENT, DAILY_CHECKIN_PERCENT, MINER_TIERS, SEER_INITIAL_PRICE, SEER_TOTAL_SUPPLY, SELL_TAX_PERCENT, TEAM_LEVELS, TOKEN_ALLOCATION } from "../src/constants";
import { MinerTier, MinerTierConfig, UserStats } from "../src/types";

interface StatsPanelProps {
  stats: UserStats | null;
  onJoinClick: () => void;
  onBuyTicketClick: () => void;
  onAirdropClick: () => void;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ onJoinClick, onAirdropClick }) => {
  const {
    account, isConnected, protocolContract, airdropContract,
    usdtBalance, usdtDecimals, isRegistered, contractAddresses: CONTRACT_ADDRESSES
  } = useWeb3();

  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [pendingRewards, setPendingRewards] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [claimCount, setClaimCount] = useState(0);
  const [remainingSlots, setRemainingSlots] = useState(0);
  const [tierConfigs, setTierConfigs] = useState<MinerTierConfig[]>(MINER_TIERS);

  const countAllTeamMembers = useCallback(async (root: string) => {
    if (!protocolContract) return 0;

    const visited = new Set<string>([root.toLowerCase()]);
    const queue: string[] = [root];
    let total = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      let directRefs: string[] = [];
      try {
        directRefs = await protocolContract.getDirectReferrals(current);
      } catch {
        continue;
      }

      for (const refAddr of directRefs) {
        const key = refAddr.toLowerCase();
        if (visited.has(key)) continue;
        visited.add(key);

        let registered = false;
        try {
          const refInfo = await protocolContract.getUserInfo(refAddr);
          registered = Boolean(refInfo?.registered ?? refInfo?.[0]);
        } catch {
          registered = false;
        }

        if (!registered) continue;
        total += 1;
        queue.push(refAddr);
      }
    }

    return total;
  }, [protocolContract]);

  // 获取用户数据
  const fetchUserData = useCallback(async () => {
    if (!protocolContract || !account) return;
    setLoading(true);
    try {
      const [info, pending, canCheck, allTeamMembers] = await Promise.all([
        protocolContract.getUserInfo(account),
        protocolContract.getPendingRewards(account),
        protocolContract.canCheckin(account),
        countAllTeamMembers(account),
      ]);

      setPendingRewards(pending);
      setUserStats({
        balanceUsdt: usdtBalance ? Number(ethers.formatUnits(usdtBalance, usdtDecimals)) : 0,
        balanceSeer: Number(ethers.formatEther(info[5])), // seerBalance (提现钱包)
        seerBetting: Number(ethers.formatEther(info[6])), // seerBetting (投注钱包30%)
        totalEarned: Number(ethers.formatEther(info[7])), // totalEarnedSeer
        currentLevel: `V${Number(info[2])}`, // teamLevel
        teamVolume: Number(ethers.formatUnits(info[4], usdtDecimals)), // teamVolumeUsdt
        teamCount: allTeamMembers,
        pendingRewards: Number(ethers.formatEther(pending)),
        canCheckin: canCheck,
      });
    } catch (err) {
      console.error("Failed to fetch user data:", err);
    } finally {
      setLoading(false);
    }
  }, [protocolContract, account, usdtBalance, usdtDecimals, countAllTeamMembers]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const fetchAirdropProgress = useCallback(async () => {
    if (!airdropContract) return;
    try {
      const [claimed, remaining] = await Promise.all([
        airdropContract.claimCount(),
        airdropContract.remainingAirdropSlots(),
      ]);
      setClaimCount(Number(claimed));
      setRemainingSlots(Number(remaining));
    } catch (err) {
      console.error("Failed to fetch airdrop progress:", err);
    }
  }, [airdropContract]);

  useEffect(() => {
    fetchAirdropProgress();
  }, [fetchAirdropProgress]);

  const fetchTierConfigs = useCallback(async () => {
    if (!protocolContract) return;

    try {
      const nextConfigs = await Promise.all(
        [MinerTier.Basic, MinerTier.V1, MinerTier.V2, MinerTier.V3].map(async (tier) => {
          const fallback = MINER_TIERS.find((item) => item.tier === tier);
          const config = await (protocolContract as any).getMinerTierConfig(tier);
          return {
            tier,
            name: fallback?.name || `Tier ${tier}`,
            costUsdt: Number(ethers.formatUnits(config.costUsdt ?? config[0], usdtDecimals)),
            multiplier: Number(config.multiplier ?? config[1]) / 1000,
            cycleDays: Number(config.cycleDays ?? config[2]),
            dailyOutput: 0,
            bVaultUsdt: Number(ethers.formatUnits(config.bVaultUsdt ?? config[3], usdtDecimals)),
            soldCount: Number(config.soldCount ?? config[4]),
            maxSupply: Number(config.maxSupply ?? config[5]),
            enabled: Boolean(config.enabled ?? config[6]),
          } satisfies MinerTierConfig;
        })
      );
      setTierConfigs(nextConfigs);
    } catch {
      setTierConfigs(MINER_TIERS);
    }
  }, [protocolContract, usdtDecimals]);

  useEffect(() => {
    fetchTierConfigs();
  }, [fetchTierConfigs]);

  const formatNumber = (n: number, decimals = 2) =>
    n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const seerContractAddress = CONTRACT_ADDRESSES.SEER_TOKEN;

  const handleCopySeerAddress = async () => {
    if (!seerContractAddress) {
      toast.error("KNIGHTS 合约地址未配置");
      return;
    }

    try {
      await navigator.clipboard.writeText(seerContractAddress);
      toast.success("KNIGHTS 合约地址已复制");
    } catch (err) {
      console.error("Failed to copy KNIGHTS contract address:", err);
      toast.error("复制失败，请手动复制");
    }
  };

  const maxAirdropSlots = Math.floor(TOKEN_ALLOCATION.airdrop.amount / AIRDROP_REGISTER_AMOUNT);
  const claimedPercent = maxAirdropSlots > 0 ? Math.min(100, (claimCount / maxAirdropSlots) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* 欢迎卡片 */}
      <div className="bg-gradient-to-br from-indigo-900/40 to-violet-900/40 border border-indigo-500/15 rounded-2xl p-6 backdrop-blur-sm">
        <h1 className="text-2xl md:text-3xl font-black text-white mb-2">
          KNIGHTS <span className="text-violet-400">Protocol</span>
        </h1>
        <p className="text-slate-400 text-sm">
          去中心化预测平台 · USDT投入 · KNIGHTS产出
        </p>
        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between bg-[#13102B]/50 border border-indigo-500/10 rounded-xl px-4 py-3">
          <div className="min-w-0">
            <p className="text-slate-400 text-xs">KNIGHTS 合约地址</p>
            <p className="text-white text-sm font-mono break-all mt-1">
              {seerContractAddress || "未配置"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopySeerAddress}
            disabled={!seerContractAddress}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 border border-indigo-300/30 shadow-lg shadow-indigo-900/35 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-300 disabled:cursor-not-allowed !text-white text-sm font-bold transition-all whitespace-nowrap"
          >
            <Copy size={14} className="text-white/95" /> 复制地址
          </button>
        </div>
        {!isConnected && (
          <p className="text-amber-400 text-sm mt-3 flex items-center gap-1">
            <Wallet size={14} /> 请连接钱包查看您的数据
          </p>
        )}
      </div>

      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-white font-bold flex items-center gap-2">
              <Gift size={16} className="text-amber-400" /> 空投进度
            </h3>
            <p className="text-slate-400 text-xs mt-1">
              代币价格 <span className="text-emerald-400 font-bold">${SEER_INITIAL_PRICE}</span> USDT · 已领取 {claimCount.toLocaleString()} / {maxAirdropSlots.toLocaleString()} 份
            </p>
          </div>
          <button
            onClick={onAirdropClick}
            className="px-4 py-2 min-w-[88px] bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 border border-indigo-300/30 shadow-lg shadow-indigo-900/35 !text-white text-sm font-bold rounded-lg transition-all whitespace-nowrap"
          >
            领空投
          </button>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400 flex items-center gap-1"><Target size={12} className="text-violet-400" /> 领取进度</span>
            <span className="text-amber-400 font-bold">{claimedPercent.toFixed(2)}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#13102B] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-violet-500 transition-all"
              style={{ width: `${claimedPercent}%` }}
            />
          </div>
          <p className="text-slate-500 text-[11px] mt-2">剩余空投名额：{remainingSlots.toLocaleString()} 份</p>
        </div>
      </div>

      {!isConnected && (
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 backdrop-blur-sm">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Gift size={16} className="text-amber-400" /> 空投速览
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-xs">每人空投</p>
              <p className="text-amber-400 text-lg font-bold mt-1">{AIRDROP_REGISTER_AMOUNT}</p>
              <p className="text-slate-500 text-[10px]">KNIGHTS</p>
            </div>
            <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-xs">剩余名额</p>
              <p className="text-white text-lg font-bold mt-1">{remainingSlots.toLocaleString()}</p>
              <p className="text-slate-500 text-[10px]">份</p>
            </div>
            <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-3 text-center col-span-2 md:col-span-2">
              <p className="text-slate-400 text-xs">状态说明</p>
              <p className="text-lg font-bold mt-1 text-violet-400">连接钱包后查看个人空投状态</p>
              <p className="text-slate-500 text-[10px]">详细规则与领取步骤在下方空投中心</p>
            </div>
          </div>
        </div>
      )}

      {/* ══════ 未连接钱包时：协议概览 ══════ */}
      {!isConnected && (
        <>
          {/* 核心数据 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-2">
                <Coins size={16} className="text-emerald-400" />
                <span className="text-slate-400 text-xs">KNIGHTS 价格</span>
              </div>
              <p className="text-white text-lg font-bold">${SEER_INITIAL_PRICE}</p>
              <p className="text-slate-500 text-[10px]">USDT</p>
            </div>
            <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 size={16} className="text-violet-400" />
                <span className="text-slate-400 text-xs">总供应量</span>
              </div>
              <p className="text-white text-lg font-bold">{(SEER_TOTAL_SUPPLY / 1_000_000).toFixed(0)}M</p>
              <p className="text-slate-500 text-[10px]">KNIGHTS</p>
            </div>
            <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={16} className="text-amber-400" />
                <span className="text-slate-400 text-xs">挖矿池占比</span>
              </div>
              <p className="text-white text-lg font-bold">{TOKEN_ALLOCATION.mining.percent}%</p>
              <p className="text-slate-500 text-[10px]">{(TOKEN_ALLOCATION.mining.amount / 1_000_000).toFixed(0)}M KNIGHTS</p>
            </div>
            <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-2">
                <Flame size={16} className="text-rose-400" />
                <span className="text-slate-400 text-xs">交易税</span>
              </div>
              <p className="text-white text-lg font-bold">{BUY_TAX_PERCENT}% / {SELL_TAX_PERCENT}%</p>
              <p className="text-slate-500 text-[10px]">买入 / 卖出</p>
            </div>
          </div>

          {/* 矿机一览 */}
          <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 backdrop-blur-sm">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Zap size={16} className="text-amber-400" /> 矿机类型一览
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {tierConfigs.map((tier) => (
                <div key={tier.tier} className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4">
                  <p className="text-white font-bold text-sm">{tier.name}</p>
                  <p className="text-amber-400 text-lg font-black mt-1">{tier.costUsdt.toLocaleString()} U</p>
                  <p className="text-slate-400 text-xs mt-1">
                    {tier.cycleDays > 0 ? `${tier.cycleDays}天周期` : "永久有效"} · {tier.multiplier}x
                  </p>
                  {typeof tier.bVaultUsdt === "number" && (
                    <p className="text-emerald-400 text-xs mt-0.5">B仓上限 {tier.bVaultUsdt.toLocaleString()} U</p>
                  )}
                  {tier.enabled === false && (
                    <p className="text-rose-400 text-xs mt-1">当前已下架</p>
                  )}
                  {typeof tier.maxSupply === "number" && tier.maxSupply > 0 && (
                    <p className="text-slate-500 text-xs mt-1">库存 {tier.soldCount ?? 0}/{tier.maxSupply}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 收益机制 */}
          <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 backdrop-blur-sm">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Gift size={16} className="text-violet-400" /> 收益机制
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={14} className="text-emerald-400" />
                  <span className="text-white text-sm font-bold">矿机产出</span>
                </div>
                <p className="text-slate-400 text-xs">购买矿机后按 A/B 双仓规则每日释放收益：A仓100%进提现，B仓70%进提现、30%进投注。</p>
              </div>
              <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={14} className="text-violet-400" />
                  <span className="text-white text-sm font-bold">推荐奖励</span>
                </div>
                <p className="text-slate-400 text-xs">培育奖励按B仓释放计算：直推N人可拿N代，默认每代1%、最多10代（总10%，可配置）。</p>
              </div>
              <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={14} className="text-amber-400" />
                  <span className="text-white text-sm font-bold">每日签到</span>
                </div>
                <p className="text-slate-400 text-xs">每日签到获得持仓量 {DAILY_CHECKIN_PERCENT}% 的 KNIGHTS 奖励</p>
              </div>
              <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock size={14} className="text-rose-400" />
                  <span className="text-white text-sm font-bold">双仓分配</span>
                </div>
                <p className="text-slate-400 text-xs">B仓收益按周期线性释放，其中70%可提现，30%进入投注钱包参与生态。</p>
              </div>
            </div>
          </div>

          {/* 团队等级一览 */}
          <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 backdrop-blur-sm">
            <h3 className="text-white font-bold mb-2 flex items-center gap-2">
              <Shield size={16} className="text-amber-400" /> 团队与节点等级体系
            </h3>
            <p className="text-slate-500 text-xs mb-4">小区业绩决定链上结算等级；购买节点后会形成对应节点身份，并带来 90 天保级展示窗口。</p>
            <div className="space-y-2">
              {TEAM_LEVELS.map((level) => (
                <div key={level.level} className="flex items-center justify-between p-3 rounded-lg border border-indigo-500/10 bg-[#13102B]/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black bg-slate-700 text-slate-400">
                      {level.level}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-300">{level.name}</p>
                      <p className="text-slate-500 text-xs">
                        {level.thresholdUsdt >= 10000
                          ? `${(level.thresholdUsdt / 10000).toLocaleString()}万U`
                          : `${level.thresholdUsdt.toLocaleString()}U`}
                        业绩
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-500">{level.rewardPercent}% 加速</p>
                    <p className="text-slate-500 text-xs">日释放 {level.withdrawReleasePercent}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 代币分配 */}
          <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 backdrop-blur-sm">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-violet-400" /> 代币分配
            </h3>
            <div className="space-y-3">
              {Object.entries(TOKEN_ALLOCATION)
                .filter(([key]) => key !== "nodeReward")
                .map(([key, val]) => {
                const labels: Record<string, string> = {
                  mining: "挖矿奖励池",
                  foundation: "基金会",
                  airdrop: "空投",
                  lpPool: "流动性池",
                };
                const colors: Record<string, string> = {
                  mining: "bg-violet-500",
                  foundation: "bg-indigo-500",
                  airdrop: "bg-amber-500",
                  lpPool: "bg-cyan-500",
                };
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-300 text-sm">{labels[key] || key}</span>
                      <span className="text-slate-400 text-xs">{val.percent}% · {(val.amount / 1_000_000).toFixed(1)}M</span>
                    </div>
                    <div className="bg-[#13102B] rounded-full h-2 overflow-hidden">
                      <div className={`${colors[key] || "bg-slate-500"} h-full rounded-full transition-all`} style={{ width: `${val.percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ══════ 已连接钱包时：用户数据 ══════ */}
      {isConnected && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* USDT */}
          <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <Coins size={16} className="text-emerald-400" />
              <span className="text-slate-400 text-xs">USDT</span>
            </div>
            <p className="text-white text-lg font-bold">
              {usdtBalance !== null ? formatNumber(Number(ethers.formatUnits(usdtBalance, usdtDecimals))) : "—"}
            </p>
          </div>

          {/* KNIGHTS提现钱包 */}
          <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-violet-400" />
              <span className="text-slate-400 text-xs">KNIGHTS (提现钱包)</span>
            </div>
            <p className="text-white text-lg font-bold">
              {userStats ? formatNumber(userStats.balanceSeer) : "—"}
            </p>
          </div>

          {/* KNIGHTS投注钱包 */}
          <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={16} className="text-amber-400" />
              <span className="text-slate-400 text-xs">KNIGHTS (投注钱包)</span>
            </div>
            <p className="text-white text-lg font-bold">
              {userStats ? formatNumber(userStats.seerBetting) : "—"}
            </p>
          </div>

          {/* 待领取 */}
          <div className="bg-[#1A1532]/80 border border-indigo-500/20 rounded-xl p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <Gift size={16} className="text-violet-400" />
              <span className="text-slate-400 text-xs">待领取</span>
            </div>
            <p className="text-amber-400 text-lg font-bold">
              {userStats ? formatNumber(userStats.pendingRewards) : "—"}
            </p>
          </div>
        </div>
      )}

      {/* 开始按钮 */}
      {isConnected && !isRegistered && (
        <button
          onClick={onJoinClick}
          className="w-full py-4 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white font-bold text-lg rounded-xl transition-all transform active:scale-95 shadow-lg shadow-indigo-500/20"
        >
          开始挖矿 →
        </button>
      )}
    </div>
  );
};

export default StatsPanel;
