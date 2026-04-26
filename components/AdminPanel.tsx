import { ethers } from "ethers";
import { AlertTriangle, DollarSign, Layers, Megaphone, Pause, Pickaxe, Play, RefreshCw, Settings, Shield, Users } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useLanguage } from "../src/LanguageContext";
import { fetchAnnouncements, saveAnnouncementContent, saveRemoteRuntimeConfig } from "../src/services/announcementStorage";
import { useWeb3 } from "../src/Web3Context";
import AdminMinerManager from "./AdminMinerManager";
import AdminNodeManager from "./AdminNodeManager";
import AnimatedButton from "./AnimatedButton";

const AdminPanel: React.FC = () => {
  const { t } = useLanguage();
  const {
    account, isConnected, isOwner, isAdmin, adminRole, provider, protocolContract, usdtContract, seerContract, minerNodeContract,
    airdropContract, refreshBalances, usdtDecimals, contractAddresses: CONTRACT_ADDRESSES,
    runtimeSettings, updateRuntimeSettings, resetRuntimeSettings, checkOwnerStatus
  } = useWeb3();

  const [paused, setPaused] = useState(false);
  const [nodeSaleOpen, setNodeSaleOpen] = useState(true);
  const [minerSaleOpen, setMinerSaleOpen] = useState(true);
  const [seerPrice, setSeerPrice] = useState("");
  const [fundAmount, setFundAmount] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [targetLevel, setTargetLevel] = useState("0");
  const [loading, setLoading] = useState<string | null>(null);
  const [announcementLanguage, setAnnouncementLanguage] = useState("zh");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [nodeRightsFundAmount, setNodeRightsFundAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "controls" | "miners" | "nodes" | "settings">("overview");
  const [settingsSwapRouter, setSettingsSwapRouter] = useState("");
  const [settingsSwapPair, setSettingsSwapPair] = useState("");
  const [settingsUsdtAddress, setSettingsUsdtAddress] = useState("");
  const [settingsUsdtDecimals, setSettingsUsdtDecimals] = useState("");
  const [newSuperAdminAddress, setNewSuperAdminAddress] = useState("");
  const [newManagerAddress, setNewManagerAddress] = useState("");
  const [superAdminList, setSuperAdminList] = useState<string[]>([]);
  const [managerList, setManagerList] = useState<string[]>([]);

  // Protocol statistics
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalMiners, setTotalMiners] = useState(0);
  const [miningPoolBalance, setMiningPoolBalance] = useState(0n);
  const [protocolSeerBalance, setProtocolSeerBalance] = useState(0n);
  const [estimatedPendingWithdraw, setEstimatedPendingWithdraw] = useState(0n);
  const [poolHealthLoading, setPoolHealthLoading] = useState(false);
  const [contractFunds, setContractFunds] = useState({
    protocol: { eth: 0n, usdt: 0n, knights: 0n },
    airdrop: { eth: 0n, usdt: 0n, knights: 0n },
    minerNode: { eth: 0n, usdt: 0n, knights: 0n },
  });

  // New protocol stats
  const [totalActiveMiners, setTotalActiveMiners] = useState(0);
  const [totalUsdtReceived, setTotalUsdtReceived] = useState(0n);
  const [totalSeerDistributed, setTotalSeerDistributed] = useState(0n);
  const [onChainCycleDays, setOnChainCycleDays] = useState({ basic: 0, v1: 0, v2: 0, v3: 0 });
  const [nodeRightsUnlockedBP, setNodeRightsUnlockedBP] = useState(0n);
  const [nodeRightsPoolFunded, setNodeRightsPoolFunded] = useState(0n);
  const [nodeRightsPoolClaimed, setNodeRightsPoolClaimed] = useState(0n);

  // Admin control inputs
  const [newAirdropManager, setNewAirdropManager] = useState("");
  const [newMinerNode, setNewMinerNode] = useState("");
  const [newFoundationWallet, setNewFoundationWallet] = useState("");
  const [newCycleDays, setNewCycleDays] = useState({ basic: "", v1: "", v2: "", v3: "" });
  const [currentSeerPriceUsdt, setCurrentSeerPriceUsdt] = useState(0n);
  const [currentAirdropManager, setCurrentAirdropManager] = useState("");
  const [currentMinerNode, setCurrentMinerNode] = useState("");
  const [currentFoundationWallet, setCurrentFoundationWallet] = useState("");

  const formatDisplayedUsdt = (value: bigint) =>
    Number(ethers.formatUnits(value, usdtDecimals)).toLocaleString("en-US", { maximumFractionDigits: 2 });

  const formatProtocolUsdt = (value: bigint) =>
    Number(ethers.formatUnits(value, usdtDecimals)).toLocaleString("en-US", { maximumFractionDigits: 2 });

  const canManageSuperAdmins = adminRole === "SUPER_ADMIN";
  const canManageManagers = adminRole === "SUPER_ADMIN";
  const canOperateProtocolSwitches = adminRole === "SUPER_ADMIN";
  const canConfigAdminActions = adminRole === "SUPER_ADMIN" || adminRole === "OPERATOR_ADMIN";

  const requireSuperAdminAction = (actionName: string): boolean => {
    if (adminRole === "SUPER_ADMIN") return true;
    toast.error(`仅 owner 或【admin超管】可执行：${actionName}`);
    return false;
  };

  const requireConfigAdminAction = (actionName: string): boolean => {
    if (canConfigAdminActions) return true;
    toast.error(`仅 owner /【admin超管】/【manager管理员】可执行：${actionName}`);
    return false;
  };

  const requireProtocolSwitchAction = (actionName: string): boolean => {
    if (canOperateProtocolSwitches) return true;
    toast.error(`仅 owner 或【admin超管】可执行：${actionName}`);
    return false;
  };

  const loadRoleLists = useCallback(async () => {
    if (!protocolContract) {
      setSuperAdminList([]);
      setManagerList([]);
      return;
    }
    try {
      const [supers, managers] = await Promise.all([
        (protocolContract as any).getSuperAdmins(),
        (protocolContract as any).getManagers(),
      ]);
      setSuperAdminList((supers as string[]).map((item) => item.toLowerCase()));
      setManagerList((managers as string[]).map((item) => item.toLowerCase()));
    } catch {
      setSuperAdminList([]);
      setManagerList([]);
    }
  }, [protocolContract]);

  const fetchAnnouncement = useCallback(async (lang: string) => {
    setLoading("announcement-load");
    try {
      const data = await fetchAnnouncements(true);
      const normalized = lang === "en" ? "en" : "zh";
      setAnnouncementContent(data[normalized] || "");
    } catch (err: any) {
      toast.error(err?.message || "获取公告失败");
    } finally {
      setLoading(null);
    }
  }, []);

  const fetchAdminData = useCallback(async () => {
    if (!protocolContract) return;
    try {
      const p = await protocolContract.paused();
      setPaused(p);

      try { setNodeSaleOpen(await protocolContract.nodeSaleOpen()); } catch {}
      try { setMinerSaleOpen(await protocolContract.minerSaleOpen()); } catch {}

      try {
        const users = await protocolContract.totalUsers();
        setTotalUsers(Number(users));
      } catch {}

      try {
        const pool = await protocolContract.miningPoolRemaining();
        setMiningPoolBalance(pool);
      } catch {}

      try { setTotalActiveMiners(Number(await protocolContract.totalActiveMiners())); } catch {}
      try { setTotalUsdtReceived(await protocolContract.totalUsdtReceived()); } catch {}
      try { setTotalSeerDistributed(await protocolContract.totalSeerDistributed()); } catch {}
      try {
        const [priceUsdt, airdropAddr, minerNodeAddr, foundationAddr] = await Promise.all([
          (protocolContract as any).seerPriceUsdt(),
          (protocolContract as any).airdropManager(),
          (protocolContract as any).minerNode(),
          (protocolContract as any).foundationWallet(),
        ]);

        setCurrentSeerPriceUsdt(priceUsdt);

        const normalizeAddress = (addr?: string) => {
          if (!addr || addr === ethers.ZeroAddress) return "";
          return addr;
        };

        const normalizedAirdrop = normalizeAddress(airdropAddr);
        const normalizedMinerNode = normalizeAddress(minerNodeAddr);
        const normalizedFoundation = normalizeAddress(foundationAddr);

        setCurrentAirdropManager(normalizedAirdrop);
        setCurrentMinerNode(normalizedMinerNode);
        setCurrentFoundationWallet(normalizedFoundation);

        setSeerPrice((prev) => (prev.trim() ? prev : ethers.formatUnits(priceUsdt, usdtDecimals)));
        setNewAirdropManager((prev) => (prev.trim() ? prev : normalizedAirdrop));
        setNewMinerNode((prev) => (prev.trim() ? prev : normalizedMinerNode));
        setNewFoundationWallet((prev) => (prev.trim() ? prev : normalizedFoundation));
      } catch {}

      try {
        const [b, v1, v2, v3] = await Promise.all([
          protocolContract.basicMinerCycleDays(),
          protocolContract.v1MinerCycleDays(),
          protocolContract.v2MinerCycleDays(),
          protocolContract.v3MinerCycleDays(),
        ]);
        const basic = Number(b);
        const v1Days = Number(v1);
        const v2Days = Number(v2);
        const v3Days = Number(v3);
        setOnChainCycleDays({ basic, v1: v1Days, v2: v2Days, v3: v3Days });
        setNewCycleDays((prev) => ({
          basic: prev.basic || (basic > 0 ? String(basic) : ""),
          v1: prev.v1 || (v1Days > 0 ? String(v1Days) : ""),
          v2: prev.v2 || (v2Days > 0 ? String(v2Days) : ""),
          v3: prev.v3 || (v3Days > 0 ? String(v3Days) : ""),
        }));
      } catch {}

      if (minerNodeContract) {
        try {
          const [unlockedBp, funded, claimed] = await Promise.all([
            (minerNodeContract as any).nodeRightsUnlockedBP(),
            (minerNodeContract as any).nodeRightsPoolFunded(),
            (minerNodeContract as any).nodeRightsPoolClaimed(),
          ]);
          setNodeRightsUnlockedBP(unlockedBp);
          setNodeRightsPoolFunded(funded);
          setNodeRightsPoolClaimed(claimed);
        } catch {}
      }

      const emptyFunds = { eth: 0n, usdt: 0n, knights: 0n };
      const readContractFunds = async (contract: ethers.Contract | null) => {
        if (!contract || !provider) return emptyFunds;
        const contractAddress = await contract.getAddress();
        const [eth, usdt, knights] = await Promise.all([
          provider.getBalance(contractAddress),
          usdtContract ? usdtContract.balanceOf(contractAddress) : Promise.resolve(0n),
          seerContract ? seerContract.balanceOf(contractAddress) : Promise.resolve(0n),
        ]);
        return { eth, usdt, knights };
      };

      try {
        const [protocolFunds, airdropFunds, minerNodeFunds] = await Promise.all([
          readContractFunds(protocolContract),
          readContractFunds(airdropContract),
          readContractFunds(minerNodeContract),
        ]);
        setContractFunds({
          protocol: protocolFunds,
          airdrop: airdropFunds,
          minerNode: minerNodeFunds,
        });
      } catch (fundsErr) {
        console.error("Contract funds fetch error:", fundsErr);
      }

      if (seerContract) {
        setPoolHealthLoading(true);
        try {
          const protocolAddr = await protocolContract.getAddress();
          const protocolBalance = await seerContract.balanceOf(protocolAddr);
          setProtocolSeerBalance(protocolBalance);

          const [miningClaimedEvents, dailyCheckinEvents, referralRewardEvents, differentialRewardEvents, equalLevelBonusEvents, communityTaxEvents, withdrawalEvents] = await Promise.all([
            protocolContract.queryFilter(protocolContract.filters.MiningClaimed()),
            protocolContract.queryFilter(protocolContract.filters.DailyCheckin()),
            protocolContract.queryFilter(protocolContract.filters.ReferralReward()),
            protocolContract.queryFilter(protocolContract.filters.DifferentialReward()),
            protocolContract.queryFilter(protocolContract.filters.EqualLevelBonus()),
            protocolContract.queryFilter(protocolContract.filters.CommunityTax()),
            protocolContract.queryFilter(protocolContract.filters.Withdrawal()),
          ]);

          const sumEventArg = (events: any[], argIndex: number, argName: string) => {
            return events.reduce((acc: bigint, ev: any) => {
              const byName = ev?.args?.[argName];
              const byIndex = ev?.args?.[argIndex];
              const value = typeof byName !== "undefined" ? byName : byIndex;
              return acc + BigInt(value ?? 0n);
            }, 0n);
          };

          const miningToWithdraw = sumEventArg(miningClaimedEvents, 2, "toWithdraw");
          const dailyRewardTotal = sumEventArg(dailyCheckinEvents, 1, "reward");
          const dailyToWithdraw = (dailyRewardTotal * 7000n) / 10000n;

          const referralRewards = sumEventArg(referralRewardEvents, 2, "amount");
          const differentialRewards = sumEventArg(differentialRewardEvents, 2, "amount");
          const equalLevelBonus = sumEventArg(equalLevelBonusEvents, 2, "amount");
          const communityTax = sumEventArg(communityTaxEvents, 2, "amount");
          const dynamicRewards = referralRewards + differentialRewards + equalLevelBonus + communityTax;

          const totalWithdrawn = sumEventArg(withdrawalEvents, 1, "seerAmount");
          const totalCreditedToWithdraw = miningToWithdraw + dailyToWithdraw + dynamicRewards;
          const estimatedPending = totalCreditedToWithdraw > totalWithdrawn
            ? totalCreditedToWithdraw - totalWithdrawn
            : 0n;

          setEstimatedPendingWithdraw(estimatedPending);
        } catch (healthErr) {
          console.error("Pool health fetch error:", healthErr);
        } finally {
          setPoolHealthLoading(false);
        }
      }
    } catch (err) {
      console.error("Admin data fetch:", err);
    }
  }, [protocolContract, seerContract, provider, usdtContract, airdropContract, minerNodeContract]);

  useEffect(() => {
    if (isAdmin) fetchAdminData();
  }, [isAdmin, fetchAdminData]);

  useEffect(() => {
    if (isAdmin) {
      fetchAnnouncement(announcementLanguage);
    }
  }, [isAdmin, announcementLanguage, fetchAnnouncement]);

  useEffect(() => {
    if (isAdmin) {
      loadRoleLists();
    }
  }, [isAdmin, loadRoleLists]);

  useEffect(() => {
    setSettingsSwapRouter(runtimeSettings.dexRouterAddress || "");
    setSettingsSwapPair(runtimeSettings.dexPairAddress || "");
    setSettingsUsdtAddress(runtimeSettings.usdtAddress || "");
    setSettingsUsdtDecimals(runtimeSettings.usdtDecimalsOverride || "");
  }, [runtimeSettings]);

  const validateAddressOrEmpty = (value: string, label: string) => {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (!ethers.isAddress(trimmed)) {
      toast.error(`${label} 地址格式不正确`);
      return false;
    }
    return true;
  };

  const handleSaveRuntimeSettings = async () => {
    const decimalsText = settingsUsdtDecimals.trim();
    if (!validateAddressOrEmpty(settingsSwapRouter, "Swap Router")) return;
    if (!validateAddressOrEmpty(settingsSwapPair, "Swap Pair")) return;
    if (!validateAddressOrEmpty(settingsUsdtAddress, "USDT")) return;

    if (decimalsText) {
      const parsed = Number(decimalsText);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 36 || !Number.isInteger(parsed)) {
        toast.error("USDT 精度需为 0 到 36 的整数");
        return;
      }
    }

    const patch = {
      dexRouterAddress: settingsSwapRouter.trim(),
      dexPairAddress: settingsSwapPair.trim(),
      usdtAddress: settingsUsdtAddress.trim(),
      usdtDecimalsOverride: decimalsText,
    };
    updateRuntimeSettings(patch);

    // 同步到 JSONBin，让所有用户浏览器下次拉取时获得最新配置
    try {
      await saveRemoteRuntimeConfig(patch);
      toast.success("参数已保存并同步到远程，所有用户将在刷新后生效");
    } catch (remoteErr: any) {
      toast.success("参数已保存（当前浏览器即时生效，远程同步失败：" + (remoteErr?.message || "网络错误") + "）");
    }

    await checkOwnerStatus();
  };

  const handleResetRuntimeSettings = async () => {
    resetRuntimeSettings();
    await checkOwnerStatus();
    toast.success("已恢复为环境变量默认配置");
  };

  const handleAddSuperAdmin = async () => {
    if (!canManageSuperAdmins) {
      toast.error("仅 owner 或【admin超管】可以添加/删除超管");
      return;
    }
    const candidate = newSuperAdminAddress.trim().toLowerCase();
    if (!ethers.isAddress(candidate)) {
      toast.error("请输入有效的超管地址");
      return;
    }
    if (superAdminList.includes(candidate)) {
      toast.error("该地址已是超管");
      return;
    }

    setLoading("add-super-admin");
    try {
      const tx = await (protocolContract as any).addSuperAdmin(candidate);
      await tx.wait();
      await loadRoleLists();
      await checkOwnerStatus();
      setNewSuperAdminAddress("");
      toast.success("已添加 1 个【admin超管】");
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || "添加超管失败");
    } finally {
      setLoading(null);
    }
  };

  const handleRemoveSuperAdmin = async (target: string) => {
    if (!canManageSuperAdmins) {
      toast.error("仅 owner 或【admin超管】可以添加/删除超管");
      return;
    }
    setLoading(`remove-super-admin-${target}`);
    try {
      const tx = await (protocolContract as any).removeSuperAdmin(target);
      await tx.wait();
      await loadRoleLists();
      await checkOwnerStatus();
      toast.success("已删除 1 个【admin超管】");
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || "删除超管失败");
    } finally {
      setLoading(null);
    }
  };

  const handleAddManager = async () => {
    if (!canManageManagers) {
      toast.error("仅 owner 或【admin超管】可以添加/删除【manager管理员】");
      return;
    }
    const candidate = newManagerAddress.trim().toLowerCase();
    if (!ethers.isAddress(candidate)) {
      toast.error("请输入有效的管理员地址");
      return;
    }
    if (managerList.includes(candidate)) {
      toast.error("该地址已是管理员");
      return;
    }

    setLoading("add-manager");
    try {
      const tx = await (protocolContract as any).addManager(candidate);
      await tx.wait();
      await loadRoleLists();
      await checkOwnerStatus();
      setNewManagerAddress("");
      toast.success("已添加 1 个【manager管理员】");
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || "添加管理员失败");
    } finally {
      setLoading(null);
    }
  };

  const handleRemoveManager = async (target: string) => {
    if (!canManageManagers) {
      toast.error("仅 owner 或【admin超管】可以添加/删除【manager管理员】");
      return;
    }
    setLoading(`remove-manager-${target}`);
    try {
      const tx = await (protocolContract as any).removeManager(target);
      await tx.wait();
      await loadRoleLists();
      await checkOwnerStatus();
      toast.success("已删除 1 个【manager管理员】");
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || "删除管理员失败");
    } finally {
      setLoading(null);
    }
  };

  // 暂停/恢复
  const handleTogglePause = async () => {
    if (!protocolContract) return;
    if (!requireProtocolSwitchAction("暂停/恢复协议")) return;
    setLoading("pause");
    try {
      const tx = await protocolContract.setPaused(!paused);
      await tx.wait();
      setPaused(!paused);
      toast.success(paused ? "协议已恢复" : "协议已暂停");
    } catch (err: any) {
      toast.error(err?.reason || "操作失败");
    } finally {
      setLoading(null);
    }
  };

  // 开关节点售卖
  const handleToggleNodeSale = async () => {
    if (!protocolContract) return;
    if (!requireProtocolSwitchAction("节点售卖开关")) return;
    setLoading("nodeSale");
    try {
      const tx = await (protocolContract as any).setNodeSaleOpen(!nodeSaleOpen);
      await tx.wait();
      setNodeSaleOpen(!nodeSaleOpen);
      toast.success(nodeSaleOpen ? "节点售卖已关闭" : "节点售卖已开启");
    } catch (err: any) {
      toast.error(err?.reason || "操作失败");
    } finally {
      setLoading(null);
    }
  };

  // 开关矿机售卖
  const handleToggleMinerSale = async () => {
    if (!protocolContract) return;
    if (!requireProtocolSwitchAction("矿机售卖开关")) return;
    setLoading("minerSale");
    try {
      const tx = await (protocolContract as any).setMinerSaleOpen(!minerSaleOpen);
      await tx.wait();
      setMinerSaleOpen(!minerSaleOpen);
      toast.success(minerSaleOpen ? "矿机售卖已关闭" : "矿机售卖已开启");
    } catch (err: any) {
      toast.error(err?.reason || "操作失败");
    } finally {
      setLoading(null);
    }
  };

  // 更新 KNIGHTS 价格
  const handleUpdatePrice = async () => {
    if (!protocolContract || !seerPrice) return;
    if (!requireConfigAdminAction("更新 KNIGHTS 价格")) return;
    setLoading("price");
    try {
      const priceWei = ethers.parseUnits(seerPrice, usdtDecimals);
      const tx = await protocolContract.updatePrice(priceWei);
      await tx.wait();
      toast.success(`KNIGHTS 价格已更新为 ${seerPrice} U`);
      await fetchAdminData();
    } catch (err: any) {
      toast.error(err?.reason || "价格更新失败");
    } finally {
      setLoading(null);
    }
  };

  // 充值矿池
  const handleFundPool = async () => {
    if (!protocolContract || !seerContract || !fundAmount) return;
    if (!requireSuperAdminAction("充值矿池")) return;
    setLoading("fund");
    try {
      const amount = ethers.parseEther(fundAmount);
      const protocolAddr = await protocolContract.getAddress();

      // 授权 KNIGHTS
      toast.loading("授权 KNIGHTS...", { id: "approve-fund" });
      const approveTx = await seerContract.approve(protocolAddr, amount);
      await approveTx.wait();
      toast.dismiss("approve-fund");

      // 充值
      toast.loading("充值矿池...", { id: "fund" });
      const tx = await protocolContract.fundMiningPool(amount);
      await tx.wait();
      toast.dismiss("fund");
      toast.success(`已充值 ${fundAmount} KNIGHTS 到矿池`);
      setFundAmount("");
      await fetchAdminData();
    } catch (err: any) {
      toast.dismiss("approve-fund");
      toast.dismiss("fund");
      toast.error(err?.reason || "充值失败");
    } finally {
      setLoading(null);
    }
  };

  // 充值节点币权池
  const handleFundNodeRightsPool = async () => {
    if (!minerNodeContract || !seerContract || !nodeRightsFundAmount) return;
    if (!requireSuperAdminAction("充值节点币权池")) return;
    setLoading("fund-node-rights");
    try {
      const amount = ethers.parseEther(nodeRightsFundAmount);
      const minerNodeAddr = await minerNodeContract.getAddress();

      toast.loading("授权 KNIGHTS 到节点币权池...", { id: "approve-node-rights" });
      const approveTx = await seerContract.approve(minerNodeAddr, amount);
      await approveTx.wait();
      toast.dismiss("approve-node-rights");

      toast.loading("充值节点币权池...", { id: "fund-node-rights" });
      const tx = await (minerNodeContract as any).fundNodeRightsPool(amount);
      await tx.wait();
      toast.dismiss("fund-node-rights");
      toast.success(`已充值 ${nodeRightsFundAmount} KNIGHTS 到节点币权池`);
      setNodeRightsFundAmount("");
      await fetchAdminData();
    } catch (err: any) {
      toast.dismiss("approve-node-rights");
      toast.dismiss("fund-node-rights");
      toast.error(err?.reason || err?.message || "充值节点币权池失败");
    } finally {
      setLoading(null);
    }
  };

  // 设置用户等级
  const handleSetLevel = async () => {
    if (!protocolContract || !targetAddress) return;
    if (!requireSuperAdminAction("设置用户等级")) return;
    setLoading("level");
    try {
      const tx = await protocolContract.setUserTeamLevel(targetAddress, Number(targetLevel));
      await tx.wait();
      toast.success(`已设置 ${targetAddress.slice(0, 8)}... 等级为 V${targetLevel}`);
      setTargetAddress("");
      setTargetLevel("0");
    } catch (err: any) {
      toast.error(err?.reason || "设置失败");
    } finally {
      setLoading(null);
    }
  };

  // 紧急提取
  const handleEmergencyWithdraw = async () => {
    if (!protocolContract) return;
    if (!requireSuperAdminAction("紧急提取")) return;
    const confirmed = window.confirm("确认紧急提取所有资金?此操作不可逆!");
    if (!confirmed) return;

    setLoading("emergency");
    try {
      const protocolAddr = await protocolContract.getAddress();
      let txCount = 0;

      if (usdtContract && CONTRACT_ADDRESSES.USDT) {
        const usdtInProtocol = await usdtContract.balanceOf(protocolAddr);
        if (usdtInProtocol > 0n) {
          const tx = await protocolContract.emergencyWithdrawToken(CONTRACT_ADDRESSES.USDT, usdtInProtocol);
          await tx.wait();
          txCount++;
        }
      }

      if (seerContract && CONTRACT_ADDRESSES.SEER_TOKEN) {
        const seerInProtocol = await seerContract.balanceOf(protocolAddr);
        if (seerInProtocol > 0n) {
          const tx = await protocolContract.emergencyWithdrawToken(CONTRACT_ADDRESSES.SEER_TOKEN, seerInProtocol);
          await tx.wait();
          txCount++;
        }
      }

      toast.success(txCount > 0 ? "紧急提取完成" : "协议内无可提取资金");
      await refreshBalances();
    } catch (err: any) {
      toast.error(err?.reason || "紧急提取失败");
    } finally {
      setLoading(null);
    }
  };

  const handleSaveAnnouncement = async () => {
    if (!account) return;

    const content = announcementContent.trim();
    if (!content) {
      toast.error("公告内容不能为空");
      return;
    }

    setLoading("announcement-save");
    try {
      await saveAnnouncementContent(announcementLanguage, content, account);

      toast.success("公告已发布（所有用户可见）");
      setAnnouncementContent(content);
    } catch (err: any) {
      toast.error(err?.message || "保存公告失败");
    } finally {
      setLoading(null);
    }
  };

  // 设置空投合约
  const handleSetAirdropManager = async () => {
    if (!protocolContract || !newAirdropManager.trim()) return;
    if (!requireSuperAdminAction("设置空投合约")) return;
    setLoading("airdropManager");
    try {
      const tx = await (protocolContract as any).setAirdropManager(newAirdropManager.trim());
      await tx.wait();
      toast.success("空投合约地址已更新");
      await fetchAdminData();
    } catch (err: any) {
      toast.error(err?.reason || "设置失败");
    } finally {
      setLoading(null);
    }
  };

  // 设置矿机节点合约
  const handleSetMinerNode = async () => {
    if (!protocolContract || !newMinerNode.trim()) return;
    if (!requireSuperAdminAction("设置矿机节点合约")) return;
    setLoading("minerNode");
    try {
      const tx = await (protocolContract as any).setMinerNode(newMinerNode.trim());
      await tx.wait();
      toast.success("矿机节点合约地址已更新");
      await fetchAdminData();
    } catch (err: any) {
      toast.error(err?.reason || "设置失败");
    } finally {
      setLoading(null);
    }
  };

  // 设置基金会钱包
  const handleSetFoundationWallet = async () => {
    if (!protocolContract || !newFoundationWallet.trim()) return;
    if (!requireSuperAdminAction("设置基金会钱包")) return;
    setLoading("foundationWallet");
    try {
      const tx = await (protocolContract as any).setFoundationWallet(newFoundationWallet.trim());
      await tx.wait();
      toast.success("基金会钱包地址已更新");
      await fetchAdminData();
    } catch (err: any) {
      toast.error(err?.reason || "设置失败");
    } finally {
      setLoading(null);
    }
  };

  // 设置矿机释放周期
  const handleSetMinerCycleDays = async () => {
    if (!protocolContract) return;
    if (!requireConfigAdminAction("设置矿机释放周期")) return;
    const basic = Number(newCycleDays.basic) || onChainCycleDays.basic || 100;
    const v1 = Number(newCycleDays.v1) || onChainCycleDays.v1 || 120;
    const v2 = Number(newCycleDays.v2) || onChainCycleDays.v2 || 60;
    const v3 = Number(newCycleDays.v3) || onChainCycleDays.v3 || 30;
    setLoading("cycleDays");
    try {
      const tx = await (protocolContract as any).setMinerCycleDays(basic, v1, v2, v3);
      await tx.wait();
      toast.success("矿机释放周期已更新");
      await fetchAdminData();
    } catch (err: any) {
      toast.error(err?.reason || "设置失败");
    } finally {
      setLoading(null);
    }
  };

  if (!isConnected || !isAdmin) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <Shield size={48} className="text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">仅管理员可访问</p>
            {isConnected && <p className="text-slate-500 text-xs mt-2">当前角色：{adminRole}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* 标题 */}
      <div className="bg-gradient-to-r from-rose-900/30 to-orange-900/30 border border-rose-500/20 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings size={22} className="text-rose-400" /> 管理面板
        </h2>
        <p className="text-slate-400 text-sm mt-1">KNIGHTS 管理控制台</p>
        <p className="text-slate-500 text-xs mt-1">当前角色：{adminRole === "SUPER_ADMIN" ? "超级管理员" : "运营管理员"}</p>
      </div>

      {/* 标签导航 */}
      <div className="flex gap-2 border-b border-indigo-500/15 bg-[#1A1532]/50 rounded-t-xl p-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 rounded-md font-semibold text-sm transition whitespace-nowrap ${
            activeTab === "overview"
              ? "bg-indigo-600 text-white"
              : "bg-transparent text-slate-400 hover:text-white"
          }`}
        >
          总览
        </button>
        <button
          onClick={() => setActiveTab("controls")}
          className={`px-4 py-2 rounded-md font-semibold text-sm transition whitespace-nowrap ${
            activeTab === "controls"
              ? "bg-indigo-600 text-white"
              : "bg-transparent text-slate-400 hover:text-white"
          }`}
        >
          控制
        </button>
        <button
          onClick={() => setActiveTab("miners")}
          className={`px-4 py-2 rounded-md font-semibold text-sm transition whitespace-nowrap flex items-center gap-1 ${
            activeTab === "miners"
              ? "bg-indigo-600 text-white"
              : "bg-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Pickaxe size={14} /> 矿机管理
        </button>
        <button
          onClick={() => setActiveTab("nodes")}
          className={`px-4 py-2 rounded-md font-semibold text-sm transition whitespace-nowrap flex items-center gap-1 ${
            activeTab === "nodes"
              ? "bg-indigo-600 text-white"
              : "bg-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Layers size={14} /> 节点管理
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2 rounded-md font-semibold text-sm transition whitespace-nowrap ${
            activeTab === "settings"
              ? "bg-indigo-600 text-white"
              : "bg-transparent text-slate-400 hover:text-white"
          }`}
        >
          设置
        </button>
      </div>

      {/* 协议状态 */}
      {activeTab === "overview" && (
      <div className="space-y-4">
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 text-center">
          <p className="text-slate-400 text-xs">总用户</p>
          <p className="text-xl font-bold text-white">{totalUsers}</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 text-center">
          <p className="text-slate-400 text-xs">矿池余额</p>
          <p className="text-lg font-bold text-emerald-400">
            {Number(ethers.formatEther(miningPoolBalance)).toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-slate-500 text-[10px]">KNIGHTS</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 text-center">
          <p className="text-slate-400 text-xs">协议状态</p>
          <p className={`text-lg font-bold ${paused ? "text-rose-400" : "text-emerald-400"}`}>
            {paused ? "已暂停" : "运行中"}
          </p>
        </div>

      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          <DollarSign size={16} className="text-emerald-400" /> 合约资金总览
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="bg-[#13102B]/70 border border-indigo-500/15 rounded-xl p-4">
            <p className="text-slate-300 font-semibold mb-2">协议合约</p>
            <p className="text-slate-400">ETH: <span className="text-white">{Number(ethers.formatEther(contractFunds.protocol.eth)).toLocaleString("en-US", { maximumFractionDigits: 4 })}</span></p>
            <p className="text-slate-400">USDT: <span className="text-white">{formatDisplayedUsdt(contractFunds.protocol.usdt)}</span></p>
            <p className="text-slate-400">KNIGHTS: <span className="text-white">{Number(ethers.formatEther(contractFunds.protocol.knights)).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></p>
          </div>
          <div className="bg-[#13102B]/70 border border-indigo-500/15 rounded-xl p-4">
            <p className="text-slate-300 font-semibold mb-2">空投合约</p>
            <p className="text-slate-400">ETH: <span className="text-white">{Number(ethers.formatEther(contractFunds.airdrop.eth)).toLocaleString("en-US", { maximumFractionDigits: 4 })}</span></p>
            <p className="text-slate-400">USDT: <span className="text-white">{formatDisplayedUsdt(contractFunds.airdrop.usdt)}</span></p>
            <p className="text-slate-400">KNIGHTS: <span className="text-white">{Number(ethers.formatEther(contractFunds.airdrop.knights)).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></p>
          </div>
          <div className="bg-[#13102B]/70 border border-indigo-500/15 rounded-xl p-4">
            <p className="text-slate-300 font-semibold mb-2">矿机节点合约</p>
            <p className="text-slate-400">ETH: <span className="text-white">{Number(ethers.formatEther(contractFunds.minerNode.eth)).toLocaleString("en-US", { maximumFractionDigits: 4 })}</span></p>
            <p className="text-slate-400">USDT: <span className="text-white">{formatDisplayedUsdt(contractFunds.minerNode.usdt)}</span></p>
            <p className="text-slate-400">KNIGHTS: <span className="text-white">{Number(ethers.formatEther(contractFunds.minerNode.knights)).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></p>
          </div>
        </div>
      </div>

      {/* 次级统计 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 text-center">
          <p className="text-slate-400 text-xs">活跃矿机</p>
          <p className="text-xl font-bold text-amber-400">{totalActiveMiners}</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 text-center">
          <p className="text-slate-400 text-xs">累计USDT收入</p>
          <p className="text-lg font-bold text-blue-400">
            {formatProtocolUsdt(totalUsdtReceived)}
          </p>
          <p className="text-slate-500 text-[10px]">USDT</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 text-center">
          <p className="text-slate-400 text-xs">累计KNIGHTS分发</p>
          <p className="text-lg font-bold text-violet-400">
            {Number(ethers.formatEther(totalSeerDistributed)).toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-slate-500 text-[10px]">KNIGHTS</p>
        </div>
      </div>

      {/* 资金池健康 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white font-bold flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-400" /> 资金池健康
          </h3>
          <AnimatedButton
            onClick={fetchAdminData}
            loading={poolHealthLoading}
            variant="secondary"
            className="px-3 py-1 text-xs"
          >
            刷新
          </AnimatedButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-[#13102B]/70 border border-indigo-500/15 rounded-xl p-4">
            <p className="text-slate-400 text-xs">协议 KNIGHTS 实际余额</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">
              {Number(ethers.formatEther(protocolSeerBalance)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </p>
            <p className="text-slate-500 text-[10px]">KNIGHTS</p>
          </div>

          <div className="bg-[#13102B]/70 border border-indigo-500/15 rounded-xl p-4">
            <p className="text-slate-400 text-xs">用户待提总额（估算）</p>
            <p className="text-xl font-bold text-white mt-1">
              {Number(ethers.formatEther(estimatedPendingWithdraw)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </p>
            <p className="text-slate-500 text-[10px]">KNIGHTS</p>
          </div>
        </div>

        {protocolSeerBalance >= estimatedPendingWithdraw ? (
          <p className="text-emerald-400 text-xs mt-3">
            资金池健康：余额充足（盈余 {Number(ethers.formatEther(protocolSeerBalance - estimatedPendingWithdraw)).toLocaleString("en-US", { maximumFractionDigits: 2 })} KNIGHTS）
          </p>
        ) : (
          <p className="text-rose-400 text-xs mt-3">
            资金池风险：余额不足，缺口 {Number(ethers.formatEther(estimatedPendingWithdraw - protocolSeerBalance)).toLocaleString("en-US", { maximumFractionDigits: 2 })} KNIGHTS，请尽快补充
          </p>
        )}
        <p className="text-slate-500 text-[10px] mt-1">
          说明：待提总额为事件聚合估算值（MiningClaimed.toWithdraw + DailyCheckin 的70% + 动态奖励 - Withdrawal）
        </p>
      </div>

      {/* 公告管理 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          <Megaphone size={16} className="text-violet-400" /> 公告管理（本地存储）
        </h3>
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={announcementLanguage}
              onChange={(e) => setAnnouncementLanguage(e.target.value)}
              className="bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="zh">简体中文</option>
              <option value="en">English</option>
            </select>
            <AnimatedButton
              onClick={() => fetchAnnouncement(announcementLanguage)}
              loading={loading === "announcement-load"}
              variant="secondary"
              className="px-4"
            >
              读取当前公告
            </AnimatedButton>
          </div>

          <textarea
            rows={3}
            placeholder="输入公告内容（最多500字符）"
            value={announcementContent}
            maxLength={500}
            onChange={(e) => setAnnouncementContent(e.target.value)}
            className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm resize-none"
          />

          <AnimatedButton
            onClick={handleSaveAnnouncement}
            loading={loading === "announcement-save"}
            variant="primary"
            className="w-full"
          >
            发布公告
          </AnimatedButton>
        </div>
      </div>

      {/* 暂停/恢复 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-white font-bold text-sm">协议暂停控制</p>
          <p className="text-slate-500 text-xs">暂停后用户无法购买、领取、提现</p>
        </div>
        <AnimatedButton
          onClick={handleTogglePause}
          loading={loading === "pause"}
          variant={paused ? "success" : "danger"}
          className="px-6"
        >
          {paused ? <><Play size={14} /> 恢复</> : <><Pause size={14} /> 暂停</>}
        </AnimatedButton>
      </div>

      {/* 售卖页面开关 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          <Settings size={16} className="text-cyan-400" /> 售卖页面开关
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-[#13102B]/70 border border-indigo-500/15 rounded-xl p-4">
            <div>
              <p className="text-white font-bold text-sm">节点售卖页面</p>
              <p className="text-slate-500 text-xs">关闭后用户无法查看和购买节点</p>
            </div>
            <AnimatedButton
              onClick={handleToggleNodeSale}
              loading={loading === "nodeSale"}
              variant={nodeSaleOpen ? "danger" : "success"}
              className="px-5"
            >
              {nodeSaleOpen ? <><Pause size={14} /> 关闭</> : <><Play size={14} /> 开启</>}
            </AnimatedButton>
          </div>
          <div className="flex items-center justify-between bg-[#13102B]/70 border border-indigo-500/15 rounded-xl p-4">
            <div>
              <p className="text-white font-bold text-sm">矿机售卖页面</p>
              <p className="text-slate-500 text-xs">关闭后用户无法查看和购买矿机</p>
            </div>
            <AnimatedButton
              onClick={handleToggleMinerSale}
              loading={loading === "minerSale"}
              variant={minerSaleOpen ? "danger" : "success"}
              className="px-5"
            >
              {minerSaleOpen ? <><Pause size={14} /> 关闭</> : <><Play size={14} /> 开启</>}
            </AnimatedButton>
          </div>
        </div>
      </div>

      {/* KNIGHTS 价格更新 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          <DollarSign size={16} className="text-amber-400" /> 更新 KNIGHTS 价格
        </h3>
        <div className="flex gap-2">
          <input
            type="number"
            step="0.0001"
            placeholder="USDT 价格 (例: 0.10)"
            value={seerPrice}
            onChange={(e) => setSeerPrice(e.target.value)}
            className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          <AnimatedButton
            onClick={handleUpdatePrice}
            loading={loading === "price"}
            variant="primary"
            className="px-6"
          >
            更新
          </AnimatedButton>
        </div>
        <p className="text-slate-500 text-[10px] mt-2">当前链上价格：{Number(ethers.formatUnits(currentSeerPriceUsdt, usdtDecimals)).toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT/KNIGHTS</p>
        <div className="mt-3 bg-[#13102B]/50 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-400 space-y-1">
          <p><span className="text-amber-400 font-semibold">参数说明</span>：KNIGHTS 代币相对于 USDT 的价格</p>
          <p><span className="text-cyan-400">有效范围</span>：0.0001 ~ 无上限</p>
          <p><span className="text-emerald-400">实际举例</span>：输入 0.10 表示 1 KNIGHTS = 0.10 USDT</p>
          <p><span className="text-violet-400">影响项</span>：节点币权解锁（价格每涨 0.5U 解锁 1%）</p>
          <p><span className="text-rose-400">⚠️ 注意</span>：价格更新会自动推进币权解锁进度</p>
        </div>
      </div>

      {/* 充值矿池 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          <RefreshCw size={16} className="text-emerald-400" /> 充值矿池
        </h3>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="KNIGHTS 数量"
            value={fundAmount}
            onChange={(e) => setFundAmount(e.target.value)}
            className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          <AnimatedButton
            onClick={handleFundPool}
            loading={loading === "fund"}
            variant="success"
            className="px-6"
          >
            充值
          </AnimatedButton>
        </div>
        <div className="mt-3 bg-[#13102B]/50 border border-emerald-500/20 rounded-lg p-3 text-xs text-slate-400 space-y-1">
          <p><span className="text-emerald-400 font-semibold">参数说明</span>：向矿池注入 KNIGHTS 代币供用户挖矿提取</p>
          <p><span className="text-cyan-400">推荐数量</span>：≥ 10000 KNIGHTS（单次充值）</p>
          <p><span className="text-amber-400">实际举例</span>：输入 50000 表示充值 50000 KNIGHTS</p>
          <p><span className="text-violet-400">当前矿池余额</span>：{Number(ethers.formatEther(miningPoolBalance)).toLocaleString('en-US', { maximumFractionDigits: 2 })} KNIGHTS</p>
          <p><span className="text-rose-400">⚠️ 重要</span>：需要授权 KNIGHTS → Protocol 合约，操作将消耗 Gas</p>
        </div>
      </div>

      {/* 节点币权池管理 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          <Shield size={16} className="text-violet-400" /> 节点币权池管理
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-[#13102B]/70 border border-indigo-500/15 rounded-xl p-3">
            <p className="text-slate-400 text-xs">币权解锁进度</p>
            <p className="text-violet-300 text-lg font-bold mt-1">{(Number(nodeRightsUnlockedBP) / 100).toFixed(2)}%</p>
          </div>
          <div className="bg-[#13102B]/70 border border-indigo-500/15 rounded-xl p-3">
            <p className="text-slate-400 text-xs">已注资</p>
            <p className="text-emerald-300 text-lg font-bold mt-1">
              {Number(ethers.formatEther(nodeRightsPoolFunded)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </p>
            <p className="text-slate-500 text-[10px]">KNIGHTS</p>
          </div>
          <div className="bg-[#13102B]/70 border border-indigo-500/15 rounded-xl p-3">
            <p className="text-slate-400 text-xs">可用余额</p>
            <p className="text-amber-300 text-lg font-bold mt-1">
              {Number(ethers.formatEther(nodeRightsPoolFunded - nodeRightsPoolClaimed)).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </p>
            <p className="text-slate-500 text-[10px]">KNIGHTS</p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="number"
            placeholder="节点币权池充值数量 (KNIGHTS)"
            value={nodeRightsFundAmount}
            onChange={(e) => setNodeRightsFundAmount(e.target.value)}
            className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          <AnimatedButton
            onClick={handleFundNodeRightsPool}
            loading={loading === "fund-node-rights"}
            variant="success"
            className="px-6"
          >
            充值币权池
          </AnimatedButton>
        </div>

        <p className="text-slate-500 text-xs mt-3">
          说明：节点币权由独立资金池兑付，需先注资；价格每上涨 0.5U 解锁 1%，随 updatePrice 自动推进。
        </p>
      </div>

      {/* 设置用户链上结算等级 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          <Users size={16} className="text-violet-400" /> 设置用户链上结算等级
        </h3>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="用户地址 (0x...)"
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
            className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
          />
          <div className="flex gap-2">
            <select
              value={targetLevel}
              onChange={(e) => setTargetLevel(e.target.value)}
              className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="0">无等级</option>
              <option value="1">V1</option>
              <option value="2">V2</option>
              <option value="3">V3</option>
              <option value="4">V4</option>
              <option value="5">V5</option>
            </select>
            <AnimatedButton
              onClick={handleSetLevel}
              loading={loading === "level"}
              variant="primary"
              className="px-6"
            >
              设置
            </AnimatedButton>
          </div>
        </div>
        <div className="mt-3 bg-[#13102B]/50 border border-violet-500/20 rounded-lg p-3 text-xs text-slate-400 space-y-1">
          <p><span className="text-violet-400 font-semibold">参数说明</span>：设置用户链上结算等级，影响待释放池日释放与链上结算</p>
          <div className="mt-2 space-y-1 text-slate-500">
            <p>• 无等级 (0): 普通用户，无等级奖励</p>
            <p>• V1 (1): 第一级，年收益 10%</p>
            <p>• V2 (2): 第二级，年收益 15%</p>
            <p>• V3 (3): 第三级，年收益 20%</p>
            <p>• V4 (4): 第四级，年收益 25%</p>
            <p>• V5 (5): 第五级 (顶级)，年收益 30%</p>
          </div>
          <p className="mt-2"><span className="text-cyan-400">实际举例</span>：设置 0x123...456 为 V3 结算等级</p>
          <p><span className="text-rose-400">⚠️ 注意</span>：更改后立即生效，会覆盖该地址当前链上结算等级</p>
        </div>
      </div>

      {/* 紧急提取 */}
            {/* 矿机释放周期 */}
            <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
              <h3 className="text-white font-bold mb-1 flex items-center gap-2">
                <RefreshCw size={16} className="text-cyan-400" /> 矿机释放周期（天）
              </h3>
              {onChainCycleDays.basic > 0 && (
                <p className="text-slate-500 text-xs mb-3">
                  当前：基础 {onChainCycleDays.basic}天 · V1 {onChainCycleDays.v1}天 · V2 {onChainCycleDays.v2}天 · V3 {onChainCycleDays.v3}天
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 mb-2">
                {(["basic","v1","v2","v3"] as const).map((k) => (
                  <input
                    key={k}
                    type="number"
                    placeholder={`${k.toUpperCase()} 周期天数`}
                    value={newCycleDays[k]}
                    onChange={(e) => setNewCycleDays(prev => ({ ...prev, [k]: e.target.value }))}
                    className="bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
                  />
                ))}
              </div>
              <AnimatedButton
                onClick={handleSetMinerCycleDays}
                loading={loading === "cycleDays"}
                variant="primary"
                className="w-full"
              >
                更新周期配置
              </AnimatedButton>
              <div className="mt-3 bg-[#13102B]/50 border border-cyan-500/20 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                <p><span className="text-cyan-400 font-semibold">参数说明</span>：设置不同等级矿机的释放周期（对标日结周期）</p>
                <div className="mt-2 space-y-1 text-slate-500">
                  <p>• Basic: 基础矿机释放周期 (当前: {onChainCycleDays.basic || 100} 天)</p>
                  <p>• V1: V1 矿机释放周期 (当前: {onChainCycleDays.v1 || 120} 天)</p>
                  <p>• V2: V2 矿机释放周期 (当前: {onChainCycleDays.v2 || 60} 天)</p>
                  <p>• V3: V3 矿机释放周期 (当前: {onChainCycleDays.v3 || 30} 天)</p>
                </div>
                <p className="mt-2"><span className="text-emerald-400">实际举例</span>：Basic=100, V1=120, V2=60, V3=30</p>
                <p><span className="text-rose-400">⚠️ 注意</span>：周期越短，收益释放越快；需谨慎调整以平衡生态</p>
              </div>
            </div>

            {/* 合约地址管理 */}
            <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Settings size={16} className="text-indigo-400" /> 合约地址管理
              </h3>

              <div>
                <p className="text-slate-400 text-xs mb-1">空投合约 (AirdropManager)</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="新空投合约地址 (0x...)"
                    value={newAirdropManager}
                    onChange={(e) => setNewAirdropManager(e.target.value)}
                    className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
                  />
                  <AnimatedButton
                    onClick={handleSetAirdropManager}
                    loading={loading === "airdropManager"}
                    variant="primary"
                    className="px-4 flex-shrink-0"
                  >
                    设置
                  </AnimatedButton>
                </div>
                <p className="text-slate-500 text-[10px] mt-1">💡 管理空投分发的合约地址，格式：0x 开头的 42 个字符。示例：0x742d35Cc6634C0532925a3b844Bc3e7d4f9f58e7</p>
                {currentAirdropManager && <p className="text-slate-500 text-[10px] mt-1">当前链上值：{currentAirdropManager}</p>}
              </div>

              <div>
                <p className="text-slate-400 text-xs mb-1">矿机节点合约 (MinerNode)</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="新矿机节点合约地址 (0x...)"
                    value={newMinerNode}
                    onChange={(e) => setNewMinerNode(e.target.value)}
                    className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
                  />
                  <AnimatedButton
                    onClick={handleSetMinerNode}
                    loading={loading === "minerNode"}
                    variant="primary"
                    className="px-4 flex-shrink-0"
                  >
                    设置
                  </AnimatedButton>
                </div>
                <p className="text-slate-500 text-[10px] mt-1">💡 管理矿机节点和币权的合约地址。格式：0x 开头的 42 个字符。示例：0x8ba1f109551bD432803012645Ac136ddd64DBA72</p>
                {currentMinerNode && <p className="text-slate-500 text-[10px] mt-1">当前链上值：{currentMinerNode}</p>}
              </div>

              <div>
                <p className="text-slate-400 text-xs mb-1">基金会钱包</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="新基金会钱包地址 (0x...)"
                    value={newFoundationWallet}
                    onChange={(e) => setNewFoundationWallet(e.target.value)}
                    className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
                  />
                  <AnimatedButton
                    onClick={handleSetFoundationWallet}
                    loading={loading === "foundationWallet"}
                    variant="primary"
                    className="px-4 flex-shrink-0"
                  >
                    设置
                  </AnimatedButton>
                </div>
                <p className="text-slate-500 text-[10px] mt-1">💡 接收基金会税收的钱包地址。格式：0x 开头的 42 个字符。示例：0x1234567890123456789012345678901234567890</p>
                {currentFoundationWallet && <p className="text-slate-500 text-[10px] mt-1">当前链上值：{currentFoundationWallet}</p>}
              </div>
            </div>

      {/* 设置空投合约 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3">设置空投合约</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="AirdropManager 地址 (0x...)"
            value={newAirdropManager}
            onChange={(e) => setNewAirdropManager(e.target.value)}
            className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
          />
          <AnimatedButton
            onClick={handleSetAirdropManager}
            loading={loading === "airdropManager"}
            variant="primary"
            className="px-6"
          >
            设置
          </AnimatedButton>
        </div>
      </div>

      {/* 设置节点合约 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3">设置矿机节点合约</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="MinerNode 地址 (0x...)"
            value={newMinerNode}
            onChange={(e) => setNewMinerNode(e.target.value)}
            className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
          />
          <AnimatedButton
            onClick={handleSetMinerNode}
            loading={loading === "minerNode"}
            variant="primary"
            className="px-6"
          >
            设置
          </AnimatedButton>
        </div>
      </div>

      {/* 设置基金会钱包 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3">设置基金会钱包</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Foundation 钱包地址 (0x...)"
            value={newFoundationWallet}
            onChange={(e) => setNewFoundationWallet(e.target.value)}
            className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
          />
          <AnimatedButton
            onClick={handleSetFoundationWallet}
            loading={loading === "foundationWallet"}
            variant="primary"
            className="px-6"
          >
            设置
          </AnimatedButton>
        </div>
      </div>

      {/* 设置矿机周期 */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3">矿机释放周期（天）</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <input
            type="number"
            placeholder={`Basic (${onChainCycleDays.basic || 100})`}
            value={newCycleDays.basic}
            onChange={(e) => setNewCycleDays((prev) => ({ ...prev, basic: e.target.value }))}
            className="bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          <input
            type="number"
            placeholder={`V1 (${onChainCycleDays.v1 || 120})`}
            value={newCycleDays.v1}
            onChange={(e) => setNewCycleDays((prev) => ({ ...prev, v1: e.target.value }))}
            className="bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          <input
            type="number"
            placeholder={`V2 (${onChainCycleDays.v2 || 60})`}
            value={newCycleDays.v2}
            onChange={(e) => setNewCycleDays((prev) => ({ ...prev, v2: e.target.value }))}
            className="bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          <input
            type="number"
            placeholder={`V3 (${onChainCycleDays.v3 || 30})`}
            value={newCycleDays.v3}
            onChange={(e) => setNewCycleDays((prev) => ({ ...prev, v3: e.target.value }))}
            className="bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>
        <AnimatedButton
          onClick={handleSetMinerCycleDays}
          loading={loading === "cycleDays"}
          variant="primary"
          className="w-full"
        >
          更新矿机周期
        </AnimatedButton>
      </div>

            {/* 紧急提取 */}
      <div className="bg-rose-900/20 border border-rose-500/30 rounded-2xl p-5">
        <h3 className="text-rose-400 font-bold mb-2 flex items-center gap-2">
          <AlertTriangle size={16} /> 危险操作
        </h3>
        <p className="text-slate-400 text-xs mb-3">紧急提取将取出协议中所有资金，仅在紧急情况下使用</p>
        <AnimatedButton
          onClick={handleEmergencyWithdraw}
          loading={loading === "emergency"}
          variant="danger"
          className="w-full"
        >
          紧急提取所有资金
        </AnimatedButton>
      </div>
      </div>
      )}

      {/* 控制面板标签 */}
      {activeTab === "controls" && (
      <div className="space-y-4">
        {/* 紧急提取 */}
      <div className="bg-rose-900/20 border border-rose-500/30 rounded-2xl p-5">
        <h3 className="text-rose-400 font-bold mb-2 flex items-center gap-2">
          <AlertTriangle size={16} /> 危险操作
        </h3>
        <p className="text-slate-400 text-xs mb-3">紧急提取将取出协议中所有资金，仅在紧急情况下使用</p>
        <AnimatedButton
          onClick={handleEmergencyWithdraw}
          loading={loading === "emergency"}
          variant="danger"
          className="w-full"
        >
          紧急提取所有资金
        </AnimatedButton>
      </div>
      </div>
      )}

      {/* 矿机管理标签 */}
      {activeTab === "miners" && (
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
        <AdminMinerManager />
      </div>
      )}

      {/* 节点管理标签 */}
      {activeTab === "nodes" && (
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
        <AdminNodeManager />
      </div>
      )}

      {/* 设置标签 */}
      {activeTab === "settings" && (
      <div className="space-y-4">
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold">Swap 参数</h3>
          <p className="text-amber-300 text-xs">说明：此处为浏览器本地运行时参数，仅对当前设备/浏览器生效。</p>
          <div>
            <p className="text-slate-400 text-xs mb-1">DEX Router 地址</p>
            <input
              type="text"
              value={settingsSwapRouter}
              onChange={(e) => setSettingsSwapRouter(e.target.value)}
              placeholder="0x..."
              className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
            />
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">DEX Pair 地址（可选）</p>
            <input
              type="text"
              value={settingsSwapPair}
              onChange={(e) => setSettingsSwapPair(e.target.value)}
              placeholder="0x..."
              className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
            />
          </div>
        </div>

        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold">USDT 参数</h3>
          <div>
            <p className="text-slate-400 text-xs mb-1">USDT 合约地址</p>
            <input
              type="text"
              value={settingsUsdtAddress}
              onChange={(e) => setSettingsUsdtAddress(e.target.value)}
              placeholder="0x..."
              className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
            />
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">USDT 精度覆盖（可选）</p>
            <input
              type="number"
              min={0}
              max={36}
              value={settingsUsdtDecimals}
              onChange={(e) => setSettingsUsdtDecimals(e.target.value)}
              placeholder="例如 18"
              className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
            />
            <p className="text-slate-500 text-[10px] mt-1">为空时自动读取链上 decimals；填写后将优先使用该值。</p>
          </div>
        </div>

        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold">多管理员</h3>
          <div>
            <p className="text-slate-400 text-xs mb-1">【admin超管】（每次添加/删除 1 个）</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSuperAdminAddress}
                onChange={(e) => setNewSuperAdminAddress(e.target.value)}
                placeholder="0x..."
                className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
              />
              <AnimatedButton
                onClick={handleAddSuperAdmin}
                variant="primary"
                className="whitespace-nowrap"
                loading={loading === "add-super-admin"}
              >
                添加超管
              </AnimatedButton>
            </div>
            <div className="mt-2 space-y-2 max-h-40 overflow-auto pr-1">
              {superAdminList.length === 0 ? (
                <p className="text-slate-500 text-xs">暂无【admin超管】</p>
              ) : (
                superAdminList.map((addr) => (
                  <div key={addr} className="flex items-center justify-between gap-2 bg-[#13102B] border border-indigo-500/10 rounded-lg px-3 py-2">
                    <span className="text-slate-200 text-xs font-mono break-all">{addr}</span>
                    <AnimatedButton
                      onClick={() => handleRemoveSuperAdmin(addr)}
                      variant="danger"
                      className="whitespace-nowrap px-3 py-1 text-xs"
                      loading={loading === `remove-super-admin-${addr}`}
                    >
                      删除
                    </AnimatedButton>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">【manager管理员】（每次添加/删除 1 个）</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newManagerAddress}
                onChange={(e) => setNewManagerAddress(e.target.value)}
                placeholder="0x..."
                className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
              />
              <AnimatedButton
                onClick={handleAddManager}
                variant="primary"
                className="whitespace-nowrap"
                loading={loading === "add-manager"}
              >
                添加管理员
              </AnimatedButton>
            </div>
            <div className="mt-2 space-y-2 max-h-40 overflow-auto pr-1">
              {managerList.length === 0 ? (
                <p className="text-slate-500 text-xs">暂无【manager管理员】</p>
              ) : (
                managerList.map((addr) => (
                  <div key={addr} className="flex items-center justify-between gap-2 bg-[#13102B] border border-indigo-500/10 rounded-lg px-3 py-2">
                    <span className="text-slate-200 text-xs font-mono break-all">{addr}</span>
                    <AnimatedButton
                      onClick={() => handleRemoveManager(addr)}
                      variant="danger"
                      className="whitespace-nowrap px-3 py-1 text-xs"
                      loading={loading === `remove-manager-${addr}`}
                    >
                      删除
                    </AnimatedButton>
                  </div>
                ))
              )}
            </div>
          </div>
          <p className="text-slate-500 text-[10px]">权限规则：owner 与【admin超管】可增删【admin超管】和【manager管理员】；【manager管理员】仅用于配置参数操作，不可执行产品编辑/下架。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AnimatedButton
            onClick={handleSaveRuntimeSettings}
            variant="primary"
            className="w-full"
          >
            保存参数
          </AnimatedButton>
          <AnimatedButton
            onClick={handleResetRuntimeSettings}
            variant="secondary"
            className="w-full"
          >
            恢复默认
          </AnimatedButton>
        </div>
      </div>
      )}
    </div>
  );
};

export default AdminPanel;
