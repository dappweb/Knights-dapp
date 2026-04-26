import { ethers } from "ethers";
import { AlertTriangle, BadgeCheck, Coins, Pickaxe, RefreshCw, Wallet } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useWeb3 } from "../src/Web3Context";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
] as const;

type LpUserInfo = {
  registered: boolean;
  referrer: string;
  lpAmount: bigint;
  lpValueUsdt: bigint;
  power: bigint;
  directLpValueUsdt: bigint;
  directEffectiveCount: bigint;
  isNode: boolean;
  totalStaticReward: bigint;
  totalDynamicReward: bigint;
  totalNodeReward: bigint;
};

const ZERO_USER: LpUserInfo = {
  registered: false,
  referrer: ethers.ZeroAddress,
  lpAmount: 0n,
  lpValueUsdt: 0n,
  power: 0n,
  directLpValueUsdt: 0n,
  directEffectiveCount: 0n,
  isNode: false,
  totalStaticReward: 0n,
  totalDynamicReward: 0n,
  totalNodeReward: 0n,
};

const formatToken = (value: bigint, decimals = 18, digits = 4) =>
  Number(ethers.formatUnits(value, decimals)).toLocaleString("en-US", { maximumFractionDigits: digits });

const StatCard = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="bg-[#13102B]/70 border border-indigo-500/10 rounded-xl p-4">
    <p className="text-slate-400 text-xs">{label}</p>
    <p className="text-white text-xl font-black mt-1">{value}</p>
    {hint && <p className="text-slate-500 text-xs mt-1">{hint}</p>}
  </div>
);

