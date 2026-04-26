import { ethers } from "ethers";
import { ArrowDownLeft, ArrowUpRight, CheckCircle, Clock, Gift, History, Pickaxe, ShieldCheck, Star, UserPlus } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BLOCK_EXPLORER_URL } from "../src/constants";
import { useLanguage } from "../src/LanguageContext";
import { useWeb3 } from "../src/Web3Context";

type TxType = "register" | "miner_purchase" | "node_purchase" | "node_registered" | "node_reward_claim" | "node_rights_claim" | "mining_claim" | "referral_reward" | "checkin" | "withdrawal" | "airdrop";

interface DisplayTx {
  type: TxType;
  amount: string;
  token: string;
  timestamp: number;
  txHash?: string;
  label?: string; // 可覆盖默认标签
}

interface NodeIdentity {
  isNode: boolean;
  weight: number;   // 1=V1, 3=V2, 10=V3
  tier: string;     // "V1" | "V2" | "V3" | ""
  pendingReward: bigint;
  pendingNodeRights: bigint;
  rightsUnlockedBP: number;
  protectionUntil: number;
}

const WEIGHT_TO_TIER: Record<number, string> = { 1: "V1", 3: "V2", 10: "V3" };

const TX_ICONS: Record<TxType, React.ReactNode> = {
  register:       <UserPlus size={16} className="text-violet-400" />,
  miner_purchase: <Pickaxe size={16} className="text-amber-400" />,
  node_purchase:  <ShieldCheck size={16} className="text-indigo-400" />,
  node_registered:<Star size={16} className="text-yellow-400" />,
  node_reward_claim:<ArrowDownLeft size={16} className="text-emerald-400" />,
  node_rights_claim:<Star size={16} className="text-violet-300" />,
  mining_claim:   <ArrowDownLeft size={16} className="text-emerald-400" />,
  referral_reward:<Gift size={16} className="text-violet-400" />,
  checkin:        <CheckCircle size={16} className="text-cyan-400" />,
  withdrawal:     <ArrowUpRight size={16} className="text-rose-400" />,
  airdrop:        <Gift size={16} className="text-pink-400" />,
};

const TX_LABELS: Record<TxType, string> = {
  register:       "注册",
  miner_purchase: "购买矿机",
  node_purchase:  "购买节点",
  node_registered:"成为节点",
  node_reward_claim:"领取节点分红",
  node_rights_claim:"领取节点币权",
  mining_claim:   "领取挖矿收益",
  referral_reward:"推荐奖励",
  checkin:        "每日签到",
  withdrawal:     "提现",
  airdrop:        "空投领取",
};

const EARNING_TYPES: TxType[] = [
  "mining_claim",
  "node_reward_claim",
  "node_rights_claim",
  "referral_reward",
  "checkin",
  "airdrop",
];

