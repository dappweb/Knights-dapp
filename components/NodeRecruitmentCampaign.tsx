import { ethers } from "ethers";
import { Clock3, Gift, RefreshCw, ShieldCheck, Users } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useWeb3 } from "../src/Web3Context";
import { MinerTier } from "../src/types";

const LEGACY_MINER_ABI = [
  "function getUserMinerCount(address) view returns (uint256)",
  "function getUserMiner(address,uint256) view returns (tuple(uint8 tier,uint256 costUsdt,uint256 purchaseTime,uint256 dailyOutput,uint256 lastClaimTime,uint256 totalClaimed,bool active))",
] as const;

type NodeLot = {
  lotId: number;
  tier: number;
  weight: bigint;
  costUsdt: bigint;
  allocatedRights: bigint;
  claimedRights: bigint;
  pendingRights: bigint;
  purchaseTime: number;
  protectedUntil: number;
  active: boolean;
  claimableByLot: boolean;
};

type NodeRightsDetail = {
  allocated: bigint;
  claimed: bigint;
  pending: bigint;
  unlockedBP: number;
  currentTier: number;
  maxTier: number;
  protectedUntil: number;
};

interface NodeRecruitmentCampaignProps {
  showPurchaseSection?: boolean;
}

type NodeOption = {
  level: string;
  price: string;
  costUsdt: number;
  tier: MinerTier;
  quota: string;
  quotaCount: number;
  limit: string;
  giftMiner: string;
  rights: string;
  rightsAmount: bigint;
  protection: string;
  weight: bigint;
  enabled: boolean;
};

const NODE_PROTECTION_SECONDS = 90 * 24 * 60 * 60;

const DEFAULT_NODE_OPTIONS: NodeOption[] = [
  {
    level: "V1 节点",
    price: "1000U",
    costUsdt: 1000,
    tier: MinerTier.V1,
    quota: "总量 600 个",
    quotaCount: 600,
    limit: "单地址限购 3 个",
    giftMiner: "赠送 1000U V1 矿机",
    rights: "节点币权 2000 KNIGHTS",
    rightsAmount: 2000n * 10n ** 18n,
    protection: "团队等级保护 3 个月",
    weight: 1n,
    enabled: true,
  },
  {
    level: "V2 节点",
    price: "3000U",
    costUsdt: 3000,
    tier: MinerTier.V2,
    quota: "总量 100 个",
    quotaCount: 100,
    limit: "单地址限购 1 个",
    giftMiner: "赠送 3000U V2 矿机",
    rights: "节点币权 6000 KNIGHTS",
    rightsAmount: 6000n * 10n ** 18n,
    protection: "团队等级保护 3 个月",
    weight: 3n,
    enabled: true,
  },
  {
    level: "V3 节点",
    price: "10000U",
    costUsdt: 10000,
    tier: MinerTier.V3,
    quota: "总量 15 个",
    quotaCount: 15,
    limit: "单地址限购 1 个",
    giftMiner: "赠送 10000U V3 矿机",
    rights: "节点币权 20000 KNIGHTS",
    rightsAmount: 20000n * 10n ** 18n,
    protection: "团队等级保护 3 个月",
    weight: 10n,
    enabled: true,
  },
];

const formatDecimalString = (value: string, maxFractionDigits: number): string => {
  if (!value) return "0";
  const isNegative = value.startsWith("-");
  const normalized = isNegative ? value.slice(1) : value;
  const [intPartRaw, fracPartRaw = ""] = normalized.split(".");
  const intPart = (intPartRaw || "0").replace(/^0+(\d)/, "$1");
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmedFrac = fracPartRaw.replace(/0+$/, "").slice(0, maxFractionDigits);
  return `${isNegative ? "-" : ""}${groupedInt || "0"}${trimmedFrac ? `.${trimmedFrac}` : ""}`;
};

