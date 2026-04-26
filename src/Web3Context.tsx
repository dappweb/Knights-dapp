import { ethers } from "ethers";
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAccount, useChainId, useDisconnect, useWalletClient } from "wagmi";
import { CHAIN_ID, CHAIN_NAME } from "./constants";
import { fetchAnnouncements, getRemoteRuntimeConfig } from "./services/announcementStorage";
import { useEthersProvider, useEthersSigner } from "./wagmi-adapters";
import { ensureTargetWalletChain, getBrowserWalletClient, isUserRejectedRequest, suggestWalletAssets } from "./walletSetup";

/**
 * KNIGHTS Protocol Web3 Context
 * ═══════════════════════════════════════════════════════════════
 * 管理所有合约实例和用户状态
 */

const normalizeAddress = (...candidates: Array<string | undefined>): string => {
  for (const raw of candidates) {
    const normalized = raw?.trim().replace(/^['\"]|['\"]$/g, "") || "";
    if (normalized && ethers.isAddress(normalized)) {
      return normalized;
    }
  }
  return "";
};

const canonicalAddressLower = (raw: string): string => ethers.getAddress(raw).toLowerCase();

const parseAddressList = (raw: string): Set<string> => {
  return new Set(
    String(raw || "")
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter((item) => ethers.isAddress(item))
      .map((item) => canonicalAddressLower(item))
  );
};

const extractReferrerFromLocation = (): string => {
  const keys = ["ref", "referrer", "inviter", "invite", "r"];

  const pickFrom = (params: URLSearchParams): string => {
    for (const key of keys) {
      const value = params.get(key)?.trim() || "";
      if (value && ethers.isAddress(value)) {
        return ethers.getAddress(value);
      }
    }
    return "";
  };

  const fromSearch = pickFrom(new URLSearchParams(window.location.search));
  if (fromSearch) return fromSearch;

  // 兼容 TP 钱包常见 hash 路由参数，例如 #/home?ref=0x...
  const hash = window.location.hash || "";
  const queryIdx = hash.indexOf("?");
  if (queryIdx >= 0) {
    const fromHashQuery = pickFrom(new URLSearchParams(hash.slice(queryIdx + 1)));
    if (fromHashQuery) return fromHashQuery;
  }

  return "";
};

// Contract Addresses — 从环境变量读取 (支持旧变量名兼容)
const ENV_CONTRACT_ADDRESSES = {
  USDT: normalizeAddress(import.meta.env.VITE_USDT_ADDRESS),
  SEER_TOKEN: normalizeAddress(import.meta.env.VITE_KNT_TOKEN_ADDRESS || import.meta.env.VITE_SEER_TOKEN_ADDRESS),
  PROTOCOL: normalizeAddress(import.meta.env.VITE_KNT_LP_MINING_ADDRESS || import.meta.env.VITE_PROTOCOL_ADDRESS),
  MINER_NODE: normalizeAddress(import.meta.env.VITE_MINER_NODE_ADDRESS),
  AIRDROP: normalizeAddress(import.meta.env.VITE_AIRDROP_ADDRESS),
  DEX_ROUTER: normalizeAddress(import.meta.env.VITE_DEX_ROUTER_ADDRESS),
  DEX_PAIR: normalizeAddress(import.meta.env.VITE_DEX_PAIR_ADDRESS),
  SWAP_POOL_MANAGER: normalizeAddress(import.meta.env.VITE_SWAP_POOL_MANAGER_ADDRESS),
};

const ROOT_REFERRER_ADDRESS = import.meta.env.VITE_ROOT_REFERRER_ADDRESS || "";
const ENV_SUPER_ADMIN_SET = parseAddressList(import.meta.env.VITE_SUPER_ADMIN_ADDRESSES || "");
const ENV_OPERATOR_ADMIN_SET = parseAddressList(import.meta.env.VITE_OPERATOR_ADMIN_ADDRESSES || "");
const RUNTIME_SETTINGS_STORAGE_KEY = "knights:admin-runtime-settings";

type RuntimeAdminSettings = {
  usdtAddress: string;
  dexRouterAddress: string;
  dexPairAddress: string;
  usdtDecimalsOverride: string;
};

const DEFAULT_RUNTIME_SETTINGS: RuntimeAdminSettings = {
  usdtAddress: ENV_CONTRACT_ADDRESSES.USDT,
  dexRouterAddress: ENV_CONTRACT_ADDRESSES.DEX_ROUTER,
  dexPairAddress: ENV_CONTRACT_ADDRESSES.DEX_PAIR,
  usdtDecimalsOverride: "",
};

const canUseStorage = () => typeof globalThis !== "undefined" && typeof globalThis.localStorage !== "undefined";

const loadRuntimeSettings = (): RuntimeAdminSettings => {
  if (!canUseStorage()) {
    return { ...DEFAULT_RUNTIME_SETTINGS };
  }

  try {
    const raw = globalThis.localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RUNTIME_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<RuntimeAdminSettings>;
    return {
      usdtAddress: typeof parsed.usdtAddress === "string" ? parsed.usdtAddress.trim() : DEFAULT_RUNTIME_SETTINGS.usdtAddress,
      dexRouterAddress: typeof parsed.dexRouterAddress === "string" ? parsed.dexRouterAddress.trim() : DEFAULT_RUNTIME_SETTINGS.dexRouterAddress,
      dexPairAddress: typeof parsed.dexPairAddress === "string" ? parsed.dexPairAddress.trim() : DEFAULT_RUNTIME_SETTINGS.dexPairAddress,
      usdtDecimalsOverride: typeof parsed.usdtDecimalsOverride === "string" ? parsed.usdtDecimalsOverride.trim() : "",
    };
  } catch {
    return { ...DEFAULT_RUNTIME_SETTINGS };
  }
};

const saveRuntimeSettings = (settings: RuntimeAdminSettings) => {
  if (!canUseStorage()) return;
  globalThis.localStorage.setItem(RUNTIME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

type AdminRole = "NONE" | "SUPER_ADMIN" | "OPERATOR_ADMIN";

interface Web3ContextType {
  // 基础
  provider: ethers.Provider | null;
  signer: ethers.Signer | null;
  account: string | null;
  isConnected: boolean;
  connectWallet: () => void;
  disconnectWallet: () => void;

  // 合约实例
  usdtContract: ethers.Contract | null;
  seerContract: ethers.Contract | null;
  protocolContract: ethers.Contract | null;
  minerNodeContract: ethers.Contract | null;
  airdropContract: ethers.Contract | null;

  // 用户状态
  usdtBalance: bigint | null;
  seerBalance: bigint | null;
  ethBalance: bigint | null;
  usdtDecimals: number;
  seerDecimals: number;
  hasReferrer: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  adminRole: AdminRole;
  isRegistered: boolean;
  referrerAddress: string | null;

  // 注册
  isRegistering: boolean;
  registerError: string | null;
  retryRegister: () => Promise<void>;
  doRegister?: () => Promise<void>;

  // 强制推荐人绑定
  showForcedReferrerBinding: boolean;
  setShowForcedReferrerBinding: (show: boolean) => void;
  dismissForcedReferrerBinding: () => void;

  // 合约地址
  contractAddresses: typeof ENV_CONTRACT_ADDRESSES;
  runtimeSettings: RuntimeAdminSettings;
  updateRuntimeSettings: (next: Partial<RuntimeAdminSettings>) => void;
  resetRuntimeSettings: () => void;

  // 刷新
  refreshBalances: () => Promise<void>;
  checkReferrerStatus: () => Promise<void>;
  checkOwnerStatus: () => Promise<void>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

// ============================================================
//                    ERC20 最小 ABI
// ============================================================

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
] as const;

const PROTOCOL_ABI = [
  // ── 基础查询 ──
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function totalUsers() view returns (uint256)",
  "function totalActiveMiners() view returns (uint256)",
  "function totalUsdtReceived() view returns (uint256)",
  "function totalSeerDistributed() view returns (uint256)",
  "function miningPool() view returns (uint256)",
  "function miningPoolRemaining() view returns (uint256)",
  "function seerPriceUsdt() view returns (uint256)",
  "function foundationWallet() view returns (address)",
  "function airdropManager() view returns (address)",
  "function minerNode() view returns (address)",
  "function basicMinerCycleDays() view returns (uint256)",
  "function v1MinerCycleDays() view returns (uint256)",
  "function v2MinerCycleDays() view returns (uint256)",
  "function v3MinerCycleDays() view returns (uint256)",
  "function salePhase() view returns (uint8)",
  "function nodeSaleStartTime() view returns (uint256)",
  "function nodeSaleOpen() view returns (bool)",
  "function minerSaleOpen() view returns (bool)",
  "function isSuperAdmin(address) view returns (bool)",
  "function isManager(address) view returns (bool)",
  "function getSuperAdmins() view returns (address[])",
  "function getManagers() view returns (address[])",
  "function currentLockRateBP() pure returns (uint256)",
  // ── 用户/矿机查询 ──
  "function getUserInfo(address) view returns (bool registered,address referrer,uint8 teamLevel,uint256 totalInvestedUsdt,uint256 teamVolumeUsdt,uint256 seerBalance,uint256 seerBetting,uint256 totalEarnedSeer,uint256 directReferralCount)",
  "function getWithdrawState(address) view returns (uint256 availableSeer,uint256 pendingSeer,uint256 releasableToday,uint256 dailyReleaseBP,uint256 nextReleaseTime)",
  "function getSmallAreaVolume(address) view returns (uint256)",
  "function getSettlementLevel(address) view returns (uint8)",
  "function register(address)",
  "function getUserMinerCount(address) view returns (uint256)",
  "function getUserMiner(address,uint256) view returns (tuple(uint8 tier,uint256 costUsdt,uint256 vaultA_usdt,uint256 vaultB_usdt,uint256 purchaseTime,uint256 lastClaimTime,uint256 totalClaimed,uint256 cycleDays,bool active,bool isAutoGifted,uint256 vaultA_initialUsdt,uint256 vaultB_initialUsdt,uint256 aReleasedDays,uint256 bReleasedDays))",
  "function getMinerTierInfo(uint8) view returns (uint256 cost,uint256 multiplier,uint256 cycleDays,uint256 bVaultUsdt)",
  "function getMinerTierConfig(uint8) view returns (uint256 costUsdt,uint256 multiplier,uint256 cycleDays,uint256 bVaultUsdt,uint256 soldCount,uint256 maxSupply,bool enabled)",
  "function quoteSeerForMiner(uint8) view returns (uint256 seerAmount,uint256 seerFee,uint256 totalSeerPayment)",
  "function seerPurchaseFeeBP() view returns (uint256)",
  "function getMinerVaultInfo(address,uint256) view returns (uint256 vaultA_remaining,uint256 vaultB_remaining,uint256 vaultA_dailyUsdt,uint256 vaultB_dailyUsdt,bool bPaused)",
  "function getPendingRewards(address) view returns (uint256)",
  "function getPendingRewardByMiner(address,uint256) view returns (uint256 totalReward,uint256 toWithdraw,uint256 toBetting,bool bPaused)",
  "function canCheckin(address) view returns (bool)",
  // ── 直推查询 ──
  "function getDirectReferrals(address) view returns (address[])",
  "function getDirectReferralCount(address) view returns (uint256)",
  "function getDirectReferral(address,uint256) view returns (address)",
  // ── 用户操作 ──
  "function purchaseMiner(uint8)",
  "function purchaseMinerWithSEER(uint8)",
  "function claimMining()",
  "function claimMiningByMiner(uint256)",
  "function dailyCheckin()",
  "function withdraw(uint256)",
  "function withdraw()",
  // ── 管理操作 ──
  "function updatePrice(uint256)",
  "function fundMiningPool(uint256)",
  "function setUserTeamLevel(address,uint8)",
  "function setUserBettingBalance(address,uint256)",
  "function setPaused(bool)",
  "function emergencyWithdrawToken(address,uint256)",
  "function setAirdropManager(address)",
  "function setMinerNode(address)",
  "function addSuperAdmin(address)",
  "function removeSuperAdmin(address)",
  "function addManager(address)",
  "function removeManager(address)",
  "function setMinerCycleDays(uint256,uint256,uint256,uint256)",
  "function setMinerTierConfig(uint8,uint256,uint256,uint256,uint256,bool)",
  "function setMinerTierInventory(uint8,uint256,uint256)",
  "function setFoundationWallet(address)",
  "function setNodeSaleOpen(bool)",
  "function setMinerSaleOpen(bool)",
  "function deactivateMiner(address,uint256)",
  "function activateMiner(address,uint256)",
  "function removeMiner(address,uint256)",
  "function adminDeactivateNodeLot(address,uint256)",
  // ── 矿机属性编辑（4种） ──
  "function editMinerTier(address,uint256,uint8)",
  "function editMinerCost(address,uint256,uint256)",
  "function editMinerVaultA(address,uint256,uint256)",
  "function editMinerVaultB(address,uint256,uint256)",
  // ── 节点属性编辑（3种） ──
  "function editNodeTier(address,uint256,uint8)",
  "function editNodeWeight(address,uint256,uint256)",
  "function editNodeCost(address,uint256,uint256)",
  // ── 事件 ──
  "event UserRegistered(address indexed user,address indexed referrer,uint256 timestamp)",
  "event MiningClaimed(address indexed user,uint256 seerAmount,uint256 toWithdraw,uint256 toBetting)",
  "event MiningClaimedByMiner(address indexed user,uint256 indexed minerId,uint256 seerAmount,uint256 toWithdraw,uint256 toBetting)",
  "event MinerPurchased(address indexed user,uint8 tier,uint256 costUsdt,uint256 minerId)",
  "event MinerPurchasedWithSEER(address indexed user,uint8 tier,uint256 costUsdt,uint256 seerAmount,uint256 seerFee,uint256 minerId)",
  "event MinerAutoGifted(address indexed user,uint8 tier,uint256 minerId)",
  "event VaultBExhausted(address indexed user,uint256 minerId)",
  "event TeamLevelUpgrade(address indexed user,uint8 oldLevel,uint8 newLevel)",
  "event ReferralReward(address indexed from,address indexed to,uint256 amount,uint256 layer)",
  "event DifferentialReward(address indexed from,address indexed to,uint256 amount)",
  "event EqualLevelBonus(address indexed from,address indexed to,uint256 amount)",
  "event CommunityTax(address indexed from,address indexed to,uint256 amount)",
  "event Withdrawal(address indexed user,uint256 seerAmount,uint256 fee)",
  "event DailyCheckin(address indexed user,uint256 reward,uint256 timestamp)",
  // ── Custom Errors ──
  "error NotRegistered()",
  "error AlreadyRegistered()",
  "error InvalidReferrer()",
  "error SelfReferral()",
  "error InvalidMinerTier()",
  "error InsufficientUSDT()",
  "error InsufficientBalance()",
  "error MiningPoolDepleted()",
  "error CheckinTooEarly()",
  "error ProtocolPausedError()",
  "error ZeroAmount()",
  "error NodeSaleClosed()",
  "error MinerSaleClosed()",
  "error MinerPurchaseLimitExceeded(uint8 tier,uint256 currentCount,uint256 limit)",
  "error InvalidMinerIndex(uint256 index,uint256 total)",
  "error MinerExpired()",
  "error NoActiveMiners()",
  "error NodeSaleNotActive()",
  "error NodePhaseMinerRestricted()",
  "error MinerTierDisabled(uint8 tier)",
  "error MinerTierSoldOut(uint8 tier,uint256 soldCount,uint256 maxSupply)",
] as const;

const AIRDROP_ABI = [
  "function airdropPoolRemaining() view returns (uint256)",
  "function totalClaimed() view returns (uint256)",
  "function claimCount() view returns (uint256)",
  "function remainingAirdropSlots() view returns (uint256)",
  "function getAirdropInfo(address) view returns (uint256,bool,bool,bool)",
  "function withdrawAirdrop()",
] as const;

const MINER_NODE_ABI = [
  "function nodes(address) view returns (uint256 weight, uint256 rewardDebt, uint256 pendingReward, bool isNode)",
  "function nodeCount() view returns (uint256)",
  "function v1NodeCount() view returns (uint256)",
  "function v2NodeCount() view returns (uint256)",
  "function v3NodeCount() view returns (uint256)",
  "function areAllNodeQuotasFilled() view returns (bool)",
  "function pendingReward(address) view returns (uint256)",
  "function pendingNodeRights(address) view returns (uint256)",
  "function pendingNodeRightsByLot(uint256) view returns (uint256)",
  "function claimReward()",
  "function claimNodeRights()",
  "function claimNodeRightsByLot(uint256)",
  "function nodeRightsUnlockedBP() view returns (uint256)",
  "function nodeRightsPoolFunded() view returns (uint256)",
  "function nodeRightsPoolClaimed() view returns (uint256)",
  "function nodeProtectionUntil(address) view returns (uint256)",
  "function nodeCurrentTier(address) view returns (uint256)",
  "function nodeMaxTier(address) view returns (uint256)",
  "function getNodeRightsInfo(address) view returns (uint256 allocated,uint256 claimed,uint256 pending,uint256 unlockedBP,uint256 currentTier,uint256 maxTier,uint256 protectedUntil)",
  "function getNodeTierConfig(uint8) view returns (uint256 weight,uint256 allocatedRights,uint256 maxCount,uint256 soldCount,bool enabled)",
  "function getUserNodeLotIds(address) view returns (uint256[])",
  "function getUserNodeLots(address) view returns (tuple(uint256 lotId,uint256 tier,uint256 weight,uint256 costUsdt,uint256 allocatedRights,uint256 claimedRights,uint256 pendingRights,uint256 purchaseTime,uint256 protectedUntil,bool active)[] lots)",
  "function fundNodeRightsPool(uint256)",
  "function setNodeTierConfig(uint8,uint256,uint256,uint256,bool)",
  "event NodeRegistered(address indexed node, uint256 weight, uint256 tier)",
  "event NodeRemoved(address indexed node)",
  "event RewardClaimed(address indexed node, uint256 amount)",
  "event NodeRightsClaimed(address indexed node, uint256 amount, uint256 totalClaimedByNode)",
  "event NodeRightsClaimedByLot(address indexed node, uint256 indexed lotId, uint256 amount, uint256 totalClaimedByLot)",
  "event NodeRightsPoolFunded(address indexed sender, uint256 amount, uint256 totalFunded)",
  // ── Custom Errors ──
  "error NodeQuotaExceeded(uint256 tier,uint256 current,uint256 max)",
  "error InsufficientNodeRightsPool(uint256 requiredAmount,uint256 availableAmount)",
  "error InvalidNodeLot(uint256 lotId)",
  "error NotNodeLotOwner(uint256 lotId,address caller)",
  "error NodeTierDisabled(uint256 tier)",
] as const;

// ============================================================
//                      Provider
// ============================================================

export const Web3Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const provider = useEthersProvider({ chainId: CHAIN_ID });
  const signer = useEthersSigner({ chainId: CHAIN_ID });
  const walletSetupRef = useRef<string | null>(null);
  const isTargetChain = !isConnected || chainId === CHAIN_ID;
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeAdminSettings>(() => loadRuntimeSettings());

  const contractAddresses = useMemo(
    () => ({
      USDT: normalizeAddress(runtimeSettings.usdtAddress, ENV_CONTRACT_ADDRESSES.USDT),
      SEER_TOKEN: ENV_CONTRACT_ADDRESSES.SEER_TOKEN,
      PROTOCOL: ENV_CONTRACT_ADDRESSES.PROTOCOL,
      MINER_NODE: ENV_CONTRACT_ADDRESSES.MINER_NODE,
      AIRDROP: ENV_CONTRACT_ADDRESSES.AIRDROP,
      DEX_ROUTER: normalizeAddress(runtimeSettings.dexRouterAddress, ENV_CONTRACT_ADDRESSES.DEX_ROUTER),
      DEX_PAIR: normalizeAddress(runtimeSettings.dexPairAddress, ENV_CONTRACT_ADDRESSES.DEX_PAIR),
      SWAP_POOL_MANAGER: ENV_CONTRACT_ADDRESSES.SWAP_POOL_MANAGER,
    }),
    [runtimeSettings]
  );

  const updateRuntimeSettings = useCallback((next: Partial<RuntimeAdminSettings>) => {
    setRuntimeSettings((prev) => {
      const merged = { ...prev, ...next };
      saveRuntimeSettings(merged);
      return merged;
    });
  }, []);

  const resetRuntimeSettings = useCallback(() => {
    const resetTo = { ...DEFAULT_RUNTIME_SETTINGS };
    setRuntimeSettings(resetTo);
    saveRuntimeSettings(resetTo);
  }, []);

  // ── 启动时拉取远程 runtimeConfig（管理员通过 Admin 面板更改 USDT 地址等会写入 JSONBin）
  // 仅当 localStorage 中没有手动覆盖时，才应用远程值（远程值优先级低于 Admin 面板的本地保存）
  useEffect(() => {
    const localRaw = canUseStorage() ? globalThis.localStorage.getItem(RUNTIME_SETTINGS_STORAGE_KEY) : null;
    const hasLocalOverride = !!localRaw;
    fetchAnnouncements(false).then(() => {
      const remote = getRemoteRuntimeConfig();
      if (!remote) return;
      if (hasLocalOverride) return; // 本地已有管理员手动配置，不覆盖
      // 只应用非空的字段
      const patch: Partial<RuntimeAdminSettings> = {};
      if (remote.usdtAddress && ethers.isAddress(remote.usdtAddress)) patch.usdtAddress = remote.usdtAddress;
      if (remote.usdtDecimalsOverride) patch.usdtDecimalsOverride = remote.usdtDecimalsOverride;
      if (remote.dexRouterAddress && ethers.isAddress(remote.dexRouterAddress)) patch.dexRouterAddress = remote.dexRouterAddress;
      if (remote.dexPairAddress && ethers.isAddress(remote.dexPairAddress)) patch.dexPairAddress = remote.dexPairAddress;
      if (Object.keys(patch).length > 0) {
        setRuntimeSettings((prev) => ({ ...prev, ...patch }));
      }
    }).catch(() => { /* 网络失败静默忽略 */ });
  // 仅在挂载时执行一次
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 合约实例
  const [usdtContract, setUsdtContract] = useState<ethers.Contract | null>(null);
  const [seerContract, setSeerContract] = useState<ethers.Contract | null>(null);
  const [protocolContract, setProtocolContract] = useState<ethers.Contract | null>(null);
  const [minerNodeContract, setMinerNodeContract] = useState<ethers.Contract | null>(null);
  const [airdropContract, setAirdropContract] = useState<ethers.Contract | null>(null);

  // 余额
  const [usdtBalance, setUsdtBalance] = useState<bigint | null>(null);
  const [seerBalance, setSeerBalance] = useState<bigint | null>(null);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);
  const [usdtDecimals, setUsdtDecimals] = useState(18);
  const [seerDecimals, setSeerDecimals] = useState(18);

  // 用户状态
  const [hasReferrer, setHasReferrer] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole>("NONE");
  const [isRegistered, setIsRegistered] = useState(false);
  const [referrerAddress, setReferrerAddress] = useState<string | null>(null);

  // 注册状态
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // 强制推荐人绑定
  const [showForcedReferrerBinding, setShowForcedReferrerBinding] = useState(false);
  const forcedBindingDismissedRef = useRef(false);

  // ============================================================
  //                    合约初始化
  // ============================================================

  useEffect(() => {
    const signerOrProvider = signer || provider;
    if (!signerOrProvider) {
      setUsdtContract(null);
      setSeerContract(null);
      setProtocolContract(null);
      setMinerNodeContract(null);
      setAirdropContract(null);
      return;
    }

    const mode = signer ? "Signer" : "Provider";

    // USDT
    if (contractAddresses.USDT) {
      setUsdtContract(new ethers.Contract(contractAddresses.USDT, ERC20_ABI, signerOrProvider));
    } else {
      setUsdtContract(null);
    }

    // KNIGHTS Token (完整ABI用于税控等)
    if (contractAddresses.SEER_TOKEN) {
      setSeerContract(new ethers.Contract(contractAddresses.SEER_TOKEN, ERC20_ABI, signerOrProvider));
    } else {
      setSeerContract(null);
    }

    // Protocol
    if (contractAddresses.PROTOCOL) {
      setProtocolContract(new ethers.Contract(contractAddresses.PROTOCOL, PROTOCOL_ABI, signerOrProvider));
    } else {
      setProtocolContract(null);
    }

    // MinerNode
    if (contractAddresses.MINER_NODE) {
      setMinerNodeContract(new ethers.Contract(contractAddresses.MINER_NODE, MINER_NODE_ABI, signerOrProvider));
    } else {
      setMinerNodeContract(null);
    }

    // Airdrop
    if (contractAddresses.AIRDROP) {
      setAirdropContract(new ethers.Contract(contractAddresses.AIRDROP, AIRDROP_ABI, signerOrProvider));
    } else {
      setAirdropContract(null);
    }

    console.log(`✅ [Web3] 合约已初始化 (${mode})`, {
      USDT: contractAddresses.USDT || "未配置",
      KNIGHTS: contractAddresses.SEER_TOKEN || "未配置",
      PROTOCOL: contractAddresses.PROTOCOL || "未配置",
    });
  }, [signer, provider, contractAddresses]);

  useEffect(() => {
    let cancelled = false;

    const loadTokenDecimals = async () => {
      try {
        const [usdtDecimalsRaw, seerDecimalsRaw] = await Promise.all([
          usdtContract?.decimals?.() ?? 18,
          seerContract?.decimals?.() ?? 18,
        ]);

        if (cancelled) return;

        const overrideRaw = runtimeSettings.usdtDecimalsOverride?.trim() || "";
        const overrideDecimals = Number(overrideRaw);
        const hasValidOverride =
          overrideRaw.length > 0 &&
          Number.isFinite(overrideDecimals) &&
          Number.isInteger(overrideDecimals) &&
          overrideDecimals >= 0 &&
          overrideDecimals <= 36;
        const nextUsdtDecimals = hasValidOverride ? overrideDecimals : Number(usdtDecimalsRaw);
        const nextSeerDecimals = Number(seerDecimalsRaw);

        setUsdtDecimals(Number.isFinite(nextUsdtDecimals) ? nextUsdtDecimals : 18);
        setSeerDecimals(Number.isFinite(nextSeerDecimals) ? nextSeerDecimals : 18);
      } catch {
        if (!cancelled) {
          setUsdtDecimals(18);
          setSeerDecimals(18);
        }
      }
    };

    loadTokenDecimals();

    return () => {
      cancelled = true;
    };
  }, [usdtContract, seerContract, runtimeSettings.usdtDecimalsOverride]);

  useEffect(() => {
    if (!isConnected || !address) {
      walletSetupRef.current = null;
      return;
    }

    const activeWalletClient = walletClient || getBrowserWalletClient();
    if (!activeWalletClient) return;

    const setupKey = `${canonicalAddressLower(address)}:${chainId || 0}`;
    if (walletSetupRef.current === setupKey) return;
    walletSetupRef.current = setupKey;

    const tokenImageUrl = new URL("/logo.png", window.location.origin).toString();
    const trackedTokens = [
      contractAddresses.SEER_TOKEN
        ? { address: contractAddresses.SEER_TOKEN, symbol: "KNT", decimals: seerDecimals, image: tokenImageUrl }
        : null,
      contractAddresses.USDT
        ? { address: contractAddresses.USDT, symbol: "USDT", decimals: usdtDecimals, image: tokenImageUrl }
        : null,
    ].filter((token): token is { address: string; symbol: string; decimals: number; image: string } => {
      return Boolean(token && ethers.isAddress(token.address));
    });

    let cancelled = false;

    const configureWallet = async () => {
      try {
        await ensureTargetWalletChain(activeWalletClient);
        if (cancelled) return;

        const addedSymbols = await suggestWalletAssets(activeWalletClient, trackedTokens);
        if (!cancelled && addedSymbols.length > 0) {
          toast.success(`已向钱包推荐添加 ${addedSymbols.join(" / ")}`);
        }
      } catch (error) {
        if (cancelled) return;
        console.warn("[Web3] Wallet auto-setup skipped:", error);

        if (isUserRejectedRequest(error)) {
          toast.error("已取消钱包网络/代币自动配置");
          return;
        }

        toast.error(`钱包自动配置失败，请手动切换到 ${CHAIN_NAME} 并添加代币`);
      }
    };

    configureWallet();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address, walletClient, chainId, usdtDecimals, seerDecimals, contractAddresses]);

  // ============================================================
  //                    余额刷新
  // ============================================================

  const refreshBalances = useCallback(async () => {
    if (!provider || !address) {
      setUsdtBalance(null);
      setSeerBalance(null);
      setEthBalance(null);
      return;
    }

    try {
      // ETH余额
      const ethBal = await provider.getBalance(address);
      setEthBalance(ethBal);

      // USDT余额
      if (usdtContract) {
        const uBal = await usdtContract.balanceOf(address);
        setUsdtBalance(uBal);
      }

      // KNIGHTS余额
      if (seerContract) {
        const sBal = await (seerContract as any).balanceOf(address);
        setSeerBalance(sBal);
      }
    } catch (err) {
      console.error("❌ [Web3] 余额刷新失败:", err);
    }
  }, [provider, address, usdtContract, seerContract]);

  // 初始余额加载
  useEffect(() => {
    if (!provider || !address) {
      setUsdtBalance(null);
      setSeerBalance(null);
      setEthBalance(null);
      return;
    }

    const t = setTimeout(() => refreshBalances(), 200);
    return () => clearTimeout(t);
  }, [provider, address, refreshBalances]);

  // ============================================================
  //                    Owner 检查
  // ============================================================

  const checkOwnerStatus = useCallback(async () => {
    if (!protocolContract || !address) {
      setIsOwner(false);
      setIsAdmin(false);
      setAdminRole("NONE");
      return;
    }
    try {
      const owner = await protocolContract.owner();
      const normalizedAddress = canonicalAddressLower(address);
      const ownerMatched = canonicalAddressLower(owner) === normalizedAddress;
      let superAdminMatched = false;
      let operatorAdminMatched = false;
      try {
        [superAdminMatched, operatorAdminMatched] = await Promise.all([
          protocolContract.isSuperAdmin(normalizedAddress),
          protocolContract.isManager(normalizedAddress),
        ]);
      } catch {
        // Fallback for old protocol versions that don't expose on-chain role getters.
        superAdminMatched = ENV_SUPER_ADMIN_SET.has(normalizedAddress);
        operatorAdminMatched = ENV_OPERATOR_ADMIN_SET.has(normalizedAddress);
      }

      const resolvedRole: AdminRole = ownerMatched || superAdminMatched
        ? "SUPER_ADMIN"
        : operatorAdminMatched
          ? "OPERATOR_ADMIN"
          : "NONE";

      setIsOwner(ownerMatched);
      setAdminRole(resolvedRole);
      setIsAdmin(resolvedRole !== "NONE");
    } catch {
      setIsOwner(false);
      setIsAdmin(false);
      setAdminRole("NONE");
    }
  }, [protocolContract, address]);

  useEffect(() => {
    if (!protocolContract || !address) {
      setIsOwner(false);
      setIsAdmin(false);
      setAdminRole("NONE");
      return;
    }
    checkOwnerStatus();
    const id = setInterval(checkOwnerStatus, 10000);
    return () => clearInterval(id);
  }, [protocolContract, address, checkOwnerStatus]);

  // ============================================================
  //                    推荐人 & 注册状态
  // ============================================================

  const checkReferrerStatus = useCallback(async () => {
    if (!protocolContract || !address) {
      setHasReferrer(false);
      setIsRegistered(false);
      setReferrerAddress(null);
      setShowForcedReferrerBinding(false);
      return;
    }

    try {
      const info = await protocolContract.getUserInfo(address);
      const registered = info[0]; // bool registered
      const referrer = info[1];   // address referrer

      setIsRegistered(registered || isAdmin || isOwner);
      const hasRef = referrer !== ethers.ZeroAddress;
      setHasReferrer(hasRef || isOwner || isAdmin);
      setReferrerAddress(hasRef ? referrer : null);

      // 已有推荐人时关闭弹窗；无推荐人时不在此处强制打开（由 doRegister 控制）
      if (hasRef || isOwner || isAdmin) {
        setShowForcedReferrerBinding(false);
        forcedBindingDismissedRef.current = false;
      }
    } catch (err) {
      console.error("❌ [Web3] 推荐人检查失败:", err);
      setHasReferrer(isOwner || isAdmin);
      setIsRegistered(isOwner || isAdmin);
      setReferrerAddress(null);
      setShowForcedReferrerBinding(false);
    }
  }, [protocolContract, address, isOwner, isConnected, isAdmin]);

  useEffect(() => {
    if (isOwner) {
      setHasReferrer(true);
    }
    checkReferrerStatus();
  }, [protocolContract, address, isOwner, checkReferrerStatus]);

  // ============================================================
  //                    URL 推荐码处理
  // ============================================================

  useEffect(() => {
    const referrer = extractReferrerFromLocation();
    if (referrer) {
      localStorage.setItem("pendingReferrer", referrer);
    }
  }, []);

  // 注册核心逻辑（可被自动触发或手动重试调用）
  const doRegister = useCallback(async () => {
    if (!isConnected || !address) {
      setRegisterError("请先连接钱包后再注册");
      return;
    }
    if (!isTargetChain || !signer) {
      setRegisterError(`请先切换到 ${CHAIN_NAME} 网络后再注册`);
      return;
    }
    if (!protocolContract) {
      setRegisterError("协议合约未就绪，请稍后重试");
      return;
    }

    // 管理员和Owner无需绑定推荐人。
    if (isAdmin || isOwner) {
      setRegisterError(null);
      setHasReferrer(true);
      setIsRegistered(true);
      setShowForcedReferrerBinding(false);
      return;
    }

    if (isRegistering) return;

    setRegisterError(null);
    setIsRegistering(true);

    try {
      const info = await protocolContract.getUserInfo(address);
      if (info[0]) {
        localStorage.removeItem("pendingReferrer");
        localStorage.removeItem("allowDefaultReferrer");
        setIsRegistered(true);
        setShowForcedReferrerBinding(false);
        return;
      }

      const self = canonicalAddressLower(address);
      const pending = localStorage.getItem("pendingReferrer");
      const allowDefaultReferrer = localStorage.getItem("allowDefaultReferrer") === "1";
      let selectedReferrer: string | null = null;

      if (pending && ethers.isAddress(pending) && canonicalAddressLower(pending) !== self) {
        selectedReferrer = pending;
      }

      if (!selectedReferrer && allowDefaultReferrer && ROOT_REFERRER_ADDRESS && ethers.isAddress(ROOT_REFERRER_ADDRESS)) {
        if (canonicalAddressLower(ROOT_REFERRER_ADDRESS) !== self) {
          selectedReferrer = ROOT_REFERRER_ADDRESS;
          localStorage.setItem("pendingReferrer", ROOT_REFERRER_ADDRESS);
        }
      }

      if (!selectedReferrer && allowDefaultReferrer) {
        const ownerAddr = await protocolContract.owner();
        if (ownerAddr && ownerAddr !== ethers.ZeroAddress && canonicalAddressLower(ownerAddr) !== self) {
          selectedReferrer = ownerAddr;
          localStorage.setItem("pendingReferrer", ownerAddr);
        }
      }

      if (selectedReferrer) {
        const refInfo = await protocolContract.getUserInfo(selectedReferrer);
        if (!refInfo[0]) {
          const msg = "推荐人账户尚未激活，请联系邀请人完成注册后重试";
          setRegisterError(msg);
          return;
        }

        const tx = await protocolContract.register(selectedReferrer);
        await tx.wait();
        localStorage.removeItem("pendingReferrer");
        localStorage.removeItem("allowDefaultReferrer");
        setRegisterError(null);
        await checkReferrerStatus();
        await refreshBalances();
        return;
      }

      // 非创世Owner场景下，必须先显式绑定推荐人（手动或点击“使用默认”）
      // 只在用户本次会话未主动关闭过弹窗时才显示
      if (!forcedBindingDismissedRef.current) {
        setShowForcedReferrerBinding(true);
      }

      const totalUsers = await protocolContract.totalUsers();
      const ownerAddr = await protocolContract.owner();
      const isGenesisOwner = totalUsers === 0n && canonicalAddressLower(ownerAddr) === self;

      if (isGenesisOwner) {
        const tx = await protocolContract.register(ethers.ZeroAddress);
        await tx.wait();
        localStorage.removeItem("pendingReferrer");
        setRegisterError(null);
        await checkReferrerStatus();
        await refreshBalances();
      }
      // 非创世用户：弹窗已显示，静默等待用户操作，不设置 error
    } catch (err: any) {
      const msg = err?.reason || err?.shortMessage || err?.message || "注册失败，请重试";
      console.error("❌ 自动注册失败:", err);
      setRegisterError(msg);
    } finally {
      setIsRegistering(false);
    }
  }, [isConnected, address, isTargetChain, signer, protocolContract, isAdmin, isOwner, isRegistering, checkReferrerStatus, refreshBalances]);

  // 自动触发注册
  useEffect(() => {
    doRegister();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, chainId, protocolContract, signer]);

  // 手动重试注册
  const retryRegister = useCallback(async () => {
    setRegisterError(null);
    await doRegister();
  }, [doRegister]);

  // ============================================================
  //                    钱包操作
  // ============================================================

  const connectWallet = () => {
    window.dispatchEvent(new CustomEvent("knights:open-wallet"));
  };

  const disconnectWallet = () => {
    disconnect();
    setHasReferrer(false);
    setIsOwner(false);
    setIsAdmin(false);
    setAdminRole("NONE");
    setIsRegistered(false);
    setReferrerAddress(null);
    setUsdtBalance(null);
    setSeerBalance(null);
    setEthBalance(null);
    setUsdtDecimals(18);
    setSeerDecimals(18);
    setShowForcedReferrerBinding(false);
    forcedBindingDismissedRef.current = false;
  };

  // 用户主动关闭弹窗时调用，防止后台逻辑再次自动打开
  const dismissForcedReferrerBinding = useCallback(() => {
    setShowForcedReferrerBinding(false);
    forcedBindingDismissedRef.current = true;
  }, []);

  return (
    <Web3Context.Provider
      value={{
        provider: provider || null,
        signer: signer || null,
        account: address || null,
        isConnected,
        connectWallet,
        disconnectWallet,

        usdtContract,
        seerContract,
        protocolContract,
        minerNodeContract,
        airdropContract,

        usdtBalance,
        seerBalance,
        ethBalance,
        usdtDecimals,
        seerDecimals,
        hasReferrer,
        isOwner,
        isAdmin,
        adminRole,
        isRegistered,
        referrerAddress,

        isRegistering,
        registerError,
        retryRegister,
        doRegister,

        showForcedReferrerBinding,
        setShowForcedReferrerBinding,
        dismissForcedReferrerBinding,

        contractAddresses,
        runtimeSettings,
        updateRuntimeSettings,
        resetRuntimeSettings,

        refreshBalances,
        checkReferrerStatus,
        checkOwnerStatus,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
};