const LpMiningPanel: React.FC = () => {
  const {
    account,
    isConnected,
    connectWallet,
    signer,
    provider,
    lpMiningContract,
    seerContract,
    contractAddresses,
    refreshBalances,
  } = useWeb3();

  const [lpTokenAddress, setLpTokenAddress] = useState("");
  const [lpDecimals, setLpDecimals] = useState(18);
  const [lpSymbol, setLpSymbol] = useState("LP");
  const [lpBalance, setLpBalance] = useState<bigint>(0n);
  const [userInfo, setUserInfo] = useState<LpUserInfo>(ZERO_USER);
  const [pendingReward, setPendingReward] = useState<bigint>(0n);
  const [poolStats, setPoolStats] = useState({
    day: 0n,
    dailyEmission: 0n,
    totalLpValue: 0n,
    totalPower: 0n,
    dynamicPool: 0n,
    nodeCount: 0n,
  });
  const [depositLpAmount, setDepositLpAmount] = useState("");
  const [depositLpValue, setDepositLpValue] = useState("");
  const [withdrawLpAmount, setWithdrawLpAmount] = useState("");
  const [withdrawLpValue, setWithdrawLpValue] = useState("");
  const [withdrawBurnAmount, setWithdrawBurnAmount] = useState("");
  const [referrer, setReferrer] = useState("");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  const lpTokenContract = useMemo(() => {
    if (!lpTokenAddress || !provider) return null;
    return new ethers.Contract(lpTokenAddress, ERC20_ABI, signer || provider);
  }, [lpTokenAddress, provider, signer]);

  const loadData = useCallback(async () => {
    if (!lpMiningContract) return;
    setLoading(true);
    try {
      const [lpToken, day, dailyEmission, totalLpValue, totalPower, dynamicPool, nodeCount] = await Promise.all([
        lpMiningContract.lpToken().catch(() => ""),
        lpMiningContract.currentDay().catch(() => 0n),
        lpMiningContract.currentDailyEmission().catch(() => 0n),
        lpMiningContract.totalLpValueUsdt().catch(() => 0n),
        lpMiningContract.totalPower().catch(() => 0n),
        lpMiningContract.dynamicPool().catch(() => 0n),
        lpMiningContract.nodeCount().catch(() => 0n),
      ]);

      setLpTokenAddress(lpToken);
      setPoolStats({ day, dailyEmission, totalLpValue, totalPower, dynamicPool, nodeCount });

      if (account) {
        const [rawUser, pending] = await Promise.all([
          lpMiningContract.users(account).catch(() => null),
          lpMiningContract.pendingReward(account).catch(() => 0n),
        ]);

        if (rawUser) {
          setUserInfo({
            registered: Boolean(rawUser.registered ?? rawUser[0]),
            referrer: rawUser.referrer ?? rawUser[1],
            lpAmount: BigInt(rawUser.lpAmount ?? rawUser[2] ?? 0n),
            lpValueUsdt: BigInt(rawUser.lpValueUsdt ?? rawUser[3] ?? 0n),
            power: BigInt(rawUser.power ?? rawUser[4] ?? 0n),
            directLpValueUsdt: BigInt(rawUser.directLpValueUsdt ?? rawUser[8] ?? 0n),
            directEffectiveCount: BigInt(rawUser.directEffectiveCount ?? rawUser[9] ?? 0n),
            isNode: Boolean(rawUser.isNode ?? rawUser[10]),
            totalStaticReward: BigInt(rawUser.totalStaticReward ?? rawUser[12] ?? 0n),
            totalDynamicReward: BigInt(rawUser.totalDynamicReward ?? rawUser[13] ?? 0n),
            totalNodeReward: BigInt(rawUser.totalNodeReward ?? rawUser[14] ?? 0n),
          });
        }
        setPendingReward(pending);
      } else {
        setUserInfo(ZERO_USER);
        setPendingReward(0n);
      }
    } catch (err) {
      console.error("[LP Mining] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [account, lpMiningContract]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;

    const loadLpMeta = async () => {
      if (!lpTokenContract || !account) {
        setLpBalance(0n);
        return;
      }
      try {
        const [decimalsRaw, symbolRaw, balanceRaw] = await Promise.all([
          lpTokenContract.decimals().catch(() => 18),
          lpTokenContract.symbol().catch(() => "LP"),
          lpTokenContract.balanceOf(account).catch(() => 0n),
        ]);
        if (cancelled) return;
        setLpDecimals(Number(decimalsRaw) || 18);
        setLpSymbol(String(symbolRaw || "LP"));
        setLpBalance(balanceRaw);
      } catch {
        if (!cancelled) setLpBalance(0n);
      }
    };

    loadLpMeta();
    return () => {
      cancelled = true;
    };
  }, [account, lpTokenContract]);

  const requireReady = () => {
    if (!isConnected) {
      connectWallet();
      return false;
    }
    if (!account || !signer || !lpMiningContract) {
      toast.error("钱包或 LP 挖矿合约未就绪");
      return false;
    }
    return true;
  };

  const handleDeposit = async () => {
    if (!requireReady() || !lpTokenContract) return;
    try {
      const lpAmount = ethers.parseUnits(depositLpAmount || "0", lpDecimals);
      const lpValue = ethers.parseUnits(depositLpValue || "0", 18);
      if (lpAmount <= 0n || lpValue <= 0n) {
        toast.error("请输入有效的 LP 数量和 USDT 价值");
        return;
      }
      const selectedReferrer = referrer.trim() && ethers.isAddress(referrer.trim())
        ? ethers.getAddress(referrer.trim())
        : ethers.ZeroAddress;

      setAction("deposit");
      const lpMiningAddress = await lpMiningContract.getAddress();
      const allowance = await lpTokenContract.allowance(account, lpMiningAddress);
      if (allowance < lpAmount) {
        toast.loading("授权 LP Token...", { id: "lp-deposit" });
        const approveTx = await lpTokenContract.approve(lpMiningAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      toast.loading("提交 LP 质押...", { id: "lp-deposit" });
      const tx = await lpMiningContract.depositLp(lpAmount, lpValue, selectedReferrer);
      await tx.wait();
      toast.success("LP 质押成功", { id: "lp-deposit" });
      setDepositLpAmount("");
      setDepositLpValue("");
      await loadData();
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || err?.message || "LP 质押失败", { id: "lp-deposit" });
    } finally {
      setAction(null);
    }
  };

  const handleWithdraw = async () => {
    if (!requireReady()) return;
    try {
      const lpAmount = ethers.parseUnits(withdrawLpAmount || "0", lpDecimals);
      const lpValue = ethers.parseUnits(withdrawLpValue || "0", 18);
      const burnAmount = ethers.parseEther(withdrawBurnAmount || "0");
      if (lpAmount <= 0n || lpValue <= 0n) {
        toast.error("请输入有效的撤出 LP 数量和 USDT 价值");
        return;
      }

      setAction("withdraw");
      if (burnAmount > 0n && seerContract && account) {
        const lpMiningAddress = await lpMiningContract!.getAddress();
        const allowance = await seerContract.allowance(account, lpMiningAddress);
        if (allowance < burnAmount) {
          toast.loading("授权 KNT 销毁额度...", { id: "lp-withdraw" });
          const approveTx = await seerContract.approve(lpMiningAddress, ethers.MaxUint256);
          await approveTx.wait();
        }
      }

      toast.loading("提交撤池...", { id: "lp-withdraw" });
      const tx = await lpMiningContract!.withdrawLp(lpAmount, lpValue, burnAmount);
      await tx.wait();
      toast.success("LP 撤出成功", { id: "lp-withdraw" });
      setWithdrawLpAmount("");
      setWithdrawLpValue("");
      setWithdrawBurnAmount("");
      await loadData();
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || err?.message || "LP 撤出失败", { id: "lp-withdraw" });
    } finally {
      setAction(null);
    }
  };

  const handleClaim = async () => {
    if (!requireReady()) return;
    try {
      setAction("claim");
      toast.loading("领取 LP 挖矿收益...", { id: "lp-claim" });
      const tx = await lpMiningContract!.claim();
      await tx.wait();
      toast.success("收益领取成功", { id: "lp-claim" });
      await loadData();
      await refreshBalances();
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || err?.message || "领取失败", { id: "lp-claim" });
    } finally {
      setAction(null);
    }
  };

  if (!contractAddresses.LP_MINING) {
    return (
      <div className="max-w-4xl mx-auto bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-400" /> LP 挖矿未配置
        </h2>
        <p className="text-slate-300 text-sm mt-2">
          需要配置 `VITE_KNT_LP_MINING_ADDRESS` 后，前端才能接入 XMind 的 LP 挖矿合约。
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="bg-gradient-to-r from-emerald-900/40 to-cyan-900/30 border border-emerald-500/15 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Pickaxe size={22} className="text-emerald-400" /> KNT / LABUBU LP 挖矿
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              对齐 XMind：LP 算力、静态 50%、动态 40%、节点 10%、每日递增与 50 天减产。
            </p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/25 px-4 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-500/10"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="当前日产出" value={`${formatToken(poolStats.dailyEmission)} KNT`} hint={`第 ${poolStats.day.toString()} 天`} />
        <StatCard label="全网 LP 价值" value={`${formatToken(poolStats.totalLpValue)} U`} />
        <StatCard label="全网算力" value={formatToken(poolStats.totalPower, 0, 0)} />
        <StatCard label="节点数量" value={poolStats.nodeCount.toString()} hint={userInfo.isNode ? "当前地址已达标节点" : "当前地址未达标"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Coins size={18} className="text-emerald-400" /> 质押 LP
          </h3>
          <div className="bg-[#13102B]/70 border border-indigo-500/10 rounded-xl p-3 text-xs text-slate-400 space-y-1">
            <p>LP Token: <span className="text-slate-200 font-mono break-all">{lpTokenAddress || "读取中"}</span></p>
            <p>钱包余额: <span className="text-white">{formatToken(lpBalance, lpDecimals)} {lpSymbol}</span></p>
          </div>
          <input
            value={depositLpAmount}
            onChange={(e) => setDepositLpAmount(e.target.value)}
            placeholder={`LP 数量 (${lpSymbol})`}
            inputMode="decimal"
            className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          <input
            value={depositLpValue}
            onChange={(e) => setDepositLpValue(e.target.value)}
            placeholder="该 LP 对应 USDT 价值"
            inputMode="decimal"
            className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          {!userInfo.registered && (
            <input
              value={referrer}
              onChange={(e) => setReferrer(e.target.value)}
              placeholder="推荐人地址，可空则使用合约默认规则"
              className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
            />
          )}
          <button
            onClick={handleDeposit}
            disabled={action === "deposit"}
            className="w-full inline-flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-bold rounded-xl transition-colors"
          >
            <Wallet size={16} /> {isConnected ? "质押 LP" : "连接钱包"}
          </button>
        </div>

        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold flex items-center gap-2">
            <BadgeCheck size={18} className="text-cyan-400" /> 我的 LP 仓位
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="LP 数量" value={`${formatToken(userInfo.lpAmount, lpDecimals)} ${lpSymbol}`} />
            <StatCard label="LP 价值" value={`${formatToken(userInfo.lpValueUsdt)} U`} />
            <StatCard label="个人算力" value={formatToken(userInfo.power, 0, 0)} />
            <StatCard label="待领取" value={`${formatToken(pendingReward)} KNT`} />
          </div>
          <button
            onClick={handleClaim}
            disabled={pendingReward <= 0n || action === "claim"}
            className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors"
          >
            领取挖矿收益
          </button>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={withdrawLpAmount}
              onChange={(e) => setWithdrawLpAmount(e.target.value)}
              placeholder="撤出 LP 数量"
              inputMode="decimal"
              className="bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
            />
            <input
              value={withdrawLpValue}
              onChange={(e) => setWithdrawLpValue(e.target.value)}
              placeholder="撤出 LP 价值"
              inputMode="decimal"
              className="bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
            />
            <input
              value={withdrawBurnAmount}
              onChange={(e) => setWithdrawBurnAmount(e.target.value)}
              placeholder="销毁 KNT 数量"
              inputMode="decimal"
              className="bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <button
            onClick={handleWithdraw}
            disabled={action === "withdraw"}
            className="w-full py-3 border border-rose-500/30 hover:bg-rose-500/10 text-rose-200 font-bold rounded-xl transition-colors"
          >
            撤出 LP
          </button>
          <p className="text-amber-300 text-xs">
            注意：合约要求撤池时传入需要销毁的 KNT 数量；如果业务要强制 100% 销毁，应由后续合约/路由层计算并锁定该参数。
          </p>
        </div>
      </div>
    </div>
  );
};

export default LpMiningPanel;
