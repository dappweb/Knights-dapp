import { ethers } from "ethers";
import { AlertTriangle, Award, CheckCircle, Clock, HelpCircle, Link2, Lock, Pickaxe, TrendingUp, UserPlus, Wallet, Zap } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useLanguage } from "../src/LanguageContext";
import { useWeb3 } from "../src/Web3Context";
import { MINER_PURCHASE_LIMITS, MINER_TIERS, NODE_PURCHASE_LIMITS } from "../src/constants";
import { MinerInfo, MinerTier, MinerTierConfig } from "../src/types";
import AnimatedButton from "./AnimatedButton";
import ReferrerGuide from "./ReferrerGuide";

const LEGACY_MINER_ABI = [
  "function getUserMinerCount(address) view returns (uint256)",
  "function getUserMiner(address,uint256) view returns (tuple(uint8 tier,uint256 costUsdt,uint256 purchaseTime,uint256 dailyOutput,uint256 lastClaimTime,uint256 totalClaimed,bool active))",
] as const;

const NODE_PHASE_MINER_RESTRICTED_SELECTOR = "0x8d3a9d6d";

const formatPurchaseError = (err: any): string => {
  const reason = String(err?.reason || "");
  const shortMessage = String(err?.shortMessage || "");
  const message = String(err?.message || "");
  const rawData = String(err?.data || err?.error?.data || "").toLowerCase();
  const merged = `${reason} ${shortMessage} ${message} ${rawData}`.toLowerCase();

  if (merged.includes(NODE_PHASE_MINER_RESTRICTED_SELECTOR)) {
    return "当前为节点招募阶段，基础矿机暂不可购买，请选择 V1/V2/V3 节点";
  }
  if (merged.includes("minerpurchaselimitexceeded") || merged.includes("purchaselimitexceeded")) {
    return "节点招募阶段该档位已达购买上限，请等待矿机销售阶段或选择其他档位";
  }
  if (merged.includes("notregistered") || merged.includes("not registered")) {
    return "请先绑定推荐人并完成注册";
  }
  if (merged.includes("insufficient") || merged.includes("余额不足")) {
    return "余额不足，无法购买";
  }
  if (merged.includes("paused") || merged.includes("protocolpausederror")) {
    return "协议已暂停，请稍后重试";
  }
  if (merged.includes("nodesaleclosed")) {
    return "节点销售已关闭，请联系管理员";
  }
  if (merged.includes("minersaleclosed")) {
    return "矿机销售已关闭，请联系管理员";
  }
  if (merged.includes("minertiersoldsout") || merged.includes("minertiersolded")) {
    return "该档位节点已售罄";
  }

  return reason || shortMessage || message || "购买失败";
};

