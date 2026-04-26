import { ethers } from "ethers";
import React, { useCallback, useEffect, useState } from "react";
import { BLOCK_EXPLORER_URL, NODE_LEVEL_PROTECTION_DAYS, TEAM_LEVELS } from "../src/constants";
import { useLanguage } from "../src/LanguageContext";
import { useWeb3 } from "../src/Web3Context";

import { ArrowDownToLine, CheckCircle2, Copy, ExternalLink, Link2, Lock, Share2, Shield, Star, TrendingUp, UserPlus, Users, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { formatContractError } from "../utils/errorFormatter";

interface ReferralInfo {
  address: string;
  registered: boolean;
  totalInvestedUsdt: bigint;
  teamVolumeUsdt: bigint;
  branchVolumeUsdt: bigint;
}

interface NodeLevelInfo {
  isNode: boolean;
  currentTier: number;
  maxTier: number;
  protectedUntil: number;
}

const TeamLevel: React.FC = () => {
  useLanguage();
  const {
    account, isConnected, protocolContract, minerNodeContract, seerContract, refreshBalances,
    isRegistered, isRegistering, registerError, retryRegister, usdtDecimals, contractAddresses: CONTRACT_ADDRESSES
  } = useWeb3();

  const [onchainSettlementLevel, setOnchainSettlementLevel] = useState(0);
  const [displayTeamLevel, setDisplayTeamLevel] = useState(0);
  const [personalVolume, setPersonalVolume] = useState(0n);
  const [teamVolume, setTeamVolume] = useState(0n);
  const [smallAreaVolume, setSmallAreaVolume] = useState(0n);
  const [directCount, setDirectCount] = useState(0);
  const [teamCount, setTeamCount] = useState(0);
  const [directReferralInfos, setDirectReferralInfos] = useState<ReferralInfo[]>([]);
  const [referrer, setReferrer] = useState<string | null>(null);
  const [totalEarned, setTotalEarned] = useState(0n);
  const [seerAvailable, setSeerAvailable] = useState(0n);
  const [seerPendingRelease, setSeerPendingRelease] = useState(0n);
  const [seerReleasableToday, setSeerReleasableToday] = useState(0n);
  const [seerBetting, setSeerBetting] = useState(0n);
  const [dailyReleasePercent, setDailyReleasePercent] = useState(50);
  const [nodeLevelInfo, setNodeLevelInfo] = useState<NodeLevelInfo>({
    isNode: false,
    currentTier: 0,
    maxTier: 0,
    protectedUntil: 0,
  });
  const [withdrawing, setWithdrawing] = useState(false);

  const showWithdrawError = (message: string) => {
    toast(message, { icon: "⚠️", id: "withdraw-error" });
  };

  // 推荐人手动绑定
  const [inputReferrer, setInputReferrer] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  const handleBindManual = async () => {
    const addr = inputReferrer.trim();
    if (!addr) { setInputError("请输入推荐人地址"); return; }
    if (!ethers.isAddress(addr)) { setInputError("地址格式不正确"); return; }
    if (account && addr.toLowerCase() === account.toLowerCase()) {
      setInputError("不能使用自己的地址"); return;
    }
    setInputError(null);
    localStorage.setItem("pendingReferrer", addr);
    await retryRegister();
  };

  const handleBindDefault = async () => {
    setInputError(null);
    localStorage.removeItem("pendingReferrer");
    await retryRegister();
  };

  const referralLink = account
    ? `${window.location.origin}?ref=${account}`
    : "";

  const countAllTeamMembers = useCallback(async (root: string) => {
    if (!protocolContract) return 0;
    const visited = new Set<string>([root.toLowerCase()]);
    let total = 0;
    const queue: string[] = [root];

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

  const getLevelBySmallArea = useCallback((smallArea: bigint) => {
    let level = 0;
    for (const cfg of TEAM_LEVELS) {
      const threshold = ethers.parseUnits(cfg.thresholdUsdt.toString(), usdtDecimals);
      if (smallArea >= threshold) {
        level = cfg.level;
      }
    }
    return level;
  }, [usdtDecimals]);

  const fetchTeamData = useCallback(async () => {
    if (!protocolContract || !account) return;
    try {
      const [info, withdrawState, onchainSmallAreaVolume] = await Promise.all([
        protocolContract.getUserInfo(account),
        protocolContract.getWithdrawState?.(account).catch(() => null),
        protocolContract.getSmallAreaVolume?.(account).catch(() => null),
      ]);
      const chainLevel = Number(info.teamLevel || 0);
      setOnchainSettlementLevel(chainLevel);
      setPersonalVolume(info.totalInvestedUsdt || 0n);
      setTotalEarned(info.totalEarnedSeer || 0n);
      setSeerAvailable((withdrawState?.availableSeer ?? info.seerBalance) || 0n);
      setSeerPendingRelease(withdrawState?.pendingSeer || 0n);
      setSeerReleasableToday(withdrawState?.releasableToday || 0n);
      setDailyReleasePercent(Number(withdrawState?.dailyReleaseBP || 5000) / 100);
      setSeerBetting(info.seerBetting || 0n);

      const allTeamMembers = await countAllTeamMembers(account);
      setTeamCount(allTeamMembers);

      const ref = info.referrer;
      if (ref && ref !== ethers.ZeroAddress) {
        setReferrer(ref);
      }

      // 获取直推列表 — 优先用 getDirectReferrals() 批量读取（兼容旧合约）
      try {
        let addrs: string[] = [];
        try {
          // 新旧合约均支持批量接口
          addrs = await protocolContract.getDirectReferrals(account);
        } catch {
          // 极旧版本 fallback：逐个读
          try {
            const count = await protocolContract.getDirectReferralCount(account);
            const limit = Math.min(Number(count), 50);
            for (let i = 0; i < limit; i++) {
              addrs.push(await protocolContract.getDirectReferral(account, i));
            }
          } catch { /* no referral data */ }
        }

        const refs: ReferralInfo[] = [];
        for (const addr of addrs.slice(0, 50)) {
          let registered = false;
          let totalInvestedUsdt = 0n;
          let teamVolumeUsdt = 0n;
          let branchVolumeUsdt = 0n;
          try {
            const directInfo = await protocolContract.getUserInfo(addr);
            registered = Boolean(directInfo?.registered ?? directInfo?.[0]);
            totalInvestedUsdt = directInfo?.totalInvestedUsdt ?? directInfo?.[3] ?? 0n;
            teamVolumeUsdt = directInfo?.teamVolumeUsdt ?? directInfo?.[4] ?? 0n;
            const fallbackBranchVolume = totalInvestedUsdt + teamVolumeUsdt;
            branchVolumeUsdt = protocolContract.getBranchVolume
              ? await protocolContract.getBranchVolume(account, addr).catch(() => fallbackBranchVolume)
              : fallbackBranchVolume;
          } catch { /* ignore */ }
          if (registered) {
            refs.push({ address: addr, registered, totalInvestedUsdt, teamVolumeUsdt, branchVolumeUsdt });
          }
        }

        const branchVolumes = refs.map((x) => x.branchVolumeUsdt);
        const onchainTeamVolume = info.teamVolumeUsdt ?? info[4] ?? 0n;

        // Prefer chain values for performance metrics so display and settlement stay aligned.
        let computedSmallArea = 0n;
        if (onchainSmallAreaVolume != null) {
          computedSmallArea = onchainSmallAreaVolume;
        } else if (branchVolumes.length > 1) {
          const computedBranchTotal = branchVolumes.reduce((acc, v) => acc + v, 0n);
          const max = branchVolumes.reduce((m, v) => (v > m ? v : m), 0n);
          computedSmallArea = computedBranchTotal > max ? computedBranchTotal - max : 0n;
        }

        setDirectCount(Number(info.directReferralCount ?? refs.length));
        setTeamVolume(onchainTeamVolume);
        setSmallAreaVolume(computedSmallArea);
        setDisplayTeamLevel(getLevelBySmallArea(computedSmallArea));
        setDirectReferralInfos(refs);
      } catch {
        // 静默失败，显示空列表
        setDirectCount(Number(info.directReferralCount || 0));
        setTeamVolume(info.teamVolumeUsdt || 0n);
        setSmallAreaVolume(onchainSmallAreaVolume ?? 0n);
        setDisplayTeamLevel(getLevelBySmallArea(onchainSmallAreaVolume ?? 0n));
      }
    } catch (err) {
      console.error("Failed to fetch team data:", err);
    }
  }, [protocolContract, account, countAllTeamMembers, getLevelBySmallArea]);

  const fetchNodeLevelData = useCallback(async () => {
    if (!account || !minerNodeContract) {
      setNodeLevelInfo({ isNode: false, currentTier: 0, maxTier: 0, protectedUntil: 0 });
      return;
    }

    try {
      const [nodeInfo, rightsInfo] = await Promise.all([
        minerNodeContract.nodes(account).catch(() => null),
        minerNodeContract.getNodeRightsInfo(account).catch(() => null),
      ]);

      const weight = Number(nodeInfo?.weight || 0);
      const fallbackTier = weight >= 10 ? 3 : weight >= 3 ? 2 : weight >= 1 ? 1 : 0;

      setNodeLevelInfo({
        isNode: Boolean(nodeInfo?.isNode) || Boolean(rightsInfo?.currentTier),
        currentTier: Number(rightsInfo?.currentTier || fallbackTier || 0),
        maxTier: Number(rightsInfo?.maxTier || fallbackTier || 0),
        protectedUntil: Number(rightsInfo?.protectedUntil || 0),
      });
    } catch (err) {
      console.error("Failed to fetch node level data:", err);
      setNodeLevelInfo({ isNode: false, currentTier: 0, maxTier: 0, protectedUntil: 0 });
    }
  }, [account, minerNodeContract]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  useEffect(() => {
    fetchNodeLevelData();
  }, [fetchNodeLevelData]);
  // 提现
  const handleWithdraw = async () => {
    if (!protocolContract || !account) {
      showWithdrawError("钱包或合约未就绪");
      return;
    }
    setWithdrawing(true);
    try {
      const [paused, info] = await Promise.all([
        protocolContract.paused(),
        protocolContract.getUserInfo(account),
      ]);

      const registered = Boolean(info?.registered ?? info?.[0]);
      const withdrawState = await protocolContract.getWithdrawState?.(account).catch(() => null);
      const available = BigInt(withdrawState?.availableSeer ?? info?.seerBalance ?? info?.[5] ?? 0n);
      const releasableToday = BigInt(withdrawState?.releasableToday ?? 0n);
      const withdrawableNow = available + releasableToday;

      if (paused) {
        showWithdrawError("协议当前已暂停，暂不可提现");
        return;
      }

      if (!registered) {
        showWithdrawError("账户未注册，无法提现");
        return;
      }

      if (withdrawableNow <= 0n) {
        showWithdrawError("可提现收益为 0，请先领取收益");
        return;
      }

      if (seerContract && CONTRACT_ADDRESSES.PROTOCOL) {
        const protocolSeerBalance = await seerContract.balanceOf(CONTRACT_ADDRESSES.PROTOCOL);
        if (protocolSeerBalance < withdrawableNow) {
          showWithdrawError("协议KNIGHTS池余额不足，请联系管理员补充资金池");
          console.warn("[Withdraw Precheck] Protocol KNIGHTS insufficient", {
            protocolSeerBalance: protocolSeerBalance.toString(),
            userAvailable: withdrawableNow.toString(),
            protocolAddress: CONTRACT_ADDRESSES.PROTOCOL,
            seerTokenAddress: CONTRACT_ADDRESSES.SEER_TOKEN,
          });
          return;
        }
      }

      const withdrawNoArg = protocolContract["withdraw()"];
      const withdrawWithAmount = protocolContract["withdraw(uint256)"];

      let tx: any;
      try {
        await withdrawNoArg.staticCall();
        toast.loading("提现中...", { id: "withdraw" });
        tx = await withdrawNoArg();
      } catch (noArgErr: any) {
        console.warn("[Withdraw] withdraw() failed, fallback to withdraw(uint256)", noArgErr);
        await withdrawWithAmount.staticCall(withdrawableNow);
        toast.loading("提现中...", { id: "withdraw" });
        tx = await withdrawWithAmount(withdrawableNow);
      }

      await tx.wait();
      toast.dismiss("withdraw");
      toast.success("提现成功!");
      await fetchTeamData();
      await refreshBalances();
    } catch (err: any) {
      toast.dismiss("withdraw");
      const readableError = formatContractError(err);
      showWithdrawError(readableError || err?.reason || err?.shortMessage || err?.message || "提现失败");
      console.error("[Withdraw Failed]", err);
    } finally {
      setWithdrawing(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("推荐链接已复制!");
  };

  const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const formatU = (wei: bigint) => Number(ethers.formatUnits(wei, usdtDecimals)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const formatSeer = (wei: bigint) => Number(ethers.formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: 2 });

  const formatDateTime = (ts: number) => {
    if (!ts) return "-";
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const getLevelLabel = (level: number) => (level > 0 ? `V${level}` : "无等级");

  const currentSettlementLevel = TEAM_LEVELS.find((l) => l.level === onchainSettlementLevel);
  const nextLevel = TEAM_LEVELS.find((l) => l.level === displayTeamLevel + 1);
  const nowTs = Math.floor(Date.now() / 1000);
  const protectionActive = nodeLevelInfo.protectedUntil > nowTs;
  const displayIdentityLevel = Math.max(displayTeamLevel, protectionActive ? nodeLevelInfo.currentTier : 0);
  const displayLevelConfig = TEAM_LEVELS.find((l) => l.level === displayIdentityLevel);
  const levelDisplayMode = nodeLevelInfo.isNode && protectionActive && nodeLevelInfo.currentTier >= displayTeamLevel
    ? "节点保级展示中"
    : "按小区业绩实时计算展示";

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <Users size={48} className="text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">请连接钱包后查看团队</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* 标题 */}
      <div className="team-hero rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Users size={22} className="text-violet-400" /> 团队中心
        </h2>
        <p className="text-slate-400 text-sm mt-1">组建团队 · 节点保级 · 统一查看当前等级权益</p>
      </div>

      {/* 核心数据 */}
      <div className="team-card rounded-2xl p-5">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-indigo-400" /> 核心数据
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs">个人业绩</p>
            <p className="text-2xl font-black text-emerald-300 mt-1">{formatU(personalVolume)}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">USDT</p>
          </div>
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs">直推人数</p>
            <p className="text-2xl font-black text-white mt-1">{directCount}</p>
          </div>
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs">团队人数</p>
            <p className="text-2xl font-black text-white mt-1">{teamCount}</p>
          </div>
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs">小区业绩</p>
            <p className="text-2xl font-black text-violet-300 mt-1">{formatU(smallAreaVolume)}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">USDT（总分支减最大区）</p>
          </div>
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs">团队业绩（不含本人）</p>
            <p className="text-2xl font-black text-indigo-300 mt-1">{formatU(teamVolume)}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">USDT</p>
          </div>
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs">累计收益</p>
            <p className="text-2xl font-black text-emerald-400 mt-1">{formatSeer(totalEarned)}</p>
            <p className="text-slate-500 text-[10px] mt-0.5">KNIGHTS</p>
          </div>
        </div>
      </div>

      {/* 推荐人信息卡 */}
      <div className="team-card rounded-2xl p-5">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <UserPlus size={16} className="text-violet-400" />
          {isRegistered ? "推荐人信息" : "绑定推荐人"}
        </h3>

        {/* 已绑定状态 */}
        {isRegistered && (
          <>
            <div className="bg-emerald-900/15 border border-emerald-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 size={16} className="flex-shrink-0" />
                <p className="text-sm font-semibold">已完成推荐人绑定</p>
              </div>
              <p className="text-slate-400 text-xs mt-1.5">推荐人及直推账号明细请查看下方“推荐关系”模块。</p>
            </div>
          </>
        )}

        {/* 未注册：绑定表单 */}
        {!isRegistered && (
          <>
            {/* 注册中 */}
            {isRegistering && (
              <div className="flex items-center gap-3 py-3 px-4 bg-indigo-900/30 border border-indigo-500/20 rounded-xl mb-3">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <div>
                  <p className="text-indigo-300 text-sm font-bold">正在链上注册...</p>
                  <p className="text-slate-400 text-xs mt-0.5">请在钱包中确认交易</p>
                </div>
              </div>
            )}

            {/* 错误提示 */}
            {!isRegistering && registerError && (
              <div className="flex items-start gap-2 py-2 px-3 bg-rose-900/20 border border-rose-500/20 rounded-lg mb-3">
                <span className="text-rose-400 text-xs mt-0.5">⚠️</span>
                <p className="text-rose-300 text-xs">{registerError}</p>
              </div>
            )}

            {!isRegistering && (
              <>
                {/* 手动输入 */}
                <div className="mb-4">
                  <label className="text-slate-400 text-xs mb-1.5 flex items-center gap-1">
                    <Link2 size={11} /> 输入推荐人钱包地址
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputReferrer}
                      onChange={(e) => { setInputReferrer(e.target.value); setInputError(null); }}
                      placeholder="0x..."
                      className="team-input flex-1 focus:border-indigo-500/60 rounded-xl px-3 py-2.5 text-sm font-mono outline-none transition-colors"
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
                    <p className="text-rose-400 text-xs mt-1.5">⚠️ {inputError}</p>
                  )}
                </div>

                {/* 分隔 */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-indigo-500/10" />
                  <span className="text-slate-600 text-xs">或</span>
                  <div className="flex-1 h-px bg-indigo-500/10" />
                </div>

                {/* 平台默认 */}
                <button
                  onClick={handleBindDefault}
                  className="w-full py-2.5 border border-indigo-500/25 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-slate-300 hover:text-white text-sm rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <UserPlus size={15} className="text-indigo-400" />
                  使用平台默认推荐人注册
                </button>
                <p className="text-slate-600 text-xs text-center mt-1">无邀请链接时可使用</p>
              </>
            )}
          </>
        )}
      </div>

      {/* KNIGHTS 余额卡 */}
      <div className="team-card rounded-2xl p-5">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Wallet size={16} className="text-indigo-400" /> 我的 KNIGHTS 余额
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {/* 可提现余额 */}
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">
              <ArrowDownToLine size={11} className="text-emerald-400" /> 提现钱包
            </p>
            <p className="text-xl font-black text-emerald-400">{formatSeer(seerAvailable)}</p>
            <p className="text-slate-500 text-xs mt-0.5">KNIGHTS（已释放，可直接提现）</p>
          </div>
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">
              <Lock size={11} className="text-amber-400" /> 待释放池
            </p>
            <p className="text-xl font-black text-amber-300">{formatSeer(seerPendingRelease)}</p>
            <p className="text-slate-500 text-xs mt-0.5">KNIGHTS（按等级每日释放）</p>
          </div>
          {/* 投注钱包 */}
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs mb-1 flex items-center gap-1">
              <Lock size={11} className="text-violet-400" /> 投注钱包
            </p>
            <p className="text-xl font-black text-violet-400">{formatSeer(seerBetting)}</p>
            <p className="text-slate-500 text-xs mt-0.5">KNIGHTS（B仓30%，限生态）</p>
          </div>
        </div>

        {/* 双仓位说明 */}
        <div className="bg-indigo-900/10 border border-indigo-500/15 rounded-lg px-3 py-2 mb-4">
          <p className="text-indigo-300 text-xs flex items-start gap-1.5">
            <Lock size={11} className="mt-0.5 flex-shrink-0" />
            <span>B仓释放进入“待释放池/投注钱包”：其中 <span className="font-bold text-violet-300">30%</span> 进入投注钱包，剩余进入待释放池；待释放池按链上结算等级每日释放到提现钱包，当前日释放比例 <span className="font-bold text-emerald-300">{dailyReleasePercent}%</span>。</span>
          </p>
        </div>

        {/* 提现按钮 */}
        <button
          onClick={handleWithdraw}
          disabled={withdrawing || (seerAvailable + seerReleasableToday) === 0n}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            (seerAvailable + seerReleasableToday) > 0n && !withdrawing
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 active:scale-95"
              : "bg-slate-700/50 text-slate-500 cursor-not-allowed"
          }`}
        >
          {withdrawing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              提现中...
            </>
          ) : (
            <>
              <ArrowDownToLine size={16} />
              {(seerAvailable + seerReleasableToday) > 0n
                ? `提现今日可提 ${formatSeer(seerAvailable + seerReleasableToday)} KNIGHTS`
                : "暂无可提现余额"
              }
            </>
          )}
        </button>
        {(seerAvailable > 0n || seerPendingRelease > 0n) && currentSettlementLevel && (
          <p className="text-slate-500 text-xs text-center mt-1.5">
            提现不收手续费；今日可新增释放 {formatSeer(seerReleasableToday)} KNIGHTS，未释放部分继续留在待释放池
          </p>
        )}
      </div>

      {/* 当前等级 */}
      <div className="team-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-slate-400 text-xs">展示身份等级</span>
            <p className="text-2xl font-black text-white mt-1 flex items-center gap-2">
              <Shield size={24} className={displayIdentityLevel > 0 ? "text-amber-400" : "text-slate-500"} />
              {displayLevelConfig?.name || getLevelLabel(displayIdentityLevel)}
            </p>
            <p className="text-slate-500 text-xs mt-1">{levelDisplayMode}</p>
          </div>
          <div className="text-right">
            <span className="text-slate-400 text-xs">链上日释放比例</span>
            <p className="text-lg font-bold text-white">{currentSettlementLevel?.withdrawReleasePercent || 50}%</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs">链上结算等级（用于释放）</p>
            <p className="text-lg font-bold text-white mt-1">{currentSettlementLevel?.name || "无等级"}</p>
          </div>
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs">节点身份等级</p>
            <p className="text-lg font-bold text-violet-300 mt-1">
              {nodeLevelInfo.isNode ? `${getLevelLabel(nodeLevelInfo.currentTier)} 节点` : "未持有节点"}
            </p>
          </div>
          <div className="team-subcard rounded-xl p-4">
            <p className="text-slate-400 text-xs">保级截止</p>
            <p className="text-lg font-bold text-amber-300 mt-1">{formatDateTime(nodeLevelInfo.protectedUntil)}</p>
            <p className="text-slate-500 text-[10px] mt-1">节点购买后默认保级 {NODE_LEVEL_PROTECTION_DAYS} 天</p>
          </div>
        </div>

        <div className="bg-indigo-900/10 border border-indigo-500/15 rounded-lg px-3 py-2 mb-4">
          <p className="text-indigo-300 text-xs">
            展示等级按小区业绩实时计算；节点保级期间展示身份等级取实时展示等级与节点保级等级的较高值。待释放池的日释放比例与结算仍按链上结算等级执行。
          </p>
        </div>

        {/* 进度条 */}
        {nextLevel && (
          <div className="team-progress-track rounded-full h-3 overflow-hidden mb-2">
            <div
              className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full transition-all"
              style={{
                width: `${Math.min(
                  100,
                  (Number(ethers.formatUnits(smallAreaVolume, usdtDecimals)) / nextLevel.thresholdUsdt) * 100
                )}%`,
              }}
            />
          </div>
        )}
        {nextLevel && (
          <p className="text-slate-500 text-xs">
            小区业绩: {formatU(smallAreaVolume)} / {nextLevel.thresholdUsdt.toLocaleString()} U → {nextLevel.name}
          </p>
        )}
      </div>

      {/* 等级说明 */}
      <div className="team-card rounded-2xl p-5">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Star size={16} className="text-amber-400" /> 等级体系
        </h3>
        <div className="space-y-2">
          {TEAM_LEVELS.map((level) => {
            const isActive = displayIdentityLevel >= level.level;
            return (
              <div
                key={level.level}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                  isActive
                    ? "border-violet-500/30 bg-violet-500/5"
                    : "team-subcard-soft"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                      isActive ? "bg-violet-500 text-white" : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {level.level}
                  </div>
                  <div>
                    <p className={`font-bold text-sm ${isActive ? "text-white" : "text-slate-400"}`}>
                      {level.name}
                    </p>
                    <p className="text-slate-500 text-xs">
                      {level.thresholdUsdt >= 10000
                        ? `${(level.thresholdUsdt / 10000).toLocaleString()}万U`
                        : `${level.thresholdUsdt.toLocaleString()}U`}
                      小区业绩
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${isActive ? "text-emerald-400" : "text-slate-500"}`}>
                    {level.rewardPercent}% 加速
                  </p>
                  <p className="text-slate-500 text-xs">日释放 {level.withdrawReleasePercent}%</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 推荐链接 */}
      <div className="team-hero rounded-2xl p-5">
        <h3 className="text-white font-bold mb-3 flex items-center gap-2">
          <Share2 size={16} className="text-violet-400" /> 推荐链接
        </h3>
        <div className="flex items-center gap-2">
          <input
            value={referralLink}
            readOnly
            className="team-input flex-1 rounded-lg px-3 py-2 text-slate-300 text-xs font-mono"
          />
          <button
            onClick={copyLink}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-1 text-sm transition-colors"
          >
            <Copy size={14} /> 复制
          </button>
        </div>
        {referrer && (
          <p className="text-slate-500 text-xs mt-2">
            我的推荐人: {shortAddr(referrer)}
          </p>
        )}
        <div className="mt-3 text-slate-400 text-xs space-y-1">
          <p>· 动态奖励仅基于 B仓释放</p>
          <p>· 培育奖励：直推 N 人可拿 N 代（默认最多10代）</p>
          <p>· 每代比例默认 1%，总比例默认 10%（可配置）</p>
        </div>
      </div>

      {/* 推荐关系与直推账号 */}
      <div className="team-card rounded-2xl p-5">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Users size={16} className="text-violet-400" /> 推荐关系
        </h3>

        <div className="team-subcard rounded-xl p-4 mb-4">
          <p className="text-slate-400 text-xs mb-1">我的推荐人</p>
          {referrer ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-white text-sm font-mono break-all">{referrer}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => { navigator.clipboard.writeText(referrer); toast.success("地址已复制"); }}
                  className="flex items-center gap-1 px-2 py-1 bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 text-xs rounded-lg transition-colors"
                >
                  <Copy size={12} /> 复制
                </button>
                <a
                  href={`${BLOCK_EXPLORER_URL}/address/${referrer}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 text-xs rounded-lg transition-colors"
                >
                  <ExternalLink size={12} /> 链上
                </a>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">无推荐人（根节点）</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-slate-300 text-sm font-bold">直推账号列表</p>
            <span className="text-slate-500 text-xs">共 {directCount} 人（当前展示前 {directReferralInfos.length} 人）</span>
          </div>

          {directReferralInfos.length === 0 ? (
            <div className="team-subcard-soft rounded-lg px-3 py-4 text-center">
              <p className="text-slate-500 text-sm">暂无直推账号</p>
            </div>
          ) : (
            <div className="space-y-2">
              {directReferralInfos.map((item, index) => (
                <div
                  key={`${item.address}-${index}`}
                  className="team-subcard-soft grid grid-cols-1 md:grid-cols-[1.35fr_0.7fr_1.5fr_auto] items-center gap-3 rounded-lg p-3"
                >
                  <div>
                    <p className="text-slate-200 text-sm font-mono">{shortAddr(item.address)}</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">{item.address}</p>
                  </div>
                  <div>
                    <p className={`text-xs mt-0.5 ${item.registered ? "text-emerald-400" : "text-slate-500"}`}>
                      {item.registered ? "已注册" : "未注册"}
                    </p>
                  </div>
                  <div>
                    <p className="text-violet-300 text-sm font-bold">{formatU(item.branchVolumeUsdt)} U</p>
                    <p className="text-slate-500 text-[11px]">分支业绩</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      个人 {formatU(item.totalInvestedUsdt)} U / 团队 {formatU(item.teamVolumeUsdt)} U
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(item.address); toast.success("地址已复制"); }}
                      className="team-inline-chip flex items-center gap-1 px-2 py-1 hover:bg-slate-600/40 text-slate-300 text-xs rounded-lg transition-colors"
                    >
                      <Copy size={12} /> 复制
                    </button>
                    <a
                      href={`${BLOCK_EXPLORER_URL}/address/${item.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="team-inline-chip flex items-center gap-1 px-2 py-1 hover:bg-slate-600/40 text-slate-300 text-xs rounded-lg transition-colors"
                    >
                      <ExternalLink size={12} /> 链上
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamLevel;
