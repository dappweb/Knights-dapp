import { ethers } from "ethers";
import { AlertTriangle, Badge, Gift, RefreshCw, Ticket } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useWeb3 } from "../src/Web3Context";

const formatKnt = (value: bigint, digits = 4) =>
  Number(ethers.formatEther(value)).toLocaleString("en-US", { maximumFractionDigits: digits });

const MigrationNftPanel: React.FC = () => {
  const {
    account,
    isConnected,
    isOwner,
    connectWallet,
    migrationNftContract,
    contractAddresses,
    refreshBalances,
  } = useWeb3();

  const [tokenId, setTokenId] = useState("");
  const [owner, setOwner] = useState("");
  const [originalAmount, setOriginalAmount] = useState<bigint>(0n);
  const [claimedAmount, setClaimedAmount] = useState<bigint>(0n);
  const [claimableAmount, setClaimableAmount] = useState<bigint>(0n);
  const [lastClaimDay, setLastClaimDay] = useState<bigint>(0n);
  const [nftBalance, setNftBalance] = useState<bigint>(0n);
  const [currentDay, setCurrentDay] = useState<bigint>(0n);
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<string | null>(null);

  const loadAccountData = useCallback(async () => {
    if (!migrationNftContract) return;
    try {
      const [day, balance] = await Promise.all([
        migrationNftContract.currentDay().catch(() => 0n),
        account ? migrationNftContract.balanceOf(account).catch(() => 0n) : Promise.resolve(0n),
      ]);
      setCurrentDay(day);
      setNftBalance(balance);
    } catch (err) {
      console.error("[MigrationNFT] account load failed", err);
    }
  }, [account, migrationNftContract]);

  const loadToken = useCallback(async () => {
    if (!migrationNftContract || !tokenId.trim()) return;
    setLoading(true);
    try {
      const id = BigInt(tokenId.trim());
      const [tokenOwner, position, claimable] = await Promise.all([
        migrationNftContract.ownerOf(id),
        migrationNftContract.positions(id),
        migrationNftContract.claimable(id).catch(() => 0n),
      ]);
      setOwner(tokenOwner);
      setOriginalAmount(BigInt(position.originalAmount ?? position[0] ?? 0n));
      setClaimedAmount(BigInt(position.claimedAmount ?? position[1] ?? 0n));
      setLastClaimDay(BigInt(position.lastClaimDay ?? position[2] ?? 0n));
      setClaimableAmount(claimable);
    } catch (err: any) {
      setOwner("");
      setOriginalAmount(0n);
      setClaimedAmount(0n);
      setLastClaimDay(0n);
      setClaimableAmount(0n);
      toast.error(err?.reason || err?.shortMessage || "读取 NFT 失败");
    } finally {
      setLoading(false);
    }
  }, [migrationNftContract, tokenId]);

  useEffect(() => {
    loadAccountData();
  }, [loadAccountData]);

  const requireReady = () => {
    if (!isConnected) {
      connectWallet();
      return false;
    }
    if (!account || !migrationNftContract) {
      toast.error("钱包或迁移 NFT 合约未就绪");
      return false;
    }
    return true;
  };

  const handleClaim = async () => {
    if (!requireReady() || !tokenId.trim()) return;
    try {
      setAction("claim");
      toast.loading("领取平移释放 KNT...", { id: "migration-claim" });
      const tx = await migrationNftContract!.claim(BigInt(tokenId.trim()));
      await tx.wait();
      toast.success("领取成功", { id: "migration-claim" });
      await loadToken();
      await loadAccountData();
      await refreshBalances();
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || err?.message || "领取失败", { id: "migration-claim" });
    } finally {
      setAction(null);
    }
  };

  const handleMint = async () => {
    if (!requireReady()) return;
    if (!isOwner) {
      toast.error("只有合约 owner 可以铸造迁移 NFT");
      return;
    }
    try {
      if (!ethers.isAddress(mintTo.trim())) {
        toast.error("请输入有效的钱包地址");
        return;
      }
      const amount = ethers.parseEther(mintAmount || "0");
      if (amount <= 0n) {
        toast.error("请输入有效的 KNT 数量");
        return;
      }

      setAction("mint");
      toast.loading("铸造迁移 NFT...", { id: "migration-mint" });
      const tx = await migrationNftContract!.mintMigration(ethers.getAddress(mintTo.trim()), amount);
      await tx.wait();
      toast.success("迁移 NFT 已铸造", { id: "migration-mint" });
      setMintTo("");
      setMintAmount("");
      await loadAccountData();
    } catch (err: any) {
      toast.error(err?.reason || err?.shortMessage || err?.message || "铸造失败", { id: "migration-mint" });
    } finally {
      setAction(null);
    }
  };

  if (!contractAddresses.MIGRATION_NFT) {
    return (
      <div className="max-w-4xl mx-auto bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-400" /> 平移 NFT 未配置
        </h2>
        <p className="text-slate-300 text-sm mt-2">
          需要配置 `VITE_KNT_MIGRATION_NFT_ADDRESS` 后，前端才能接入旧现货平移 NFT 的查询和领取。
        </p>
      </div>
    );
  }

  const isTokenOwner = account && owner && owner.toLowerCase() === account.toLowerCase();

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="bg-gradient-to-r from-sky-950/50 to-indigo-950/40 border border-sky-500/20 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Ticket size={22} className="text-sky-400" /> 旧币平移 NFT
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              对齐 XMind：旧现货用 NFT 表示额度，每日 0.1% 释放；直推新增 LP 达标后每日 0.3%。
            </p>
          </div>
          <button
            onClick={loadAccountData}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/25 px-4 py-2 text-sm font-bold text-sky-200 hover:bg-sky-500/10"
          >
            <RefreshCw size={16} /> 刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4">
          <p className="text-slate-400 text-xs">当前自然日</p>
          <p className="text-white text-2xl font-black mt-1">{currentDay.toString()}</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4">
          <p className="text-slate-400 text-xs">我的 NFT 数</p>
          <p className="text-white text-2xl font-black mt-1">{nftBalance.toString()}</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4">
          <p className="text-slate-400 text-xs">基础释放</p>
          <p className="text-emerald-300 text-2xl font-black mt-1">0.1%</p>
        </div>
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-xl p-4">
          <p className="text-slate-400 text-xs">加速释放</p>
          <p className="text-sky-300 text-2xl font-black mt-1">0.3%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-4">
        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Badge size={18} className="text-sky-400" /> 查询和领取
          </h3>
          <div className="flex gap-2">
            <input
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              placeholder="NFT Token ID"
              inputMode="numeric"
              className="flex-1 bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
            />
            <button
              onClick={loadToken}
              disabled={loading}
              className="px-4 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:bg-slate-700 text-white font-bold text-sm"
            >
              查询
            </button>
          </div>

          <div className="bg-[#13102B]/70 border border-indigo-500/10 rounded-xl p-4 space-y-2">
            <p className="text-slate-400 text-xs">持有人</p>
            <p className="text-slate-200 text-sm font-mono break-all">{owner || "-"}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div>
                <p className="text-slate-500 text-xs">原始额度</p>
                <p className="text-white font-bold">{formatKnt(originalAmount)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">已领取</p>
                <p className="text-white font-bold">{formatKnt(claimedAmount)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">可领取</p>
                <p className="text-emerald-300 font-bold">{formatKnt(claimableAmount)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">上次领取日</p>
                <p className="text-white font-bold">{lastClaimDay.toString()}</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleClaim}
            disabled={!isTokenOwner || claimableAmount <= 0n || action === "claim"}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl"
          >
            {isTokenOwner ? "领取可释放 KNT" : "仅 NFT 持有人可领取"}
          </button>
        </div>

        <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Gift size={18} className="text-indigo-400" /> 管理员平移录入
          </h3>
          <p className="text-slate-500 text-xs">
            用于把旧现货额度铸造成 NFT。批量导入 1914 个老 LP 仍建议通过脚本执行。
          </p>
          <input
            value={mintTo}
            onChange={(e) => setMintTo(e.target.value)}
            placeholder="用户钱包地址"
            className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm font-mono"
          />
          <input
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            placeholder="平移 KNT 数量"
            inputMode="decimal"
            className="w-full bg-[#13102B] border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          <button
            onClick={handleMint}
            disabled={!isOwner || action === "mint"}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl"
          >
            {isOwner ? "铸造迁移 NFT" : "仅 Owner 可铸造"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MigrationNftPanel;