const TransactionHistory: React.FC = () => {
  const { t } = useLanguage();
  const { account, isConnected, protocolContract, airdropContract, minerNodeContract, refreshBalances, usdtDecimals } = useWeb3();

  const [transactions, setTransactions] = useState<DisplayTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [nodeIdentity, setNodeIdentity] = useState<NodeIdentity | null>(null);
  const [totalEarnedSeer, setTotalEarnedSeer] = useState<bigint>(0n);
  const [claimingNodeReward, setClaimingNodeReward] = useState(false);
  const [claimingNodeRights, setClaimingNodeRights] = useState(false);

  const handleClaimNodeReward = async () => {
    if (!minerNodeContract) return;
    setClaimingNodeReward(true);
    try {
      toast.loading("领取节点分红中...", { id: "claim-node-reward" });
      const tx = await minerNodeContract.claimReward();
      await tx.wait();
      toast.dismiss("claim-node-reward");
      toast.success("节点分红领取成功");
      await refreshBalances();
      await fetchHistory();
    } catch (err: any) {
      toast.dismiss("claim-node-reward");
      toast.error(err?.reason || err?.message || "领取节点分红失败");
    } finally {
      setClaimingNodeReward(false);
    }
  };

  const handleClaimNodeRights = async () => {
    if (!minerNodeContract) return;
    setClaimingNodeRights(true);
    try {
      toast.loading("领取节点币权中...", { id: "claim-node-rights" });
      const tx = await minerNodeContract.claimNodeRights();
      await tx.wait();
      toast.dismiss("claim-node-rights");
      toast.success("节点币权领取成功");
      await refreshBalances();
      await fetchHistory();
    } catch (err: any) {
      toast.dismiss("claim-node-rights");
      toast.error(err?.reason || err?.message || "领取节点币权失败");
    } finally {
      setClaimingNodeRights(false);
    }
  };

  const fetchHistory = useCallback(async () => {
    if (!protocolContract || !account) return;
    setLoading(true);

    const txList: DisplayTx[] = [];
    let fetchedNodeIdentity: NodeIdentity | null = null;
    let maxPurchasedNodeTier = 0;
    const provider = protocolContract.runner?.provider || minerNodeContract?.runner?.provider;
    let latestBlock = 0;
    const getFromBlock = (lookbackBlocks: number) => Math.max(latestBlock - lookbackBlocks, 0);

    try {
      if (provider) {
        try {
          latestBlock = await provider.getBlockNumber();
        } catch {
          latestBlock = 0;
        }
      }

      // ── 用户总收益（链上累计）──────────────────────────────────
      try {
        const userInfo = await protocolContract.getUserInfo(account);
        setTotalEarnedSeer(BigInt(userInfo?.[7] || 0));
      } catch {
        setTotalEarnedSeer(0n);
      }

      // ── 查询节点身份 ────────────────────────────────────────────
      if (minerNodeContract) {
        try {
          const info = await minerNodeContract.nodes(account);
          const w = Number(info.weight || 0);
          let pendingNodeRights = 0n;
          let rightsUnlockedBP = 0;
          let protectionUntil = 0;

          try {
            const rightsInfo = await minerNodeContract.getNodeRightsInfo(account);
            pendingNodeRights = BigInt(rightsInfo.pending || 0);
            rightsUnlockedBP = Number(rightsInfo.unlockedBP || 0);
            protectionUntil = Number(rightsInfo.protectedUntil || 0);
          } catch {
            try {
              pendingNodeRights = await minerNodeContract.pendingNodeRights(account);
            } catch {}
          }

          fetchedNodeIdentity = {
            isNode: Boolean(info.isNode),
            weight: w,
            tier: WEIGHT_TO_TIER[w] || "",
            pendingReward: BigInt(info.pendingReward || 0),
            pendingNodeRights,
            rightsUnlockedBP,
            protectionUntil,
          };
        } catch {
          fetchedNodeIdentity = {
            isNode: false,
            weight: 0,
            tier: "",
            pendingReward: 0n,
            pendingNodeRights: 0n,
            rightsUnlockedBP: 0,
            protectionUntil: 0,
          };
        }
      }

      // ── 挖矿领取事件 ────────────────────────────────────────────
      try {
        const claimFilter = protocolContract.filters.MiningClaimed?.(account);
        if (claimFilter) {
          const events = await protocolContract.queryFilter(claimFilter, getFromBlock(10000));
          for (const e of events) {
            const parsed = e as any;
            txList.push({ type: "mining_claim", amount: ethers.formatEther(parsed.args?.[1] || 0), token: "KNIGHTS", timestamp: 0, txHash: parsed.transactionHash });
          }
        }
      } catch {}

      // ── 矿机/节点购买事件 ────────────────────────────────────────
      // tier: 0=Basic矿机, 1=V1节点, 2=V2节点, 3=V3节点
      try {
        const seerPurchaseByTx = new Map<string, { totalSeerPayment: bigint }>();

        const seerPurchaseFilter = protocolContract.filters.MinerPurchasedWithSEER?.(account);
        if (seerPurchaseFilter) {
          const seerEvents = await protocolContract.queryFilter(seerPurchaseFilter, getFromBlock(10000));
          for (const e of seerEvents) {
            const parsed = e as any;
            const seerAmount = BigInt(parsed.args?.[3] || 0);
            const seerFee = BigInt(parsed.args?.[4] || 0);
            seerPurchaseByTx.set(parsed.transactionHash, { totalSeerPayment: seerAmount + seerFee });
          }
        }

        const purchaseFilter = protocolContract.filters.MinerPurchased?.(account);
        if (purchaseFilter) {
          const events = await protocolContract.queryFilter(purchaseFilter, getFromBlock(10000));
          const tierNames = ["基础矿机", "V1", "V2", "V3"];
          for (const e of events) {
            const parsed = e as any;
            const tier = Number(parsed.args?.[1] || 0);
            const isNodeTier = tier >= 1;
            const seerPurchase = parsed.transactionHash ? seerPurchaseByTx.get(parsed.transactionHash) : undefined;
            if (isNodeTier) {
              maxPurchasedNodeTier = Math.max(maxPurchasedNodeTier, tier);
            }
            txList.push({
              type: isNodeTier ? "node_purchase" : "miner_purchase",
              amount: seerPurchase
                ? ethers.formatEther(seerPurchase.totalSeerPayment)
                : ethers.formatUnits(parsed.args?.[2] || 0, usdtDecimals),
              token: seerPurchase ? "KNIGHTS" : "USDT",
              timestamp: 0,
              txHash: parsed.transactionHash,
              label: isNodeTier
                ? `${seerPurchase ? "使用 KNIGHTS" : "购买"} ${tierNames[tier]} 节点`
                : `${seerPurchase ? "使用 KNIGHTS 购买" : "购买"}基础矿机`,
            });
          }
        }
      } catch {}

      // ── 赠送矿机事件 (节点购买后自动赠送) ──────────────────────
      try {
        const giftFilter = protocolContract.filters.MinerAutoGifted?.(account);
        if (giftFilter) {
          const events = await protocolContract.queryFilter(giftFilter, getFromBlock(10000));
          const tierNames = ["基础矿机", "V1矿机", "V2矿机", "V3矿机"];
          for (const e of events) {
            const parsed = e as any;
            const tierName = tierNames[Number(parsed.args?.[1] || 0)] || "矿机";
            txList.push({ type: "node_purchase", amount: "0", token: "USDT", timestamp: 0, txHash: parsed.transactionHash, label: `赠送 ${tierName}` });
          }
        }
      } catch {}

      // ── 节点注册事件 (MinerNode合约) ─────────────────────────────
      if (minerNodeContract) {
        try {
          const nodeRegFilter = minerNodeContract.filters.NodeRegistered?.(account);
          if (nodeRegFilter) {
            const events = await minerNodeContract.queryFilter(nodeRegFilter, getFromBlock(50000));
            const tierNames: Record<number, string> = { 1: "V1", 2: "V2", 3: "V3" };
            for (const e of events) {
              const parsed = e as any;
              const tier = Number(parsed.args?.[2] || 0);
              txList.push({
                type: "node_registered",
                amount: "0",
                token: "",
                timestamp: 0,
                txHash: parsed.transactionHash,
                label: `获得 ${tierNames[tier] || "节点"}节点身份`,
              });
            }
          }
        } catch {}

        try {
          const nodeRewardClaimFilter = minerNodeContract.filters.RewardClaimed?.(account);
          if (nodeRewardClaimFilter) {
            const events = await minerNodeContract.queryFilter(nodeRewardClaimFilter, getFromBlock(50000));
            for (const e of events) {
              const parsed = e as any;
              txList.push({
                type: "node_reward_claim",
                amount: ethers.formatEther(parsed.args?.[1] || 0),
                token: "KNIGHTS",
                timestamp: 0,
                txHash: parsed.transactionHash,
              });
            }
          }
        } catch {}

        try {
          const nodeRightsClaimFilter = minerNodeContract.filters.NodeRightsClaimed?.(account);
          if (nodeRightsClaimFilter) {
            const events = await minerNodeContract.queryFilter(nodeRightsClaimFilter, getFromBlock(50000));
            for (const e of events) {
              const parsed = e as any;
              txList.push({
                type: "node_rights_claim",
                amount: ethers.formatEther(parsed.args?.[1] || 0),
                token: "KNIGHTS",
                timestamp: 0,
                txHash: parsed.transactionHash,
              });
            }
          }
        } catch {}
      }

      // ── 推荐奖励事件 ────────────────────────────────────────────
      try {
        const rewardFilter = protocolContract.filters.ReferralReward?.(null, account);
        if (rewardFilter) {
          const events = await protocolContract.queryFilter(rewardFilter, getFromBlock(10000));
          for (const e of events) {
            const parsed = e as any;
            txList.push({ type: "referral_reward", amount: ethers.formatEther(parsed.args?.[2] || 0), token: "KNIGHTS", timestamp: 0, txHash: parsed.transactionHash });
          }
        }
      } catch {}

      // ── 级差奖励 ────────────────────────────────────────────────
      try {
        const diffFilter = protocolContract.filters.DifferentialReward?.(null, account);
        if (diffFilter) {
          const events = await protocolContract.queryFilter(diffFilter, getFromBlock(10000));
          for (const e of events) {
            const parsed = e as any;
            txList.push({ type: "referral_reward", amount: ethers.formatEther(parsed.args?.[2] || 0), token: "KNIGHTS", timestamp: 0, txHash: parsed.transactionHash });
          }
        }
      } catch {}

      // ── 平级奖励 ────────────────────────────────────────────────
      try {
        const equalFilter = protocolContract.filters.EqualLevelBonus?.(null, account);
        if (equalFilter) {
          const events = await protocolContract.queryFilter(equalFilter, getFromBlock(10000));
          for (const e of events) {
            const parsed = e as any;
            txList.push({ type: "referral_reward", amount: ethers.formatEther(parsed.args?.[2] || 0), token: "KNIGHTS", timestamp: 0, txHash: parsed.transactionHash });
          }
        }
      } catch {}

      // ── 社区税奖励 ──────────────────────────────────────────────
      try {
        const taxFilter = protocolContract.filters.CommunityTax?.(null, account);
        if (taxFilter) {
          const events = await protocolContract.queryFilter(taxFilter, getFromBlock(10000));
          for (const e of events) {
            const parsed = e as any;
            txList.push({ type: "referral_reward", amount: ethers.formatEther(parsed.args?.[2] || 0), token: "KNIGHTS", timestamp: 0, txHash: parsed.transactionHash });
          }
        }
      } catch {}

      // ── 提现事件 ────────────────────────────────────────────────
      try {
        const withdrawFilter = protocolContract.filters.Withdrawal?.(account);
        if (withdrawFilter) {
          const events = await protocolContract.queryFilter(withdrawFilter, getFromBlock(10000));
          for (const e of events) {
            const parsed = e as any;
            txList.push({ type: "withdrawal", amount: ethers.formatEther(parsed.args?.[1] || 0), token: "KNIGHTS", timestamp: 0, txHash: parsed.transactionHash });
          }
        }
      } catch {}

      // ── 签到事件 ────────────────────────────────────────────────
      try {
        const checkinFilter = protocolContract.filters.DailyCheckin?.(account);
        if (checkinFilter) {
          const events = await protocolContract.queryFilter(checkinFilter, getFromBlock(10000));
          for (const e of events) {
            const parsed = e as any;
            txList.push({ type: "checkin", amount: ethers.formatEther(parsed.args?.[1] || 0), token: "KNIGHTS", timestamp: 0, txHash: parsed.transactionHash });
          }
        }
      } catch {}

      // ── 注册事件 ────────────────────────────────────────────────
      try {
        const regFilter = protocolContract.filters.UserRegistered?.(account);
        if (regFilter) {
          const events = await protocolContract.queryFilter(regFilter, getFromBlock(10000));
          for (const e of events) {
            const parsed = e as any;
            txList.push({ type: "register", amount: "0", token: "KNIGHTS", timestamp: Number(parsed.args?.[2] || 0), txHash: parsed.transactionHash });
          }
        }
      } catch {}

      // ── 获取区块时间戳 ───────────────────────────────────────────
      if (txList.length > 0 && provider) {
        for (const tx of txList) {
          if (tx.txHash && tx.timestamp === 0) {
            try {
              const receipt = await provider.getTransactionReceipt(tx.txHash);
              if (receipt?.blockNumber) {
                const block = await provider.getBlock(receipt.blockNumber);
                tx.timestamp = block?.timestamp || 0;
              }
            } catch {}
          }
        }
      }

      // 节点身份兜底：只要有节点购买记录，立即展示节点身份
      if (!fetchedNodeIdentity || !fetchedNodeIdentity.isNode) {
        if (maxPurchasedNodeTier > 0) {
          const inferredWeight = maxPurchasedNodeTier === 3 ? 10 : maxPurchasedNodeTier === 2 ? 3 : 1;
          fetchedNodeIdentity = {
            isNode: true,
            weight: inferredWeight,
            tier: maxPurchasedNodeTier === 3 ? "V3" : maxPurchasedNodeTier === 2 ? "V2" : "V1",
            pendingReward: 0n,
            pendingNodeRights: 0n,
            rightsUnlockedBP: 0,
            protectionUntil: 0,
          };
        }
      }

      if (fetchedNodeIdentity) {
        setNodeIdentity(fetchedNodeIdentity);
      }

      txList.sort((a, b) => b.timestamp - a.timestamp);
      setTransactions(txList);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setLoading(false);
    }
  }, [protocolContract, airdropContract, minerNodeContract, account]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatTime = (ts: number) => {
    if (!ts) return "—";
    const d = new Date(ts * 1000);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const earningTransactions = transactions.filter((tx) => EARNING_TYPES.includes(tx.type));
  const earningTotalByRecords = earningTransactions.reduce((sum, tx) => {
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    return sum + amount;
  }, 0);

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <History size={48} className="text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">请连接钱包后查看记录</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* 标题栏 */}
      <div className="bg-gradient-to-r from-[#1A1532]/80 to-[#13102B]/80 border border-indigo-500/15 rounded-2xl p-6 backdrop-blur-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <History size={22} className="text-slate-400" /> 交易记录
          </h2>
          <p className="text-slate-500 text-sm mt-1">链上事件日志</p>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="text-slate-400 hover:text-white transition-colors p-2"
        >
          <Clock size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 节点身份卡片 */}
      {nodeIdentity && (
        <div className={`border rounded-2xl p-5 backdrop-blur-sm ${
          nodeIdentity.isNode
            ? "bg-gradient-to-br from-indigo-900/40 to-violet-900/30 border-indigo-500/30"
            : "bg-[#1A1532]/60 border-slate-700/30"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                nodeIdentity.isNode ? "bg-indigo-500/20" : "bg-slate-700/40"
              }`}>
                <ShieldCheck size={20} className={nodeIdentity.isNode ? "text-indigo-300" : "text-slate-500"} />
              </div>
              <div>
                <p className="text-white font-bold text-sm">
                  节点身份
                  {nodeIdentity.isNode && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                      {nodeIdentity.tier} 节点
                    </span>
                  )}
                </p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {nodeIdentity.isNode
                    ? `权重 ${nodeIdentity.weight} · 持有节点，团队页按较高等级展示当前身份`
                    : "尚未持有节点身份"}
                </p>
                {nodeIdentity.isNode && (
                  <>
                    <p className="text-slate-500 text-[11px] mt-1">
                      节点币权解锁进度：{(nodeIdentity.rightsUnlockedBP / 100).toFixed(2)}%
                    </p>
                    <p className="text-slate-500 text-[11px] mt-1">
                      保护期截至：{nodeIdentity.protectionUntil ? formatTime(nodeIdentity.protectionUntil) : "-"}
                    </p>
                  </>
                )}
              </div>
            </div>
            {nodeIdentity.isNode && (
              <div className="text-right">
                <p className="text-[10px] text-slate-500">待领节点分红</p>
                <p className="text-emerald-400 font-bold text-sm">
                  +{Number(ethers.formatEther(nodeIdentity.pendingReward)).toLocaleString("en-US", { maximumFractionDigits: 4 })} KNIGHTS
                </p>
                <p className="text-[10px] text-slate-500 mt-1">待领节点币权</p>
                <p className="text-violet-300 font-bold text-sm">
                  +{Number(ethers.formatEther(nodeIdentity.pendingNodeRights)).toLocaleString("en-US", { maximumFractionDigits: 4 })} KNIGHTS
                </p>
                <div className="mt-2 flex gap-2 justify-end">
                  <button
                    onClick={handleClaimNodeReward}
                    disabled={claimingNodeReward || nodeIdentity.pendingReward === 0n}
                    className="px-2 py-1 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {claimingNodeReward ? "领取中..." : "领取分红"}
                  </button>
                  <button
                    onClick={handleClaimNodeRights}
                    disabled={claimingNodeRights || nodeIdentity.pendingNodeRights === 0n}
                    className="px-2 py-1 rounded-md text-[11px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {claimingNodeRights ? "领取中..." : "领取币权"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 记录列表 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 backdrop-blur-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <p className="text-slate-400 text-xs">用户总收益记录（链上累计）</p>
            <p className="text-emerald-400 font-black text-xl mt-1">
              {Number(ethers.formatEther(totalEarnedSeer)).toLocaleString("en-US", { maximumFractionDigits: 4 })} KNIGHTS
            </p>
          </div>
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
            <p className="text-slate-400 text-xs">收益记录合计（当前列表）</p>
            <p className="text-violet-300 font-black text-xl mt-1">
              {earningTotalByRecords.toLocaleString("en-US", { maximumFractionDigits: 4 })} KNIGHTS
            </p>
          </div>
        </div>
      </div>

      <div className="bg-[#1A1532]/80 border border-indigo-500/10 rounded-2xl p-4">
        <p className="text-white text-sm font-bold mb-3">用户收益记录</p>
        {loading ? (
          <p className="text-slate-500 text-sm">加载中...</p>
        ) : earningTransactions.length === 0 ? (
          <p className="text-slate-500 text-sm">暂无收益记录</p>
        ) : (
          <div className="space-y-2">
            {earningTransactions.map((tx, idx) => (
              <div key={`earning-${idx}`} className="bg-[#13102B]/70 border border-indigo-500/10 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#1A1532] flex items-center justify-center">{TX_ICONS[tx.type]}</div>
                  <div>
                    <p className="text-white text-xs font-bold">{tx.label || TX_LABELS[tx.type]}</p>
                    <p className="text-slate-500 text-[11px]">{formatTime(tx.timestamp)}</p>
                  </div>
                </div>
                <p className="text-emerald-400 text-xs font-bold">+{Number(tx.amount).toLocaleString("en-US", { maximumFractionDigits: 4 })} {tx.token}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-slate-500 text-sm">加载链上事件...</p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16">
          <History size={40} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-500">暂无交易记录</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx, idx) => {
            const isDebit = tx.type === "withdrawal" || tx.type === "miner_purchase" || tx.type === "node_purchase";
            const isFree = tx.type === "node_registered" || (tx.type === "node_purchase" && tx.amount === "0");
            const showAmount = !isFree && Number(tx.amount) > 0;
            return (
              <div
                key={idx}
                className={`bg-[#1A1532]/80 border rounded-xl p-4 flex items-center justify-between hover:border-indigo-500/25 transition-colors ${
                  tx.type === "node_purchase" || tx.type === "node_registered"
                    ? "border-indigo-500/20"
                    : "border-indigo-500/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#13102B] flex items-center justify-center shrink-0">
                    {TX_ICONS[tx.type]}
                  </div>
                  <div>
                    <p className="text-white text-sm font-bold">{tx.label || TX_LABELS[tx.type]}</p>
                    <p className="text-slate-500 text-xs">{formatTime(tx.timestamp)}</p>
                  </div>
                </div>
                <div className="text-right">
                  {showAmount ? (
                    <p className={`font-bold text-sm ${isDebit ? "text-rose-400" : "text-emerald-400"}`}>
                      {isDebit ? "-" : "+"}{Number(tx.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} {tx.token}
                    </p>
                  ) : isFree ? (
                    <p className="text-indigo-300 text-xs font-bold">已赠送</p>
                  ) : null}
                  {tx.txHash && (
                    <a
                      href={`${BLOCK_EXPLORER_URL}/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-400/60 text-[10px] hover:text-violet-400 transition-colors"
                    >
                      {tx.txHash.slice(0, 10)}...
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