const MiningPanel: React.FC = () => {
  useLanguage();
  const {
    account, isConnected, protocolContract, usdtContract,
    usdtBalance, refreshBalances, isRegistered, hasReferrer,
    usdtDecimals,
    isRegistering, registerError, retryRegister
  } = useWeb3();

  const [selectedTier, setSelectedTier] = useState<MinerTier>(MinerTier.Basic);
  const [tierConfigs, setTierConfigs] = useState<MinerTierConfig[]>(MINER_TIERS);
  const [userMiners, setUserMiners] = useState<MinerInfo[]>([]);
  const [minerVaultInfo, setMinerVaultInfo] = useState<{vaultA_daily:bigint;vaultB_daily:bigint;bPaused:boolean}[]>([]);
  const [minerPendingRewards, setMinerPendingRewards] = useState<bigint[]>([]);
  const [pendingRewards, setPendingRewards] = useState<bigint>(0n);
  const [canCheckin, setCanCheckin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [purchasingUSDT, setPurchasingUSDT] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimingMinerId, setClaimingMinerId] = useState<number | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const isAnyClaiming = claiming || claimingMinerId !== null;

  // 推荐人手动绑定
  const [inputReferrer, setInputReferrer] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [salePhase, setSalePhase] = useState<number | null>(null);
  const availableTierConfigs = tierConfigs.length > 0 ? tierConfigs : MINER_TIERS;
  // salePhase=null 时（尚未加载）保守默认为 NODE_PHASE，避免用户点击 Basic 后合约拒绝
  const isNodePhase = salePhase === null || salePhase === 0;
  const salePhaseLoaded = salePhase !== null;

  const getTierAvailability = useCallback((tier: MinerTier) => {
    const tierConfig = availableTierConfigs.find((item) => item.tier === tier);
    // 节点招募阶段使用 NODE_PURCHASE_LIMITS（V1=3, V2=1, V3=1），矿机阶段无限制
    const limit = isNodePhase
      ? (NODE_PURCHASE_LIMITS[tier as keyof typeof NODE_PURCHASE_LIMITS] ?? 0)
      : MINER_PURCHASE_LIMITS[tier];
    const purchasedCount = countMinersOfTier(tier);
    const giftedCount = getTotalMinersOfTier(tier) - purchasedCount;
    const reachedLimit = limit > 0 && purchasedCount >= limit;
    const soldCount = tierConfig?.soldCount ?? 0;
    const maxSupply = tierConfig?.maxSupply ?? 0;
    const soldOut = maxSupply > 0 && soldCount >= maxSupply;
    const disabled = tierConfig?.enabled === false;
    const nodePhaseRestricted = isNodePhase && tier === MinerTier.Basic;

    return {
      tierConfig,
      purchasedCount,
      giftedCount,
      reachedLimit,
      soldOut,
      disabled,
      nodePhaseRestricted,
      unavailable: reachedLimit || soldOut || disabled || nodePhaseRestricted,
    };
  }, [availableTierConfigs, userMiners, isNodePhase]);

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

  // 使用手动输入地址注册
  const handleBindManual = async () => {
    const addr = inputReferrer.trim();
    if (!addr) { setInputError("请输入推荐人地址"); return; }
    if (!ethers.isAddress(addr)) { setInputError("地址格式不正确"); return; }
    if (account && addr.toLowerCase() === account.toLowerCase()) {
      setInputError("不能使用自己的地址作为推荐人"); return;
    }
    setInputError(null);
    localStorage.setItem("pendingReferrer", addr);
    localStorage.removeItem("allowDefaultReferrer");
    await retryRegister();
  };

  // 使用平台默认推荐人注册（清空 localStorage，让 Context fallback 到 ROOT/owner）
  const handleBindDefault = async () => {
    setInputError(null);
    localStorage.removeItem("pendingReferrer");
    localStorage.setItem("allowDefaultReferrer", "1");
    await retryRegister();
  };

  // 从指引中选择选项
  const handleGuideSelect = async (option: 'manual' | 'default') => {
    setShowGuide(false);
    if (option === 'manual') {
      // 焦点到输入框
      setTimeout(() => {
        const input = document.querySelector('input[placeholder="0x..."]') as HTMLInputElement;
        if (input) input.focus();
      }, 100);
    } else {
      await handleBindDefault();
    }
  };

  // 获取用户矿机数据
  const fetchMinerData = useCallback(async () => {
    if (!protocolContract || !account) return;
    setLoading(true);
    try {
      const count = await protocolContract.getUserMinerCount(account);
      const miners: MinerInfo[] = [];

      try {
        for (let i = 0; i < Number(count); i++) {
          const m = await protocolContract.getUserMiner(account, i);
          miners.push({
            tier: Number(m[0]) as MinerTier,
            costUsdt: m[1],
            vaultA_usdt: m[2],
            vaultB_usdt: m[3],
            purchaseTime: m[4],
            lastClaimTime: m[5],
            totalClaimed: m[6],
            cycleDays: m[7],
            active: m[8],
            isAutoGifted: m[9],
            vaultA_initialUsdt: m[10],
            vaultB_initialUsdt: m[11],
            aReleasedDays: m[12],
            bReleasedDays: m[13],
          });
        }
      } catch (decodeErr: any) {
        const protocolAddress = await protocolContract.getAddress();
        const legacyReader = new ethers.Contract(
          protocolAddress,
          LEGACY_MINER_ABI,
          protocolContract.runner
        );

        for (let i = 0; i < Number(count); i++) {
          const legacyMiner = await legacyReader.getUserMiner(account, i);
          const tierNum = Number(legacyMiner[0]) as MinerTier;
          // Fallback: derive cycleDays from MINER_TIERS config when chain field is missing
          const defaultCycleDays = BigInt(availableTierConfigs.find(t => t.tier === tierNum)?.cycleDays ?? 100);
          miners.push({
            tier: tierNum,
            costUsdt: legacyMiner[1],
            vaultA_usdt: 0n,
            vaultB_usdt: 0n,
            purchaseTime: legacyMiner[2],
            lastClaimTime: legacyMiner[4],
            totalClaimed: legacyMiner[5],
            cycleDays: defaultCycleDays,
            active: legacyMiner[6],
            isAutoGifted: false,
            vaultA_initialUsdt: 0n,
            vaultB_initialUsdt: 0n,
            aReleasedDays: 0n,
            bReleasedDays: 0n,
          });
        }

        console.warn("Using legacy miner ABI fallback for getUserMiner", decodeErr);
      }

      setUserMiners(miners);

      // Fetch per-miner vault details (bPaused status, daily output)
      const vaultInfos: {vaultA_daily:bigint;vaultB_daily:bigint;bPaused:boolean}[] = [];
      const pendingByMiner: bigint[] = [];
      for (let i = 0; i < miners.length; i++) {
        try {
          const vi = await protocolContract.getMinerVaultInfo(account, i);
          vaultInfos.push({ vaultA_daily: vi[2], vaultB_daily: vi[3], bPaused: vi[4] });
        } catch {
          vaultInfos.push({ vaultA_daily: 0n, vaultB_daily: 0n, bPaused: false });
        }

        try {
          const pendingInfo = await protocolContract.getPendingRewardByMiner(account, i);
          pendingByMiner.push(BigInt(pendingInfo[0] || 0));
        } catch {
          pendingByMiner.push(0n);
        }
      }
      setMinerVaultInfo(vaultInfos);
      setMinerPendingRewards(pendingByMiner);

      const pending = await protocolContract.getPendingRewards(account);
      setPendingRewards(pending);

      const cc = await protocolContract.canCheckin(account);
      setCanCheckin(cc);
    } catch (err) {
      console.error("Failed to fetch miner data:", err);
    } finally {
      setLoading(false);
    }
  }, [protocolContract, account, availableTierConfigs]);

  // 计算用户指定等级的矿机数 (仅用于购买限额检查，不计算赠送矿机)
  const countMinersOfTier = (tier: MinerTier): number => {
    return userMiners.filter(m => m.tier === tier && !m.isAutoGifted).length;
  };

  // 获取用户指定等级的总矿机数 (包括赠送矿机)
  const getTotalMinersOfTier = (tier: MinerTier): number => {
    return userMiners.filter(m => m.tier === tier).length;
  };

  // 检查是否可以购买指定等级矿机
  const canPurchaseTier = (tier: MinerTier): boolean => {
    return !getTierAvailability(tier).unavailable;
  };

  // 获取购买限额提示信息
  const getPurchaseLimitHint = (tier: MinerTier): string | null => {
    const { tierConfig, purchasedCount, reachedLimit, soldOut, disabled, nodePhaseRestricted } = getTierAvailability(tier);
    if (nodePhaseRestricted) {
      return "当前为节点招募阶段，基础矿机暂不可购买，请选择 V1/V2/V3 节点";
    }
    if (disabled) {
      return `${tierConfig?.name || "该档位矿机"} 已下架`;
    }
    if (soldOut) {
      return `${tierConfig?.name || "该档位矿机"} 已售罄`;
    }

    // 节点阶段使用 NODE_PURCHASE_LIMITS，矿机阶段使用 MINER_PURCHASE_LIMITS
    const limit = isNodePhase
      ? (NODE_PURCHASE_LIMITS[tier as keyof typeof NODE_PURCHASE_LIMITS] ?? 0)
      : MINER_PURCHASE_LIMITS[tier];

    if (limit === 0) {
      if ((tierConfig?.maxSupply ?? 0) > 0) {
        return `链上库存 ${tierConfig?.soldCount ?? 0}/${tierConfig?.maxSupply ?? 0}`;
      }
      return null;
    }

    if (reachedLimit) {
      return `节点招募阶段该档位已达购买上限 (${purchasedCount}/${limit})，矿机销售阶段可无限购`;
    }
    return `节点招募阶段还可购买 ${limit - purchasedCount} 台`;
  };

  useEffect(() => {
    fetchTierConfigs();
  }, [fetchTierConfigs]);

  useEffect(() => {
    let cancelled = false;

    const fetchSalePhase = async () => {
      if (!protocolContract) {
        if (!cancelled) setSalePhase(null);
        return;
      }
      try {
        const phase = await protocolContract.salePhase();
        if (!cancelled) setSalePhase(Number(phase));
      } catch {
        if (!cancelled) setSalePhase(null);
      }
    };

    fetchSalePhase();
    return () => {
      cancelled = true;
    };
  }, [protocolContract]);

  useEffect(() => {
    fetchMinerData();
  }, [fetchMinerData]);



  useEffect(() => {
    const handleMinerStatusChanged = () => {
      fetchMinerData();
    };

    window.addEventListener("minerStatusChanged", handleMinerStatusChanged);
    return () => window.removeEventListener("minerStatusChanged", handleMinerStatusChanged);
  }, [fetchMinerData]);

  // USDT 购买矿机
  const handlePurchaseWithUSDT = async () => {
    if (!protocolContract || !usdtContract || !account) return;
    const tier = availableTierConfigs.find((t) => t.tier === selectedTier);
    if (!tier) return;
    if (getTierAvailability(selectedTier).nodePhaseRestricted) {
      toast.error("当前为节点招募阶段，基础矿机暂不可购买，请选择 V1/V2/V3 节点");
      return;
    }
    if (getTierAvailability(selectedTier).reachedLimit) {
      toast.error("节点招募阶段该档位已达购买上限，请等待矿机销售阶段或选择其他档位");
      return;
    }

    setPurchasingUSDT(true);
    try {
      const costWei = ethers.parseUnits(tier.costUsdt.toString(), usdtDecimals);

      // 先授权 USDT
      const protocolAddr = await protocolContract.getAddress();
      const allowance = await usdtContract.allowance(account, protocolAddr);
      if (allowance < costWei) {
        toast.loading("授权 USDT...", { id: "approve" });
        const approveTx = await usdtContract.approve(protocolAddr, costWei);
        await approveTx.wait();
        toast.dismiss("approve");
      }

      // 购买
      toast.loading("购买矿机...", { id: "purchase" });
      const tx = await protocolContract.purchaseMiner(selectedTier);
      await tx.wait();
      toast.dismiss("purchase");
      toast.success(`成功购买 ${tier.name}!`);

      await fetchMinerData();
      await refreshBalances();
    } catch (err: any) {
      toast.dismiss("approve");
      toast.dismiss("purchase");
      toast.error(formatPurchaseError(err));
      console.error("Purchase failed:", err);
    } finally {
      setPurchasingUSDT(false);
    }
  };

  // 领取挖矿收益
  const handleClaim = async () => {
    if (!protocolContract) return;
    if (claimingMinerId !== null) return;
    setClaiming(true);
    try {
      toast.loading("领取收益...", { id: "claim" });
      const tx = await protocolContract.claimMining();
      await tx.wait();
      toast.dismiss("claim");
      toast.success("收益已领取!");

      await fetchMinerData();
      await refreshBalances();
    } catch (err: any) {
      toast.dismiss("claim");
      toast.error(err?.reason || err?.message || "领取失败");
    } finally {
      setClaiming(false);
    }
  };

  // 按单台矿机领取
  const handleClaimByMiner = async (minerId: number) => {
    if (!protocolContract) return;
    if (!account) return;
    if (claiming || claimingMinerId !== null) return;

    const getErrorMessage = (err: any): string => {
      return err?.shortMessage || err?.reason || err?.message || "单台领取失败";
    };

    setClaimingMinerId(minerId);
    try {
      // 先做一次链上待领取校验，避免“点击无反馈”
      try {
        const pendingInfo = await protocolContract.getPendingRewardByMiner(account, minerId);
        const pending = BigInt(pendingInfo?.[0] || 0);
        if (pending <= 0n) {
          toast.error("该矿机暂无可领取收益");
          return;
        }
      } catch {
        // 兼容旧合约: 无法按单矿机读取待领取时，继续执行领取流程
      }

      toast.loading("领取该矿机收益...", { id: `claim-miner-${minerId}` });
      let tx;
      try {
        tx = await protocolContract.claimMiningByMiner(minerId);
      } catch (claimByMinerErr: any) {
        const msg = getErrorMessage(claimByMinerErr).toLowerCase();
        const unsupportedSingleClaim =
          msg.includes("claimminingbyminer is not a function") ||
          msg.includes("function selector was not recognized") ||
          msg.includes("unknown function") ||
          msg.includes("unsupported");

        if (!unsupportedSingleClaim) {
          throw claimByMinerErr;
        }

        toast.dismiss(`claim-miner-${minerId}`);
        toast.loading("当前合约不支持单台领取，已切换为全部领取...", { id: "claim-fallback" });
        tx = await protocolContract.claimMining();
      }

      await tx.wait();
      toast.dismiss(`claim-miner-${minerId}`);
      toast.dismiss("claim-fallback");
      toast.success(`矿机 #${minerId + 1} 收益已领取`);

      await fetchMinerData();
      await refreshBalances();
    } catch (err: any) {
      toast.dismiss(`claim-miner-${minerId}`);
      toast.dismiss("claim-fallback");
      toast.error(getErrorMessage(err));
    } finally {
      setClaimingMinerId(null);
    }
  };

  // 每日签到
  const handleCheckin = async () => {
    if (!protocolContract) return;
    setCheckingIn(true);
    try {
      toast.loading("签到中...", { id: "checkin" });
      const tx = await protocolContract.dailyCheckin();
      await tx.wait();
      toast.dismiss("checkin");
      toast.success("签到成功!");

      await fetchMinerData();
      await refreshBalances();
    } catch (err: any) {
      toast.dismiss("checkin");
      toast.error(err?.reason || err?.message || "签到失败");
    } finally {
      setCheckingIn(false);
    }
  };

  const formatNumber = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });
  const formatDateTime = (timestamp: bigint) => {
    if (!timestamp || timestamp <= 0n) return "--";
    const date = new Date(Number(timestamp) * 1000);
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    const hh = `${date.getHours()}`.padStart(2, "0");
    const mm = `${date.getMinutes()}`.padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}`;
  };

  const sortedMiners = userMiners
    .map((miner, chainIndex) => ({ miner, chainIndex }))
    .sort((a, b) => {
      if (a.miner.purchaseTime === b.miner.purchaseTime) {
        return b.chainIndex - a.chainIndex;
      }
      return a.miner.purchaseTime > b.miner.purchaseTime ? -1 : 1;
    });

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        {/* 标题 */}
        <div className="bg-gradient-to-r from-indigo-900/40 to-violet-900/40 border border-indigo-500/15 rounded-2xl p-6 backdrop-blur-sm">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Pickaxe size={22} className="text-violet-400" /> 矿机中心
          </h2>
          <p className="text-slate-400 text-sm mt-1">投入USDT · 购买矿机 · 产出KNIGHTS</p>
          <p className="text-amber-400 text-sm mt-3 flex items-center gap-1">
            <Wallet size={14} /> 连接钱包后即可购买矿机
          </p>
        </div>

        {/* 矿机类型介绍 */}
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Zap size={16} className="text-amber-400" /> 矿机类型
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {availableTierConfigs.map((tier) => (
              <div key={tier.tier} className="p-4 rounded-xl border-2 border-indigo-500/15 bg-[#13102B]/50">
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

        {/* 挖矿流程说明 */}
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" /> 挖矿流程
          </h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-black text-white flex-shrink-0">1</div>
              <div>
                <p className="text-white text-sm font-bold">注册账户</p>
                <p className="text-slate-400 text-xs">通过推荐链接注册，获得 20 KNIGHTS 空投奖励</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-black text-white flex-shrink-0">2</div>
              <div>
                <p className="text-white text-sm font-bold">购买矿机</p>
                <p className="text-slate-400 text-xs">使用 USDT 购买不同等级矿机，价格从 100U 到 10,000U</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-black text-white flex-shrink-0">3</div>
              <div>
                <p className="text-white text-sm font-bold">每日签到</p>
                <p className="text-slate-400 text-xs">每日签到获得持仓量 0.5% 的 KNIGHTS 奖励</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-black text-white flex-shrink-0">4</div>
              <div>
                <p className="text-white text-sm font-bold">领取收益</p>
                <p className="text-slate-400 text-xs">矿机按双仓规则释放：A仓100%进提现，B仓70%进提现、30%进投注钱包</p>
              </div>
            </div>
          </div>
        </div>

        {/* 产出计算示例 */}
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Lock size={16} className="text-amber-400" /> 收益示例
          </h3>
          <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4">
            <p className="text-slate-300 text-sm mb-2">以 <span className="text-amber-400 font-bold">V2 矿机</span> 为例：</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#0F0B1E]/60 rounded-lg p-3">
                <p className="text-slate-400">投入成本</p>
                <p className="text-white font-bold text-sm">3,000 USDT</p>
              </div>
              <div className="bg-[#0F0B1E]/60 rounded-lg p-3">
                <p className="text-slate-400">B仓上限</p>
                <p className="text-emerald-400 font-bold text-sm">4,500 USDT 等值</p>
              </div>
              <div className="bg-[#0F0B1E]/60 rounded-lg p-3">
                <p className="text-slate-400">产出周期</p>
                <p className="text-white font-bold text-sm">60 天</p>
              </div>
              <div className="bg-[#0F0B1E]/60 rounded-lg p-3">
                <p className="text-slate-400">B仓分配</p>
                <p className="text-violet-400 font-bold text-sm">70% 提现 / 30% 投注</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* 标题 */}
      <div className="bg-gradient-to-r from-indigo-900/40 to-violet-900/40 border border-indigo-500/15 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Pickaxe size={22} className="text-violet-400" /> 矿机中心
        </h2>
        <p className="text-slate-400 text-sm mt-1">投入USDT/KNIGHTS · 购买矿机 · 产出KNIGHTS</p>
      </div>

      {/* 待领取收益 */}
      {pendingRewards > 0n && (
        <div className="bg-indigo-900/30 border border-indigo-500/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <span className="text-slate-400 text-xs">待领取收益</span>
            <p className="text-xl font-bold text-amber-400">
              {formatNumber(Number(ethers.formatEther(pendingRewards)))} KNIGHTS
            </p>
            <p className="text-slate-500 text-xs">B仓收益 70% 进提现，30% 进投注钱包</p>
          </div>
          <AnimatedButton
            onClick={handleClaim}
            loading={claiming}
            disabled={isAnyClaiming}
            variant="primary"
            className="px-6"
          >
            领取
          </AnimatedButton>
        </div>
      )}

      {/* 每日签到 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle size={20} className={canCheckin ? "text-emerald-400" : "text-slate-600"} />
          <div>
            <span className="text-white text-sm font-bold">每日签到</span>
            <p className="text-slate-500 text-xs">获得持仓量0.5%奖励</p>
          </div>
        </div>
        <AnimatedButton
          onClick={handleCheckin}
          loading={checkingIn}
          disabled={!canCheckin}
          variant={canCheckin ? "success" : "secondary"}
          className="px-6"
        >
          {canCheckin ? "签到" : "已签"}
        </AnimatedButton>
      </div>

      {/* 矿机选购 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Zap size={18} className="text-amber-400" /> 购买矿机
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {availableTierConfigs.map((tier) => {
            const limit = MINER_PURCHASE_LIMITS[tier.tier];
            const {
              purchasedCount,
              giftedCount,
              reachedLimit,
              soldOut,
              disabled,
              nodePhaseRestricted,
              unavailable,
            } = getTierAvailability(tier.tier);
            
            return (
              <button
                key={tier.tier}
                onClick={() => setSelectedTier(tier.tier)}
                disabled={unavailable}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  unavailable
                    ? "border-red-500/50 bg-red-500/5 opacity-60 cursor-not-allowed"
                    : selectedTier === tier.tier
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-indigo-500/15 hover:border-indigo-500/40 bg-[#1A1532]/50"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-white font-bold text-sm">{tier.name}</p>
                    <p className="text-amber-400 text-lg font-black mt-1">{tier.costUsdt.toLocaleString()} U</p>
                    <p className="text-slate-400 text-xs mt-1">
                      {tier.cycleDays > 0 ? `${tier.cycleDays}天 / ${tier.multiplier}x` : "永久 / 1.0x"}
                    </p>
                    {typeof tier.bVaultUsdt === "number" && (
                      <p className="text-green-400 text-xs mt-0.5">B仓上限 {tier.bVaultUsdt.toLocaleString()} U</p>
                    )}
                    {disabled && <p className="text-rose-400 text-xs mt-1">已下架</p>}
                    {!disabled && soldOut && <p className="text-rose-400 text-xs mt-1">已售罄</p>}
                    {nodePhaseRestricted && <p className="text-amber-400 text-xs mt-1">节点招募阶段不可购买</p>}
                    {!disabled && !soldOut && typeof tier.maxSupply === "number" && tier.maxSupply > 0 && (
                      <p className="text-slate-500 text-xs mt-1">链上库存 {tier.soldCount ?? 0}/{tier.maxSupply}</p>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 text-right">
                    {limit > 0 && (
                      <p className={reachedLimit ? "text-red-400 font-bold" : ""}>{purchasedCount}/{limit}</p>
                    )}
                    {giftedCount > 0 && (
                      <p className="text-emerald-400 text-xs mt-0.5">+{giftedCount}赠送</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 余额显示 */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>您的 USDT 余额:</span>
            <span className="text-white font-bold">
              {usdtBalance !== null ? formatNumber(Number(ethers.formatUnits(usdtBalance, usdtDecimals))) : "—"} USDT
            </span>
          </div>
        </div>

        {/* 购买限额提示 */}
        {!canPurchaseTier(selectedTier) && (
          <div className="text-red-400 text-xs mb-3 flex items-center gap-1 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle size={14} />
            {getPurchaseLimitHint(selectedTier)}
          </div>
        )}
        {canPurchaseTier(selectedTier) && MINER_PURCHASE_LIMITS[selectedTier] > 0 && (
          <div className="text-emerald-400 text-xs mb-3 flex items-center gap-1 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <CheckCircle size={14} />
            {getPurchaseLimitHint(selectedTier)}
          </div>
        )}

        <AnimatedButton
          onClick={handlePurchaseWithUSDT}
          loading={purchasingUSDT}
          disabled={!isRegistered || !canPurchaseTier(selectedTier)}
          variant="primary"
          className="w-full py-3 text-lg"
        >
          {!isRegistered
            ? "请先注册"
            : getTierAvailability(selectedTier).nodePhaseRestricted
            ? "当前阶段不可购买基础矿机"
            : getTierAvailability(selectedTier).disabled
            ? "当前已下架"
            : getTierAvailability(selectedTier).soldOut
            ? "当前已售罄"
            : !canPurchaseTier(selectedTier)
            ? "已达购买上限"
            : `USDT购买 ${availableTierConfigs.find((t) => t.tier === selectedTier)?.name}`}
        </AnimatedButton>

        {/* 赠送矿机说明 - 仅节点招募阶段生效 */}
        {canPurchaseTier(selectedTier) && selectedTier >= MinerTier.V1 && isNodePhase && (
          <div className="text-emerald-400 text-xs mt-2 flex items-start gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <Award size={12} className="mt-0.5 flex-shrink-0" />
            <span>购买此档位矿机将额外赠送同等级矿机1台（节点招募期权益）</span>
          </div>
        )}

        {!isRegistered && (
          <p className="text-yellow-400 text-xs mt-2 flex items-center gap-1">
            <AlertTriangle size={12} />
            需要先绑定推荐人并注册才能购买矿机
          </p>
        )}
      </div>

      {/* 推荐人绑定卡片 */}
      {!isRegistered && (
        <>
          {/* 新手指引 Modal */}
          {showGuide && (
            <ReferrerGuide
              onClose={() => setShowGuide(false)}
              onSelectOption={handleGuideSelect}
            />
          )}

          <div className="bg-[#1A1532]/90 border border-indigo-500/20 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold flex items-center gap-2">
                <UserPlus size={17} className="text-violet-400" /> 绑定推荐人
              </h3>
              <button
                onClick={() => setShowGuide(true)}
                className="p-1.5 rounded-lg bg-slate-700/40 hover:bg-slate-600/40 text-slate-400 hover:text-slate-200 transition-colors"
                title="查看新手指引"
              >
                <HelpCircle size={16} />
              </button>
            </div>

            {/* 新手指引提示 */}
            <div className="flex items-center gap-2 p-3 bg-amber-900/20 border border-amber-500/20 rounded-lg">
              <HelpCircle size={14} className="text-amber-400 flex-shrink-0" />
              <p className="text-amber-300 text-xs">
                💡 <span className="font-semibold">新手提示：</span>不确定如何选择？
                <button
                  onClick={() => setShowGuide(true)}
                  className="ml-1 text-amber-200 hover:text-amber-100 underline font-semibold"
                >
                  查看指引
                </button>
              </p>
            </div>

            {/* 注册中状态 */}
            {isRegistering && (
            <div className="flex items-center gap-3 py-3 px-4 bg-indigo-900/30 border border-indigo-500/20 rounded-xl">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <div>
                <p className="text-indigo-300 text-sm font-bold">正在链上注册...</p>
                <p className="text-slate-400 text-xs mt-0.5">请在钱包中确认交易</p>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {!isRegistering && registerError && (
            <div className="flex items-start gap-2 py-2 px-3 bg-rose-900/20 border border-rose-500/20 rounded-lg">
              <AlertTriangle size={14} className="text-rose-400 mt-0.5 flex-shrink-0" />
              <p className="text-rose-300 text-xs">{registerError}</p>
            </div>
          )}

          {!isRegistering && (
            <>
              {/* 方式一：手动输入 */}
              <div>
                <label className="text-slate-400 text-xs mb-1.5 flex items-center gap-1">
                  <Link2 size={11} /> 推荐人钱包地址
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputReferrer}
                    onChange={(e) => { setInputReferrer(e.target.value); setInputError(null); }}
                    placeholder="0x..."
                    className="flex-1 bg-[#0F0B1E] border border-indigo-500/20 focus:border-indigo-500/60 rounded-xl px-3 py-2.5 text-white text-sm font-mono placeholder-slate-400 outline-none transition-colors"
                  />
                  <button
                    onClick={handleBindManual}
                    disabled={!inputReferrer.trim()}
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0"
                  >
                    绑定
                  </button>
                </div>
                {inputError && (
                  <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
                    <AlertTriangle size={11} /> {inputError}
                  </p>
                )}
              </div>

              {/* 分隔线 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-indigo-500/10" />
                <span className="text-slate-600 text-xs">或</span>
                <div className="flex-1 h-px bg-indigo-500/10" />
              </div>

              {/* 方式二：使用平台默认推荐人 */}
              <button
                onClick={handleBindDefault}
                className="w-full py-2.5 border border-indigo-500/25 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-slate-300 hover:text-white text-sm rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <UserPlus size={15} className="text-indigo-400" />
                使用平台默认推荐人注册
              </button>
              <p className="text-slate-600 text-xs text-center -mt-2">
                无邀请链接时可使用，绑定平台官方推荐人
              </p>
            </>
            )}
          </div>
        </>
      )}

      {/* 我的矿机列表 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Award size={18} className="text-violet-400" /> 我的矿机 ({userMiners.length})
        </h3>
        <p className="text-slate-500 text-xs -mt-2 mb-4">按购买时间排序（最新在前）</p>

        {userMiners.length === 0 ? (
          <div className="bg-[#13102B]/40 border border-indigo-500/10 rounded-xl p-4">
            <p className="text-slate-300 text-sm">当前地址未查询到已购买矿机</p>
            <p className="text-slate-500 text-xs mt-1">请确认钱包地址与网络后重试</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedMiners.map(({ miner, chainIndex }) => {
              const tierConfig = availableTierConfigs.find((t) => t.tier === miner.tier) || MINER_TIERS.find((t) => t.tier === miner.tier);
              const effectiveCycleDays = Number(miner.cycleDays) > 0
                ? Number(miner.cycleDays)
                : (tierConfig?.cycleDays ?? 0);
              const cycleLabel = effectiveCycleDays > 0 ? `${effectiveCycleDays} 天周期` : "永久有效";
              const vaultMeta = minerVaultInfo[chainIndex];
              const bPaused = vaultMeta?.bPaused ?? false;
              const dailyA = vaultMeta?.vaultA_daily ?? 0n;
              const dailyB = vaultMeta?.vaultB_daily ?? 0n;
              const hasDailyInfo = dailyA > 0n || dailyB > 0n;
              const pendingByThisMiner = minerPendingRewards[chainIndex] ?? 0n;

              return (
                <div
                  key={`${chainIndex}-${miner.purchaseTime.toString()}`}
                  className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-bold">{tierConfig?.name || `Tier ${miner.tier}`}</p>
                      {miner.isAutoGifted && (
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">赠送</span>
                      )}
                      {bPaused && (
                        <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full">B仓冻结</span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs">
                      投入: {formatNumber(Number(ethers.formatUnits(miner.costUsdt, usdtDecimals)))} USDT
                    </p>
                    <p className="text-slate-500 text-xs flex items-center gap-1">
                      <Clock size={10} /> {cycleLabel}
                    </p>
                    <p className="text-slate-500 text-xs">
                      购买时间: {formatDateTime(miner.purchaseTime)}
                    </p>
                    <p className="text-slate-500 text-xs">
                      A仓剩余: {formatNumber(Number(ethers.formatUnits(miner.vaultA_usdt, usdtDecimals)))}U · B仓剩余: {formatNumber(Number(ethers.formatUnits(miner.vaultB_usdt, usdtDecimals)))}U
                    </p>
                    {hasDailyInfo && (
                      <p className="text-indigo-400 text-xs mt-0.5">
                        日产: A仓 {formatNumber(Number(ethers.formatUnits(dailyA, usdtDecimals)))}U · B仓 {formatNumber(Number(ethers.formatUnits(dailyB, usdtDecimals)))}U
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-green-400 text-sm font-bold">
                      {formatNumber(Number(ethers.formatEther(miner.totalClaimed)))} KNIGHTS
                    </p>
                    <p className="text-slate-500 text-xs">已领取</p>
                    <p className="text-amber-400 text-xs mt-1">
                      待领: {formatNumber(Number(ethers.formatEther(pendingByThisMiner)), 4)} KNIGHTS
                    </p>
                    <p className={`text-xs mt-1 ${miner.active ? "text-emerald-400" : "text-slate-500"}`}>
                      {miner.active ? "活跃中" : "已结束"}
                    </p>
                    <AnimatedButton
                      onClick={() => handleClaimByMiner(chainIndex)}
                      loading={claimingMinerId === chainIndex}
                      disabled={!miner.active || pendingByThisMiner === 0n || isAnyClaiming}
                      variant="secondary"
                      className="mt-2 px-3 py-1 text-xs"
                    >
                      {!miner.active ? "已结束" : pendingByThisMiner === 0n ? "暂无可领" : "单台领取"}
                    </AnimatedButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MiningPanel;
