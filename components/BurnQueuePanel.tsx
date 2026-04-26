import { ethers } from "ethers";
import { AlertTriangle, Flame, RefreshCw, Send, Wallet } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useWeb3 } from "../src/Web3Context";

type QueueEntry = {
  index: number;
  account: string;
  burnedAmount: bigint;
  rewardAmount: bigint;
  paid: boolean;
};

const formatKnt = (value: bigint, digits = 4) =>
  Number(ethers.formatEther(value)).toLocaleString("en-US", { maximumFractionDigits: digits });

const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const BurnQueuePanel: React.FC = () => {
  const {
    account,
    isConnected,
    connectWallet,
    signer,
    burnQueueContract,
    seerContract,
    contractAddresses,
    refreshBalances,
  } = useWeb3();

  const [amount, setAmount] = useState("");
  const [processCount, setProcessCount] = useState("5");
  const [queueLength, setQueueLength] = useState(0);
  const [rewardPool, setRewardPool] = useState<bigint>(0n);
  const [nextPayoutIndex, setNextPayoutIndex] = useState(0);
  const [rewardMultiplierBP, setRewardMultiplierBP] = useState<bigint>(12000n);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!burnQueueContract) return;
    setLoading(true);
    try {
      const [lengthRaw, rewardPoolRaw, nextRaw, multiplierRaw] = await Promise.all([
        burnQueueContract.queueLength().catch(() => 0n),
        burnQueueContract.rewardPool().catch(() => 0n),
        burnQueueContract.nextPayoutIndex().catch(() => 0n),
        burnQueueContract.rewardMultiplierBP().catch(() => 12000n),
      ]);
      const length = Number(lengthRaw);
      const next = Number(nextRaw);
      setQueueLength(length);
      setRewardPool(rewardPoolRaw);
      setNextPayoutIndex(next);
      setRewardMultiplierBP(multiplierRaw);

      const start = Math.max(0, length - 30);
      const rows: QueueEntry[] = [];
      for (let i = start; i < length; i++) {
        try {
          const item = await burnQueueContract.queue(i);
          rows.push({
            index: i,
            account: item.account ?? item[0],
            burnedAmount: BigInt(item.burnedAmount ?? item[1] ?? 0n),
            rewardAmount: BigInt(item.rewardAmount ?? item[2] ?? 0n),
            paid: Boolean(item.paid ?? item[3]),
          });
        } catch {
          // ignore broken row reads
        }
      }
      setEntries(rows.reverse());
    } catch (err) {
      console.error("[BurnQueue] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [burnQueueContract]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const requireReady = () => {
    if (!isConnected) {
      connectWallet();
      return false;
    }
    if (!account || !signer || !burnQueueContract || !seerContract) {
      toast.error("钱包或销毁队列合约未就绪");
      return false;
    }
    return true;
  };

  const handleBurnAndQueue = async () => {
    if (!requireReady()) return;
    try {
      const parsed = ethers.parseEther(amount || "0");
      if (parsed <= 0n) {
        toast.error("请输入有效的 KNT 数量");
        return;
      }

      setAction("burn");
      const queueAddress = await burnQueueContract!.getAddress();
      const allowance = await seerContract!.allowance(account, queueAddress);
      if (allowance < parsed) {
        toast.loading("授权 KNT...", { id: "burn-queue" });
        const approveTx = await seerContract!.approve(queueAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      toast.loading("提交销毁排队...", { id: "burn-queue" });
      const tx = await burnQueueContract!.burnAndQueue(parsed);
      await tx.wait();
      toast.success("已销毁并进入排队", { id: "burn-queue" });
      setAmount("");
      await loadData();
      await refreshBalances();
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || err?.message || "销毁排队失败", { id: "burn-queue" });
    } finally {
      setAction(null);
    }
  };

  const handleProcessNext = async () => {
    if (!requireReady()) return;
    try {
      const count = Number(processCount || "0");
      if (!Number.isFinite(count) || count <= 0) {
        toast.error("请输入有效的处理数量");
        return;
      }
      setAction("process");
      toast.loading("处理队列出局...", { id: "process-queue" });
      const tx = await burnQueueContract!.processNext(count);
      await tx.wait();
      toast.success("队列处理完成", { id: "process-queue" });
      await loadData();
      await refreshBalances();
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || err?.message || "处理队列失败", { id: "process-queue" });
    } finally {
      setAction(null);
    }
  };

  if (!contractAddresses.BURN_QUEUE) {
    return (
      <div className="max-w-4xl mx-auto bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-400" /> 销毁队列未配置
        </h2>
        <p className="text-slate-300 text-sm mt-2">
          需要配置 `VITE_KNT_BURN_QUEUE_ADDRESS` 后，前端才能接入主动打入黑洞、排队 1.2 倍出局的业务。
        </p>
      </div>
    );
  }

  const userRows = account
    ? entries.filter((row) => row.account.toLowerCase() === account.toLowerCase())
    : [];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="bg-gradient-to-r from-rose-950/50 to-amber-950/30 border border-rose-500/20 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Flame size={22} className="text-rose-400" /> KNT 销毁排队
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              对齐 XMind：买入或产出的 KNT 主动打入黑洞，按时间顺序排队，默认奖励 1.2 倍。
            </p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/25 px-4 py-2 text-sm font-bold text-rose-200 hover:bg-rose-500/10"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4">
          <p className="text-slate-400 text-xs">队列长度</p>
          <p className="text-white text-2xl font-black mt-1">{queueLength}</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4">
          <p className="text-slate-400 text-xs">下一个出局序号</p>
          <p className="text-white text-2xl font-black mt-1">#{nextPayoutIndex}</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4">
          <p className="text-slate-400 text-xs">奖励池</p>
          <p className="text-emerald-300 text-2xl font-black mt-1">{formatKnt(rewardPool)}</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4">
          <p className="text-slate-400 text-xs">奖励倍数</p>
          <p className="text-amber-300 text-2xl font-black mt-1">{Number(rewardMultiplierBP) / 10000}x</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold">主动销毁</h3>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="销毁 KNT 数量"
            inputMode="decimal"
            className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          <button
            onClick={handleBurnAndQueue}
            disabled={action === "burn"}
            className="w-full inline-flex items-center justify-center gap-2 py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-700 text-white font-bold rounded-xl"
          >
            <Wallet size={16} /> {isConnected ? "销毁并排队" : "连接钱包"}
          </button>

          <div className="pt-4 border-t border-indigo-500/10 space-y-2">
            <p className="text-slate-300 text-sm font-bold">处理出局</p>
            <div className="flex gap-2">
              <input
                value={processCount}
                onChange={(e) => setProcessCount(e.target.value)}
                placeholder="数量"
                inputMode="numeric"
                className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
              />
              <button
                onClick={handleProcessNext}
                disabled={action === "process"}
                className="inline-flex items-center gap-2 px-4 rounded-lg border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 font-bold text-sm"
              >
                <Send size={14} /> 处理
              </button>
            </div>
            <p className="text-slate-500 text-xs">任何地址都可以触发处理；能否支付取决于奖励池余额。</p>
          </div>
        </div>

        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-3">最近队列</h3>
          {entries.length === 0 ? (
            <div className="bg-[#13102B]/50 rounded-xl p-4 text-slate-500 text-sm">暂无队列记录</div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {entries.map((row) => (
                <div
                  key={row.index}
                  className={`grid grid-cols-[auto_1fr_auto] gap-3 items-center rounded-xl border p-3 ${
                    row.paid ? "bg-emerald-500/5 border-emerald-500/20" : "bg-[#13102B]/60 border-indigo-500/10"
                  }`}
                >
                  <span className="text-slate-500 text-xs">#{row.index}</span>
                  <div>
                    <p className="text-slate-200 text-sm font-mono">{shortAddr(row.account)}</p>
                    <p className="text-slate-500 text-xs">
                      销毁 {formatKnt(row.burnedAmount)} KNT / 出局 {formatKnt(row.rewardAmount)} KNT
                    </p>
                  </div>
                  <span className={`text-xs font-bold ${row.paid ? "text-emerald-300" : "text-amber-300"}`}>
                    {row.paid ? "已出局" : "排队中"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {userRows.length > 0 && (
            <p className="text-slate-500 text-xs mt-3">当前地址最近记录：{userRows.length} 条</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BurnQueuePanel;