const formatNodePurchaseError = (err: any): string => {
  const msg = String(err?.reason || err?.shortMessage || err?.message || "");
  const lower = msg.toLowerCase();

  // 用户主动取消
  if (lower.includes("user rejected") || lower.includes("denied") || lower.includes("cancelled") || lower.includes("rejected")) {
    return "交易已取消";
  }
  // SeerProtocol custom errors
  if (lower.includes("notregistered") || lower.includes("not registered")) {
    return "请先绑定推荐人并完成注册";
  }
  if (lower.includes("protocolpausederror") || lower.includes("paused")) {
    return "协议已暂停，请稍后重试";
  }
  if (lower.includes("nodesaleclosed")) {
    return "节点销售已关闭";
  }
  if (lower.includes("minersaleclosed")) {
    return "矿机销售已关闭";
  }
  if (lower.includes("nodephaseminerrestricted")) {
    return "节点招募阶段仅可购买 V1/V2/V3 节点";
  }
  if (lower.includes("minertierdisabled")) {
    return "该节点档位当前未开放";
  }
  if (lower.includes("minertiersoldout") || lower.includes("sold out") || lower.includes("售罄")) {
    return "该节点档位已售罄";
  }
  if (lower.includes("minerpurchaselimitexceeded")) {
    return "已达到该档位的单地址限购数量";
  }
  // MinerNode custom errors
  if (lower.includes("nodequotaexceeded")) {
    return "节点配额已满，无法继续购买";
  }
  if (lower.includes("nodetierdisabled")) {
    return "该节点等级当前未开放";
  }
  // USDT / 余额相关
  if (lower.includes("insufficient") || lower.includes("余额不足") || lower.includes("insufficientbalance") || lower.includes("insufficientusdt")) {
    return "USDT 余额不足，无法完成购买";
  }
  if (lower.includes("erc20: transfer amount exceeds") || lower.includes("transfer amount exceeds")) {
    return "USDT 余额或授权不足";
  }

  return msg || "节点购买失败，请稍后重试";
};

const toBigInt = (value: any) => BigInt(value ?? 0);
const toNumber = (value: any) => Number(value ?? 0);

