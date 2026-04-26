import { ethers } from "ethers";
import { AlertTriangle, ArrowRight, CheckCircle, Clock, Gift, Lock, Shield, Sparkles, Unlock, Users, Wallet } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useLanguage } from "../src/LanguageContext";
import { useWeb3 } from "../src/Web3Context";
import { AIRDROP_REGISTER_AMOUNT, AIRDROP_UNLOCK_MIN_MINER, TOKEN_ALLOCATION } from "../src/constants";
import AnimatedButton from "./AnimatedButton";

interface AirdropStatus {
  amount: number;
  claimed: boolean;
  unlocked: boolean;
  withdrawn: boolean;
}

interface PoolStats {
  poolRemaining: bigint;
  totalClaimed: bigint;
  claimCount: number;
  remainingSlots: number;
}

const AirdropPanel: React.FC = () => {
  const { t } = useLanguage();
  const {
    account, isConnected, airdropContract, refreshBalances
  } = useWeb3();

  const [status, setStatus] = useState<AirdropStatus | null>(null);
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  // 获取空投状态 — 并行查询所有数据
  const fetchAirdropData = useCallback(async () => {
    if (!airdropContract) return;
    setLoading(true);
    try {
      // 池子统计 + 用户数据全部并行查询
      const queries: Promise<any>[] = [
        airdropContract.airdropPoolRemaining(),
        airdropContract.totalClaimed(),
        airdropContract.claimCount(),
        airdropContract.remainingAirdropSlots(),
      ];
      if (account) queries.push(airdropContract.getAirdropInfo(account));

      const results = await Promise.all(queries);
      const [poolRemaining, totalClaimed, claimCount, remainingSlots, info] = results;

      setPoolStats({
        poolRemaining,
        totalClaimed,
        claimCount: Number(claimCount),
        remainingSlots: Number(remainingSlots),
      });

      if (info) {
        setStatus({
          amount: Number(ethers.formatEther(info[0])),
          claimed: info[1],
          unlocked: info[2],
          withdrawn: info[3],
        });
      }
    } catch (err) {
      console.error("Failed to fetch airdrop data:", err);
    } finally {
      setLoading(false);
    }
  }, [airdropContract, account]);

  useEffect(() => {
    fetchAirdropData();
  }, [fetchAirdropData]);

  // 提取空投 — 乐观更新：提交即更新UI，后台等待确认
  const handleWithdraw = async () => {
    if (!airdropContract) return;
    setWithdrawing(true);
    try {
      toast.loading("提交交易中...", { id: "airdrop-withdraw" });
      const tx = await airdropContract.withdrawAirdrop();
      setTxHash(tx.hash);

      // 乐观更新：交易提交成功即更新UI，无需等待出块
      toast.dismiss("airdrop-withdraw");
      toast.success(`交易已提交！${AIRDROP_REGISTER_AMOUNT} KNIGHTS 即将到账`);
      setStatus(prev => prev ? { ...prev, withdrawn: true } : prev);
      setWithdrawing(false);

      // 后台等待确认后并行刷新数据
      tx.wait().then(() => {
        Promise.all([fetchAirdropData(), refreshBalances()]);
        setTxHash(null);
      }).catch(() => {
        // 确认失败时回滚乐观更新
        setStatus(prev => prev ? { ...prev, withdrawn: false } : prev);
        setTxHash(null);
        toast.error("交易确认失败，请刷新页面重试");
      });
    } catch (err: any) {
      toast.dismiss("airdrop-withdraw");
      toast.error(err?.reason || err?.shortMessage || err?.message || "提取失败");
      setWithdrawing(false);
    }
  };

  const formatSeer = (wei: bigint) =>
    Number(ethers.formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: 0 });

  // 当前步骤
  const currentStep = !status?.claimed ? 0 : !status?.unlocked ? 1 : !status?.withdrawn ? 2 : 3;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* 标题 */}
      <div className="bg-gradient-to-r from-amber-900/30 to-violet-900/30 border border-amber-500/15 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Gift size={22} className="text-amber-400" /> 空投中心
        </h2>
        <p className="text-slate-400 text-sm mt-1">注册即领 · 购机解锁 · 免费获取 KNIGHTS</p>
        {!isConnected && (
          <p className="text-amber-400 text-sm mt-3 flex items-center gap-1">
            <Wallet size={14} /> 连接钱包查看您的空投状态
          </p>
        )}
      </div>

      {/* 空投池统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Gift size={14} className="text-amber-400" />
            <span className="text-slate-400 text-xs">每人空投</span>
          </div>
          <p className="text-white text-lg font-bold">{AIRDROP_REGISTER_AMOUNT}</p>
          <p className="text-slate-500 text-[10px]">KNIGHTS</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-violet-400" />
            <span className="text-slate-400 text-xs">已领取人数</span>
          </div>
          <p className="text-white text-lg font-bold">{poolStats?.claimCount ?? "—"}</p>
          <p className="text-slate-500 text-[10px]">人</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-emerald-400" />
            <span className="text-slate-400 text-xs">剩余名额</span>
          </div>
          <p className="text-white text-lg font-bold">{poolStats?.remainingSlots?.toLocaleString() ?? "—"}</p>
          <p className="text-slate-500 text-[10px]">份</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={14} className="text-rose-400" />
            <span className="text-slate-400 text-xs">空投总量</span>
          </div>
          <p className="text-white text-lg font-bold">{(TOKEN_ALLOCATION.airdrop.amount / 1_000_000).toFixed(1)}M</p>
          <p className="text-slate-500 text-[10px]">KNIGHTS ({TOKEN_ALLOCATION.airdrop.percent}%)</p>
        </div>
      </div>

      {/* ══════ 领取流程 ══════ */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 backdrop-blur-sm">
        <h3 className="text-white font-bold mb-5 flex items-center gap-2">
          <ArrowRight size={16} className="text-violet-400" /> 领取流程
        </h3>
        <div className="space-y-4">
          {/* 步骤1: 注册 */}
          <div className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
            currentStep === 0 && isConnected
              ? "border-amber-500/30 bg-amber-500/5"
              : currentStep > 0
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-indigo-500/10 bg-[#13102B]/30"
          }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              currentStep > 0 ? "bg-emerald-500" : currentStep === 0 && isConnected ? "bg-amber-500 animate-pulse" : "bg-slate-700"
            }`}>
              {currentStep > 0 ? <CheckCircle size={20} className="text-white" /> : <span className="text-white font-black">1</span>}
            </div>
            <div className="flex-1">
              <p className="text-white font-bold">注册账户</p>
              <p className="text-slate-400 text-sm mt-1">
                通过推荐链接访问并注册，自动获得 <span className="text-amber-400 font-bold">{AIRDROP_REGISTER_AMOUNT} KNIGHTS</span> 空投（锁定状态）
              </p>
              {currentStep === 0 && isConnected && (
                <p className="text-amber-400 text-xs mt-2 flex items-center gap-1">
                  <Clock size={12} /> 请通过推荐链接注册以获取空投
                </p>
              )}
              {currentStep > 0 && status && (
                <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1">
                  <CheckCircle size={12} /> 已领取 {status.amount} KNIGHTS
                </p>
              )}
            </div>
          </div>

          {/* 步骤2: 购买矿机解锁 */}
          <div className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
            currentStep === 1
              ? "border-amber-500/30 bg-amber-500/5"
              : currentStep > 1
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-indigo-500/10 bg-[#13102B]/30"
          }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              currentStep > 1 ? "bg-emerald-500" : currentStep === 1 ? "bg-amber-500 animate-pulse" : "bg-slate-700"
            }`}>
              {currentStep > 1 ? <CheckCircle size={20} className="text-white" /> : <span className="text-white font-black">2</span>}
            </div>
            <div className="flex-1">
              <p className="text-white font-bold flex items-center gap-2">
                <Unlock size={16} className="text-slate-400" /> 购买矿机解锁
              </p>
              <p className="text-slate-400 text-sm mt-1">
                购买 <span className="text-amber-400 font-bold">{AIRDROP_UNLOCK_MIN_MINER}U</span> 以上矿机后，空投自动解锁
              </p>
              {currentStep === 1 && (
                <p className="text-amber-400 text-xs mt-2 flex items-center gap-1">
                  <AlertTriangle size={12} /> 当前空投已锁定，购买矿机即可解锁
                </p>
              )}
              {currentStep > 1 && (
                <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1">
                  <CheckCircle size={12} /> 空投已解锁
                </p>
              )}
            </div>
          </div>

          {/* 步骤3: 提取到钱包 */}
          <div className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
            currentStep === 2
              ? "border-violet-500/30 bg-violet-500/5"
              : currentStep > 2
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-indigo-500/10 bg-[#13102B]/30"
          }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              currentStep > 2 ? "bg-emerald-500" : currentStep === 2 ? "bg-violet-500 animate-pulse" : "bg-slate-700"
            }`}>
              {currentStep > 2 ? <CheckCircle size={20} className="text-white" /> : <span className="text-white font-black">3</span>}
            </div>
            <div className="flex-1">
              <p className="text-white font-bold flex items-center gap-2">
                <Gift size={16} className="text-slate-400" /> 提取 KNIGHTS
              </p>
              <p className="text-slate-400 text-sm mt-1">
                解锁后点击提取按钮，KNIGHTS 将转入您的钱包
              </p>
              {currentStep === 2 && (
                <div className="mt-3 space-y-2">
                  <AnimatedButton
                    onClick={handleWithdraw}
                    loading={withdrawing}
                    variant="primary"
                    className="px-8"
                  >
                    <Gift size={16} /> 提取 {status?.amount} KNIGHTS
                  </AnimatedButton>
                  {txHash && (
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock size={11} className="animate-spin" />
                      链上确认中...
                      <a
                        href={`https://scan.cncchainpro.com/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 underline"
                      >查看交易</a>
                    </p>
                  )}
                </div>
              )}
              {currentStep > 2 && (
                <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1">
                  <CheckCircle size={12} /> 已成功提取到钱包
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════ 用户空投状态卡片 ══════ */}
      {isConnected && status?.claimed && (
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 backdrop-blur-sm">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Shield size={16} className="text-amber-400" /> 我的空投
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-xs">空投数量</p>
              <p className="text-amber-400 text-xl font-bold mt-1">{status.amount}</p>
              <p className="text-slate-500 text-[10px]">KNIGHTS</p>
            </div>
            <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-xs">领取状态</p>
              <div className="mt-1 flex items-center justify-center gap-1">
                <CheckCircle size={16} className="text-emerald-400" />
                <span className="text-emerald-400 text-sm font-bold">已领取</span>
              </div>
            </div>
            <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-xs">锁定状态</p>
              <div className="mt-1 flex items-center justify-center gap-1">
                {status.unlocked ? (
                  <><Unlock size={16} className="text-emerald-400" /><span className="text-emerald-400 text-sm font-bold">已解锁</span></>
                ) : (
                  <><Lock size={16} className="text-rose-400" /><span className="text-rose-400 text-sm font-bold">锁定中</span></>
                )}
              </div>
            </div>
            <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-3 text-center">
              <p className="text-slate-400 text-xs">提取状态</p>
              <div className="mt-1 flex items-center justify-center gap-1">
                {status.withdrawn ? (
                  <><CheckCircle size={16} className="text-emerald-400" /><span className="text-emerald-400 text-sm font-bold">已提取</span></>
                ) : status.unlocked ? (
                  <><Gift size={16} className="text-violet-400 animate-bounce" /><span className="text-violet-400 text-sm font-bold">可提取</span></>
                ) : (
                  <><Clock size={16} className="text-slate-500" /><span className="text-slate-500 text-sm font-bold">等待解锁</span></>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ 常见问题 ══════ */}
      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 backdrop-blur-sm">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-400" /> 常见问题
        </h3>
        <div className="space-y-3">
          <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4">
            <p className="text-white text-sm font-bold mb-1">Q: 如何获得空投？</p>
            <p className="text-slate-400 text-xs">
              通过已有用户的推荐链接访问并注册，即可自动获得 {AIRDROP_REGISTER_AMOUNT} KNIGHTS 空投奖励（锁定状态）。
            </p>
          </div>
          <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4">
            <p className="text-white text-sm font-bold mb-1">Q: 空投为什么是锁定的？</p>
            <p className="text-slate-400 text-xs">
              为防止恶意批量注册领取空投，空投初始为锁定状态。购买 {AIRDROP_UNLOCK_MIN_MINER}U 以上矿机后自动解锁。
            </p>
          </div>
          <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4">
            <p className="text-white text-sm font-bold mb-1">Q: 空投总量有多少？</p>
            <p className="text-slate-400 text-xs">
              空投池共 {TOKEN_ALLOCATION.airdrop.amount.toLocaleString()} KNIGHTS（总供应量的 {TOKEN_ALLOCATION.airdrop.percent}%），
              先到先得，领完即止。{poolStats ? `当前剩余 ${poolStats.remainingSlots.toLocaleString()} 份。` : ""}
            </p>
          </div>
          <div className="bg-[#13102B]/60 border border-indigo-500/10 rounded-xl p-4">
            <p className="text-white text-sm font-bold mb-1">Q: 提取后 KNIGHTS 在哪里？</p>
            <p className="text-slate-400 text-xs">
              提取后 KNIGHTS 将直接转入您的钱包地址，可在首页"KNIGHTS (可用)"余额中查看，
              也可在交易记录中查看提取记录。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AirdropPanel;