const NodeRecruitmentCampaign: React.FC<NodeRecruitmentCampaignProps> = ({ showPurchaseSection = true }) => {
  const { account, isConnected, isRegistered, protocolContract, usdtContract, minerNodeContract, refreshBalances, usdtDecimals, usdtBalance } = useWeb3();
  const [buyingTier, setBuyingTier] = useState<MinerTier | null>(null);
  const [nodeLots, setNodeLots] = useState<NodeLot[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [pendingNodeReward, setPendingNodeReward] = useState<bigint>(0n);
  const [pendingNodeRights, setPendingNodeRights] = useState<bigint>(0n);
  const [isNode, setIsNode] = useState(false);
  const [nodeTierLabel, setNodeTierLabel] = useState("-");
  const [nodeRightsDetail, setNodeRightsDetail] = useState<NodeRightsDetail | null>(null);
  const [tierCounts, setTierCounts] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0 });
  const [claimingReward, setClaimingReward] = useState(false);
  const [claimingRights, setClaimingRights] = useState(false);
  const [claimingLotId, setClaimingLotId] = useState<number | null>(null);
  const [tierCountsError, setTierCountsError] = useState<boolean>(false);
  const [nodeOptions, setNodeOptions] = useState<NodeOption[]>(DEFAULT_NODE_OPTIONS);

  const formatDateTime = (ts: number) => {
    if (!ts) return "-";
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    const hh = `${d.getHours()}`.padStart(2, "0");
    const mm = `${d.getMinutes()}`.padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  };

  const formatPercent = (bp: number) => (bp / 100).toFixed(2);
  const formatSeer = (value: bigint) => formatDecimalString(ethers.formatEther(value), 4);
  const formatUsdt = (value: bigint) => formatDecimalString(ethers.formatUnits(value, usdtDecimals), 2);

  const fetchNodeOptions = useCallback(async () => {
    if (!protocolContract || !minerNodeContract) return;

    try {
      const nextOptions = await Promise.all(
        DEFAULT_NODE_OPTIONS.map(async (fallback) => {
          const [minerConfig, nodeConfig] = await Promise.all([
            (protocolContract as any).getMinerTierConfig(fallback.tier),
            (minerNodeContract as any).getNodeTierConfig(fallback.tier),
          ]);

          const costUsdt = Number(ethers.formatUnits(minerConfig.costUsdt ?? minerConfig[0], usdtDecimals));
          const quotaCount = Number(nodeConfig.maxCount ?? nodeConfig[2]);
          const rightsAmount = BigInt(nodeConfig.allocatedRights ?? nodeConfig[1]);
          const minerEnabled = Boolean(minerConfig.enabled ?? minerConfig[6]);
          const nodeEnabled = Boolean(nodeConfig.enabled ?? nodeConfig[4]);

          return {
            ...fallback,
            price: `${formatDecimalString(costUsdt.toString(), 2)}U`,
            costUsdt,
            quota: quotaCount > 0 ? `总量 ${quotaCount} 个` : "不限量",
            quotaCount,
            giftMiner: `赠送 ${formatDecimalString(costUsdt.toString(), 2)}U ${fallback.level.replace(" 节点", " 矿机")}`,
      rights: `节点币权 ${formatDecimalString(ethers.formatEther(rightsAmount), 2)} KNIGHTS`,
            rightsAmount,
            weight: BigInt(nodeConfig.weight ?? nodeConfig[0]),
            enabled: minerEnabled && nodeEnabled,
          } satisfies NodeOption;
        })
      );

      setNodeOptions(nextOptions);
    } catch {
      setNodeOptions(DEFAULT_NODE_OPTIONS);
    }
  }, [protocolContract, minerNodeContract, usdtDecimals]);

  const getTierLabel = (tier: number) => {
    if (tier === 1) return "V1";
    if (tier === 2) return "V2";
    if (tier === 3) return "V3";
    return `V${tier}`;
  };

  const getRightsByTier = (tier: number) => {
    return nodeOptions.find((option) => option.tier === tier)?.rightsAmount ?? 0n;
  };

  const getWeightByTier = (tier: number) => {
    return nodeOptions.find((option) => option.tier === tier)?.weight ?? 0n;
  };

  const fetchFallbackLotsFromEvents = useCallback(async (): Promise<NodeLot[]> => {
    if (!account || !protocolContract) return [];

    try {
      const minerCountRaw = await protocolContract.getUserMinerCount(account).catch(() => 0n);
      const minerCount = Number(minerCountRaw || 0n);
      if (!Number.isFinite(minerCount) || minerCount <= 0) return [];

      const protocolAddress = await protocolContract.getAddress().catch(() => "");
      const legacyReader = protocolAddress
        ? new ethers.Contract(protocolAddress, LEGACY_MINER_ABI, protocolContract.runner)
        : null;

      const list: NodeLot[] = [];
      for (let idx = 0; idx < minerCount; idx++) {
        let miner = await protocolContract.getUserMiner(account, idx).catch(() => null);
        let isLegacyMiner = false;

        if (!miner && legacyReader) {
          miner = await legacyReader.getUserMiner(account, idx).catch(() => null);
          isLegacyMiner = Boolean(miner);
        }

        if (!miner) continue;

        const tier = toNumber(miner.tier ?? miner[0]);
        if (tier < 1 || tier > 3) continue;

        const costUsdt = toBigInt(miner.costUsdt ?? miner[1]);
        const purchaseTime = toNumber(miner.purchaseTime ?? (isLegacyMiner ? miner[2] : miner[4]));
        const active = Boolean(miner.active ?? (isLegacyMiner ? miner[6] : miner[8]));
        const isAutoGifted = isLegacyMiner ? false : Boolean(miner.isAutoGifted ?? miner[9]);

        if (isAutoGifted || costUsdt <= 0n) continue;

        list.push({
          lotId: idx + 1,
          tier,
          weight: getWeightByTier(tier),
          costUsdt,
          allocatedRights: getRightsByTier(tier),
          claimedRights: 0n,
          pendingRights: 0n,
          purchaseTime,
          protectedUntil: purchaseTime > 0 ? purchaseTime + NODE_PROTECTION_SECONDS : 0,
          active,
          claimableByLot: false,
        });
      }

      return list.sort((a, b) => (a.purchaseTime === b.purchaseTime ? a.lotId - b.lotId : a.purchaseTime - b.purchaseTime));
    } catch {
      return [];
    }
  }, [account, protocolContract, nodeOptions]);

  const fetchNodeData = useCallback(async () => {
    if (!account) {
      setNodeLots([]);
      setPendingNodeReward(0n);
      setPendingNodeRights(0n);
      setIsNode(false);
      setNodeTierLabel("-");
      setNodeRightsDetail(null);
      setTierCounts({ 1: 0, 2: 0, 3: 0 });
      return;
    }

    setLoadingNodes(true);
    try {
      const nextTierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
      let countReadError = false;
      const provider = minerNodeContract?.runner?.provider;
      let latestBlock = 0;
      if (provider) {
        try {
          latestBlock = await provider.getBlockNumber();
        } catch {
          latestBlock = 0;
        }
      }
      const getFromBlock = (lookbackBlocks: number) => Math.max(latestBlock - lookbackBlocks, 0);

      if (minerNodeContract) {
        // 先尝试 nodeCount() — 如果总数为 0，无需逐级查询
        let totalNodeCount = -1;
        try {
          totalNodeCount = Number(await minerNodeContract.nodeCount());
        } catch { /* nodeCount 不可用 */ }

        if (totalNodeCount === 0) {
          // 没有任何节点被售出，各级别计数全部为 0
          nextTierCounts[1] = 0;
          nextTierCounts[2] = 0;
          nextTierCounts[3] = 0;
          setTierCountsError(false);
        } else {
          // 尝试逐级查询计数
          const countResults = await Promise.all([
            minerNodeContract.v1NodeCount().catch(() => null),
            minerNodeContract.v2NodeCount().catch(() => null),
            minerNodeContract.v3NodeCount().catch(() => null),
          ]);

          const [v1Count, v2Count, v3Count] = countResults;
          if (v1Count != null && v2Count != null && v3Count != null) {
            nextTierCounts[1] = Number(v1Count);
            nextTierCounts[2] = Number(v2Count);
            nextTierCounts[3] = Number(v3Count);
            setTierCountsError(false);
          } else {
            // 旧合约不存在 v1/v2/v3NodeCount，回退到事件计数
            console.warn("Node tier count getters unavailable, falling back to event query");
            try {
              const lotEvents = await minerNodeContract.queryFilter(
                minerNodeContract.filters.NodeLotRegistered?.() ?? (minerNodeContract as any).filters["NodeLotRegistered"](),
                getFromBlock(200000)
              ).catch(() => []);
              if ((lotEvents as any[]).length > 0) {
                for (const ev of lotEvents as any[]) {
                  const tier = Number(ev.args?.tier ?? ev.args?.[2] ?? 0);
                  if (tier >= 1 && tier <= 3) nextTierCounts[tier]++;
                }
              } else {
                const legacyEvents = await minerNodeContract.queryFilter(
                  (minerNodeContract as any).filters["NodeRegistered"]?.(),
                  getFromBlock(200000)
                ).catch(() => []);
                for (const ev of legacyEvents as any[]) {
                  const tier = Number(ev.args?.tier ?? ev.args?.[2] ?? 0);
                  if (tier >= 1 && tier <= 3) nextTierCounts[tier]++;
                }
              }
              // 事件查询本身成功即视为计数有效（0 条事件 = 0 已售）
              setTierCountsError(false);
            } catch (evErr) {
              console.error("Node tier counts event fallback failed:", evErr);
              countReadError = true;
              setTierCountsError(true);
            }
          }
        }

        const [lotsRaw, rightsInfo, pendingRewardRaw, pendingRightsRaw, nodeInfo] = await Promise.all([
          minerNodeContract.getUserNodeLots(account).catch(() => []),
          minerNodeContract.getNodeRightsInfo(account).catch(() => null),
          minerNodeContract.pendingReward(account).catch(() => 0n),
          minerNodeContract.pendingNodeRights(account).catch(() => 0n),
          minerNodeContract.nodes(account).catch(() => null),
        ]);

        const normalizedLots = (lotsRaw as any[])
          .map((lot) => ({
            lotId: toNumber(lot.lotId),
            tier: toNumber(lot.tier),
            weight: toBigInt(lot.weight),
            costUsdt: toBigInt(lot.costUsdt),
            allocatedRights: toBigInt(lot.allocatedRights),
            claimedRights: toBigInt(lot.claimedRights),
            pendingRights: toBigInt(lot.pendingRights),
            purchaseTime: toNumber(lot.purchaseTime),
            protectedUntil: toNumber(lot.protectedUntil),
            active: Boolean(lot.active),
            claimableByLot: true,
          }))
          .sort((a, b) => (a.purchaseTime === b.purchaseTime ? a.lotId - b.lotId : a.purchaseTime - b.purchaseTime));

        const effectiveLots = normalizedLots.length > 0 ? normalizedLots : await fetchFallbackLotsFromEvents();

        setNodeLots(effectiveLots);
        setPendingNodeReward(toBigInt(pendingRewardRaw));
        setPendingNodeRights(toBigInt(pendingRightsRaw));

        if (rightsInfo) {
          setNodeRightsDetail({
            allocated: toBigInt(rightsInfo.allocated),
            claimed: toBigInt(rightsInfo.claimed),
            pending: toBigInt(rightsInfo.pending),
            unlockedBP: toNumber(rightsInfo.unlockedBP),
            currentTier: toNumber(rightsInfo.currentTier),
            maxTier: toNumber(rightsInfo.maxTier),
            protectedUntil: toNumber(rightsInfo.protectedUntil),
          });
        } else {
          setNodeRightsDetail(null);
        }

        const activeTier = rightsInfo ? toNumber(rightsInfo.currentTier) : effectiveLots.filter((lot) => lot.active).reduce((max, lot) => Math.max(max, lot.tier), 0);
        const hasAnyLots = effectiveLots.length > 0;
        setIsNode(Boolean(nodeInfo?.isNode) || effectiveLots.some((lot) => lot.active) || hasAnyLots);
        setNodeTierLabel(activeTier > 0 ? getTierLabel(activeTier) : hasAnyLots ? getTierLabel(effectiveLots.reduce((max, lot) => Math.max(max, lot.tier), 0)) : "-");
      } else {
        const fallbackLots = await fetchFallbackLotsFromEvents();
        setNodeLots(fallbackLots);
        // 此时 nextTierCounts 仍为初始值全 0，不更新 tierCounts 以保持之前的值
        setPendingNodeReward(0n);
        setPendingNodeRights(0n);
        setIsNode(fallbackLots.length > 0);
        setNodeTierLabel(fallbackLots.length > 0 ? getTierLabel(fallbackLots.reduce((max, lot) => Math.max(max, lot.tier), 0)) : "-");
        setNodeRightsDetail(null);
      }
      
      // 只在计数读取成功时才更新 tierCounts（使用本地变量，避免 stale React state）
      if (minerNodeContract && !countReadError) {
        setTierCounts(nextTierCounts);
      }
    } catch (err) {
      console.error("Failed to fetch node data:", err);
    } finally {
      setLoadingNodes(false);
    }
  }, [account, minerNodeContract, fetchFallbackLotsFromEvents]);

  useEffect(() => {
    fetchNodeOptions();
  }, [fetchNodeOptions]);

  useEffect(() => {
    fetchNodeData();
  }, [fetchNodeData]);

  const firstPurchaseTime = nodeLots.length > 0 ? nodeLots[0].purchaseTime : 0;
  const lastPurchaseTime = nodeLots.length > 0 ? nodeLots[nodeLots.length - 1].purchaseTime : 0;

  const derivedRights = useMemo(() => {
    return nodeLots.reduce(
      (acc, lot) => {
        acc.allocated += lot.allocatedRights;
        acc.claimed += lot.claimedRights;
        acc.pending += lot.pendingRights;
        return acc;
      },
      { allocated: 0n, claimed: 0n, pending: 0n }
    );
  }, [nodeLots]);

  const totalAllocatedRights = nodeRightsDetail?.allocated ?? derivedRights.allocated;
  const totalClaimedRights = nodeRightsDetail?.claimed ?? derivedRights.claimed;
  const totalPendingRights = nodeRightsDetail?.pending ?? derivedRights.pending;

  const handleBuyNode = async (tier: MinerTier, costUsdt: number, level: string) => {
    if (!showPurchaseSection) return toast.error("节点招募已结束");
    if (!isConnected) return toast.error("请先连接钱包");
    if (!isRegistered) return toast.error("请先完成推荐人绑定并注册");
    if (!protocolContract || !usdtContract || !account) return toast.error("合约未就绪，请稍后重试");

    const targetTier = tier as 1 | 2 | 3;
    const selectedOption = nodeOptions.find((option) => option.tier === tier);
    if (selectedOption && selectedOption.quotaCount > 0 && tierCounts[targetTier] >= selectedOption.quotaCount) {
      return toast.error(`${level} 已售罄`);
    }

    setBuyingTier(tier);
    try {
      const costWei = ethers.parseUnits(costUsdt.toString(), usdtDecimals);
      const protocolAddr = await protocolContract.getAddress();
      const usdtBal = await usdtContract.balanceOf(account);
      if (usdtBal < costWei) {
        toast.error("USDT 余额不足");
        return;
      }

      const allowance = await usdtContract.allowance(account, protocolAddr);

      if (allowance < costWei) {
        toast.loading("授权 USDT...", { id: "node-approve" });
        const approveTx = await usdtContract.approve(protocolAddr, ethers.MaxUint256);
        await approveTx.wait();
        toast.dismiss("node-approve");
      }

      toast.loading("购买节点中...", { id: "node-purchase" });
      const tx = await protocolContract.purchaseMiner(tier);
      await tx.wait();
      toast.dismiss("node-purchase");
      toast.success(`${level} 购买成功，赠送矿机已同步到矿机中心`);
      window.dispatchEvent(new CustomEvent("minerStatusChanged"));
      await refreshBalances();
      await fetchNodeData();
    } catch (err: any) {
      toast.dismiss("node-approve");
      toast.dismiss("node-purchase");
      toast.error(formatNodePurchaseError(err));
    } finally {
      setBuyingTier(null);
    }
  };

  const handleClaimNodeReward = async () => {
    if (!minerNodeContract) return;
    setClaimingReward(true);
    try {
      toast.loading("领取节点分红中...", { id: "claim-node-reward" });
      const tx = await minerNodeContract.claimReward();
      await tx.wait();
      toast.dismiss("claim-node-reward");
      toast.success("节点分红领取成功");
      await refreshBalances();
      await fetchNodeData();
    } catch (err: any) {
      toast.dismiss("claim-node-reward");
      toast.error(err?.reason || err?.message || "领取节点分红失败");
    } finally {
      setClaimingReward(false);
    }
  };

  const handleClaimNodeRights = async () => {
    if (!minerNodeContract) return;
    setClaimingRights(true);
    try {
      toast.loading("领取全部节点币权中...", { id: "claim-node-rights" });
      const tx = await minerNodeContract.claimNodeRights();
      await tx.wait();
      toast.dismiss("claim-node-rights");
      toast.success("全部节点币权领取成功");
      await refreshBalances();
      await fetchNodeData();
    } catch (err: any) {
      toast.dismiss("claim-node-rights");
      toast.error(err?.reason || err?.message || "领取节点币权失败");
    } finally {
      setClaimingRights(false);
    }
  };

  const handleClaimLotRights = async (lotId: number) => {
    if (!minerNodeContract) return;
    setClaimingLotId(lotId);
    try {
      toast.loading(`领取节点 Lot #${lotId} 币权中...`, { id: `claim-node-lot-${lotId}` });
      const tx = await minerNodeContract.claimNodeRightsByLot(lotId);
      await tx.wait();
      toast.dismiss(`claim-node-lot-${lotId}`);
      toast.success(`节点 Lot #${lotId} 币权领取成功`);
      await refreshBalances();
      await fetchNodeData();
    } catch (err: any) {
      toast.dismiss(`claim-node-lot-${lotId}`);
      toast.error(err?.reason || err?.message || "领取单节点币权失败");
    } finally {
      setClaimingLotId(null);
    }
  };

  return (
    <section className="max-w-4xl mx-auto mb-4">
      <div className="bg-gradient-to-br from-violet-900/40 to-indigo-900/30 border border-violet-500/25 rounded-2xl p-5 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
              <Clock3 size={12} /> 节点专区
            </p>
            <h2 className="text-white text-xl md:text-2xl font-black mt-2 flex items-center gap-2">
              <Gift size={20} className="text-violet-300" /> 节点中心
            </h2>
            <p className="text-slate-300 text-sm mt-2 leading-relaxed">购买节点后会形成对应节点身份，团队页按较高等级展示，并获得 90 天保级；节点币权仍按单节点 lot 独立领取。</p>
          </div>

          <span className="shrink-0 px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 text-sm font-bold border border-emerald-500/30">
            已购 {nodeLots.length} 笔
          </span>
        </div>

        <div className="space-y-4">
          <div className="bg-[#13102B]/60 border border-indigo-500/15 rounded-xl p-4">
            <p className="text-white font-bold text-sm mb-3">购买节点</p>
            {tierCountsError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 mb-4">
                <p className="text-rose-400 text-sm">⚠️ 节点库存数据加载失败</p>
                <p className="text-rose-300 text-xs mt-1">请检查网络连接或稍后重试。库存计数可能不准确。</p>
              </div>
            )}
            {showPurchaseSection ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {nodeOptions.map((option) => {
                    const optionTier = option.tier as 1 | 2 | 3;
                    const sold = tierCounts[optionTier];
                    const quota = option.quotaCount;
                    const remaining = quota - sold;
                    const soldOut = quota > 0 ? sold >= quota : false;
                    const optionCostRaw = ethers.parseUnits(option.costUsdt.toString(), usdtDecimals);
                    const insufficientUsdt = (usdtBalance ?? 0n) < optionCostRaw;
                    const unavailable = soldOut || !option.enabled || insufficientUsdt;
                    const isLoading = sold === 0 && quota > 0 && !loadingNodes; // 未初始化时用加载状态
                    return (
                      <div key={option.level} className="bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-violet-300 text-xs font-semibold px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 inline-block">
                              {option.level}
                            </p>
                            <p className="text-slate-300 text-xs mt-2">{option.quota} · {option.limit}</p>
                            <p className={`text-xs mt-1 ${soldOut ? "text-rose-400" : quota > 0 && remaining <= quota * 0.2 ? "text-amber-400" : "text-slate-500"}`}>
                              {quota === 0
                                ? "不限量"
                                : isLoading
                                ? "加载中..."
                                : `已售 ${sold}/${quota}`}
                              {quota > 0 && remaining > 0 && !isLoading && ` · 剩余 ${remaining}`}
                            </p>
                            {!option.enabled && <p className="text-rose-400 text-xs mt-1">当前已下架</p>}
                          </div>
                          <p className="text-white text-2xl font-black leading-none">{option.price}</p>
                        </div>

                        <div className="mt-3 space-y-1">
                          <p className="text-emerald-300 text-xs">赠送：{option.giftMiner}</p>
                          <p className="text-emerald-300 text-xs">币权：{option.rights}</p>
                          <p className="text-emerald-300 text-xs">保护：{option.protection}</p>
                        </div>

                        <button
                          onClick={() => handleBuyNode(option.tier, option.costUsdt, option.level)}
                          disabled={!isConnected || !isRegistered || buyingTier !== null || unavailable}
                          className="w-full mt-4 px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 text-white text-sm font-bold rounded-lg transition-all"
                        >
                          {buyingTier === option.tier
                            ? "购买中..."
                            : !option.enabled
                            ? "当前已下架"
                            : soldOut
                            ? "已售罄"
                            : insufficientUsdt
                            ? "USDT不足"
                            : !isConnected
                            ? "连接钱包后购买"
                            : !isRegistered
                            ? "先完成注册"
                            : `立即购买 ${option.level}`}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-xl p-3">
                  <p className="text-slate-400 text-xs flex items-center gap-1">
                    <Users size={13} className="text-violet-300" /> 购买说明
                  </p>
                  <p className="text-white text-sm mt-2">V1/V2/V3：1000U / 3000U / 10000U</p>
                  <p className="text-slate-400 text-xs mt-1">每次购买会同步对应节点身份，团队页按更高等级展示；节点币权继续按独立 lot 发放与领取。</p>
                </div>
              </>
            ) : (
              <div className="bg-[#0F0B1E]/70 border border-amber-500/20 rounded-xl p-4">
                <p className="text-amber-300 text-sm font-bold">节点招募已结束</p>
                <p className="text-slate-400 text-xs mt-1">当前仅保留已购节点的身份、权益与领取功能，节点购买入口已关闭。</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#13102B]/60 border border-indigo-500/15 rounded-xl p-4">
              <p className="text-slate-400 text-xs">当前身份/等级</p>
              <p className="text-white text-lg font-bold mt-1">{isNode ? `${nodeTierLabel} 节点` : nodeLots.length > 0 ? `历史持有 ${nodeTierLabel}` : "未持有"}</p>
            </div>
            <div className="bg-[#13102B]/60 border border-indigo-500/15 rounded-xl p-4">
              <p className="text-slate-400 text-xs">节点分红（待领）</p>
                <p className="text-emerald-300 text-lg font-bold mt-1">{formatSeer(pendingNodeReward)} KNIGHTS</p>
            </div>
            <div className="bg-[#13102B]/60 border border-indigo-500/15 rounded-xl p-4">
              <p className="text-slate-400 text-xs">节点币权（待领）</p>
                <p className="text-violet-300 text-lg font-bold mt-1">{formatSeer(totalPendingRights)} KNIGHTS</p>
            </div>
          </div>

          <div className="bg-[#13102B]/60 border border-indigo-500/15 rounded-xl p-4">
            <p className="text-white font-bold text-sm mb-3">节点身份与权益发放细则</p>
            <p className="text-slate-400 text-xs mb-3">节点身份按地址聚合展示，并同步到团队页等级口径；节点分红按地址聚合结算，节点币权按单节点 lot 独立发放与独立领取。</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div className="bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-lg p-3">
                <p className="text-slate-400 text-xs">总分配币权</p>
                  <p className="text-emerald-300 font-bold mt-1">{formatSeer(totalAllocatedRights)} KNIGHTS</p>
              </div>
              <div className="bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-lg p-3">
                <p className="text-slate-400 text-xs">已领取币权</p>
                  <p className="text-white font-bold mt-1">{formatSeer(totalClaimedRights)} KNIGHTS</p>
              </div>
              <div className="bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-lg p-3">
                <p className="text-slate-400 text-xs">待领取币权</p>
                  <p className="text-violet-300 font-bold mt-1">{formatSeer(totalPendingRights)} KNIGHTS</p>
              </div>
              <div className="bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-lg p-3">
                <p className="text-slate-400 text-xs">解锁进度</p>
                <p className="text-amber-300 font-bold mt-1">{formatPercent(nodeRightsDetail?.unlockedBP ?? 0)}%</p>
              </div>
              <div className="bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-lg p-3">
                <p className="text-slate-400 text-xs">节点等级状态</p>
                <p className="text-white font-bold mt-1">
                  当前 {nodeRightsDetail?.currentTier ? getTierLabel(nodeRightsDetail.currentTier) : "-"}
                  {" / "}
                  最高 {nodeRightsDetail?.maxTier ? getTierLabel(nodeRightsDetail.maxTier) : "-"}
                </p>
              </div>
              <div className="bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-lg p-3">
                <p className="text-slate-400 text-xs">保护期截至</p>
                <p className="text-white font-bold mt-1">{formatDateTime(nodeRightsDetail?.protectedUntil ?? 0)}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-lg p-3">
                <p className="text-slate-400">首购时间</p>
                <p className="text-slate-200 mt-1">{formatDateTime(firstPurchaseTime)}</p>
              </div>
              <div className="bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-lg p-3">
                <p className="text-slate-400">最近购买时间</p>
                <p className="text-slate-200 mt-1">{formatDateTime(lastPurchaseTime)}</p>
              </div>
            </div>
          </div>

          <div className="bg-[#13102B]/60 border border-indigo-500/15 rounded-xl p-4">
            <p className="text-white font-bold text-sm mb-3">收益操作</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleClaimNodeReward}
                disabled={!isConnected || pendingNodeReward === 0n || claimingReward}
                className="px-3 py-2 rounded-lg text-sm font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claimingReward ? "领取中..." : "领取节点分红"}
              </button>
              <button
                onClick={handleClaimNodeRights}
                disabled={!isConnected || totalPendingRights === 0n || claimingRights}
                className="px-3 py-2 rounded-lg text-sm font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {claimingRights ? "领取中..." : "一键领取全部节点币权"}
              </button>
              <button
                onClick={fetchNodeData}
                disabled={loadingNodes}
                className="px-3 py-2 rounded-lg text-sm font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
              >
                <RefreshCw size={14} className={loadingNodes ? "animate-spin" : ""} /> 刷新
              </button>
            </div>
          </div>

          <div className="bg-[#13102B]/60 border border-indigo-500/15 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-bold flex items-center gap-2">
                <ShieldCheck size={16} className="text-indigo-300" /> 已购买节点
              </p>
              <p className="text-slate-400 text-xs">共 {nodeLots.length} 笔</p>
            </div>
            <p className="text-slate-500 text-xs mb-3">每一笔节点都是独立 lot，显示独立的购买时间、保护期、币权分配、已领与待领。</p>
            {loadingNodes ? (
              <p className="text-slate-400 text-sm">加载中...</p>
            ) : nodeLots.length === 0 ? (
              <p className="text-slate-400 text-sm">暂无节点购买记录</p>
            ) : (
              <div className="space-y-2">
                {nodeLots.map((lot, idx) => (
                  <div key={`${lot.lotId}-${lot.purchaseTime}-${idx}`} className="bg-[#0F0B1E]/70 border border-indigo-500/10 rounded-lg p-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-white text-sm font-bold">第 {idx + 1} 笔 · {lot.claimableByLot ? `Lot #${lot.lotId}` : "历史记录"} · {getTierLabel(lot.tier)} 节点</p>
                        <p className="text-slate-500 text-xs">购买时间：{formatDateTime(lot.purchaseTime)}</p>
                        <p className="text-slate-500 text-xs">保护期截至：{formatDateTime(lot.protectedUntil)}</p>
                        <p className={`text-[11px] ${lot.active ? "text-emerald-300" : "text-slate-500"}`}>
                          状态：{lot.active ? "生效中" : "已失效/已退出"}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-amber-300 text-sm font-bold">{formatUsdt(lot.costUsdt)} USDT</p>
                        <p className="text-slate-600 text-[11px] mt-1">购买金额</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-xs">
                      <div className="bg-[#13102B]/70 rounded-lg p-2 border border-indigo-500/10">
                        <p className="text-slate-400">分配币权</p>
                          <p className="text-emerald-300 font-bold mt-1">{formatSeer(lot.allocatedRights)} KNIGHTS</p>
                      </div>
                      <div className="bg-[#13102B]/70 rounded-lg p-2 border border-indigo-500/10">
                        <p className="text-slate-400">已领币权</p>
                          <p className="text-white font-bold mt-1">{formatSeer(lot.claimedRights)} KNIGHTS</p>
                      </div>
                      <div className="bg-[#13102B]/70 rounded-lg p-2 border border-indigo-500/10">
                        <p className="text-slate-400">待领币权</p>
                          <p className="text-violet-300 font-bold mt-1">{formatSeer(lot.pendingRights)} KNIGHTS</p>
                      </div>
                      <div className="bg-[#13102B]/70 rounded-lg p-2 border border-indigo-500/10">
                        <p className="text-slate-400">节点权重</p>
                        <p className="text-white font-bold mt-1">{lot.weight.toString()}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleClaimLotRights(lot.lotId)}
                        disabled={!isConnected || !lot.claimableByLot || lot.pendingRights === 0n || claimingLotId !== null}
                        className="px-3 py-2 rounded-lg text-sm font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {claimingLotId === lot.lotId ? "领取中..." : lot.claimableByLot ? `领取 Lot #${lot.lotId} 币权` : "旧版节点暂不支持按 lot 领取"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default NodeRecruitmentCampaign;
