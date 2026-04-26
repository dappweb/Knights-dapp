import { ethers } from "ethers";
import { AlertTriangle, ArrowLeftRight, Coins, TrendingUp, Wallet } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useWeb3 } from "../src/Web3Context";
import { SwapPoolManagerABI } from "../src/abi/SwapPoolManager";
import { CHAIN_ID, CHAIN_NAME, SEER_INITIAL_PRICE } from "../src/constants";
import { formatContractError } from "../utils/errorFormatter";

type SwapDirection = "USDT_TO_SEER" | "SEER_TO_USDT";

const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
] as const;

const TARGET_CHAIN_ID = BigInt(CHAIN_ID);

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

const isValidAmountInput = (value: string, decimals: number): boolean => {
  if (value === "") return true;
  if (!/^\d*\.?\d*$/.test(value)) return false;
  const [, frac = ""] = value.split(".");
  return frac.length <= decimals;
};

const formatSwapError = (error: any): string => {
  const fallback = formatContractError(error);
  const message = `${error?.shortMessage || ""} ${error?.reason || ""} ${error?.message || ""}`.toLowerCase();

  if (message.includes("insufficient_output_amount")) {
    return "滑点不足导致失败，请减少兑换数量或稍后重试";
  }
  if (message.includes("transfer_from_failed") || message.includes("safeerc20") || message.includes("transfer amount exceeds balance")) {
    return "代币余额或授权不足，请检查余额并重新授权";
  }
  if (message.includes("expired") || message.includes("deadline")) {
    return "交易超时，请重新发起";
  }
  if (message.includes("insufficient liquidity") || message.includes("invalid path") || message.includes("pair")) {
    return "交易对流动性不足或路由配置错误";
  }
  if (message.includes("execution reverted") || message.includes("call_exception") || message.includes("missing revert data")) {
    return "合约执行失败，常见原因：滑点不足、流动性不足、网络不匹配";
  }

  return fallback || "Swap 失败，请稍后重试";
};

const SwapPanel: React.FC = () => {
  const {
    isConnected,
    connectWallet,
    signer,
    provider,
    account,
    usdtContract,
    seerContract,
    usdtBalance,
    seerBalance,
    refreshBalances,
    contractAddresses: CONTRACT_ADDRESSES,
  } = useWeb3();

  const dexRouterAddress = CONTRACT_ADDRESSES.DEX_ROUTER;
  const swapManagerAddress = CONTRACT_ADDRESSES.SWAP_POOL_MANAGER;

  const [direction, setDirection] = useState<SwapDirection>("USDT_TO_SEER");
  const [amountIn, setAmountIn] = useState("");
  const [seerPrice, setSeerPrice] = useState(SEER_INITIAL_PRICE);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [slippagePercent] = useState(1);
  const [tokenDecimals, setTokenDecimals] = useState({ usdt: 18, knights: 18 });
  const [taxBP, setTaxBP] = useState({ buy: 200n, sell: 200n });

  const inputDecimals = direction === "USDT_TO_SEER" ? tokenDecimals.usdt : tokenDecimals.knights;
  const outputDecimals = direction === "USDT_TO_SEER" ? tokenDecimals.knights : tokenDecimals.usdt;

  useEffect(() => {
    let cancelled = false;

    const loadDecimals = async () => {
      try {
        const [usdtDecimalsRaw, seerDecimalsRaw] = await Promise.all([
          usdtContract?.decimals?.() ?? 18,
          seerContract?.decimals?.() ?? 18,
        ]);
        if (cancelled) return;

        const usdtDecimals = Number(usdtDecimalsRaw);
        const seerDecimals = Number(seerDecimalsRaw);

        setTokenDecimals({
          usdt: Number.isFinite(usdtDecimals) ? usdtDecimals : 18,
          knights: Number.isFinite(seerDecimals) ? seerDecimals : 18,
        });
      } catch {
        if (!cancelled) {
          setTokenDecimals({ usdt: 18, knights: 18 });
        }
      }
    };

    loadDecimals();
    return () => {
      cancelled = true;
    };
  }, [usdtContract, seerContract]);

  const getRouter = useCallback(() => {
    if (!provider || !dexRouterAddress) return null;
    return new ethers.Contract(dexRouterAddress, ROUTER_ABI, provider);
  }, [provider, dexRouterAddress]);

  const getManager = useCallback(() => {
    if (!provider || !swapManagerAddress) return null;
    return new ethers.Contract(swapManagerAddress, SwapPoolManagerABI, provider);
  }, [provider, swapManagerAddress]);

  const fetchPrice = useCallback(async () => {
    const router = getRouter();
    if (!router || !CONTRACT_ADDRESSES.SEER_TOKEN || !CONTRACT_ADDRESSES.USDT) return;

    setLoadingPrice(true);
    try {
      const oneSeer = ethers.parseEther("1");
      const amountsOut = await router.getAmountsOut(oneSeer, [
        CONTRACT_ADDRESSES.SEER_TOKEN,
        CONTRACT_ADDRESSES.USDT,
      ]);
      setSeerPrice(Number(ethers.formatUnits(amountsOut[1], tokenDecimals.usdt)));

      // 从 Manager 读取动态税率
      const manager = getManager();
      if (manager) {
        try {
          const [buy, sell] = await Promise.all([manager.buyTaxBP(), manager.sellTaxBP()]);
          setTaxBP({ buy, sell });
        } catch {}
      }
    } catch (err) {
      console.error("Failed to fetch pool price:", err);
    } finally {
      setLoadingPrice(false);
    }
  }, [getRouter, getManager, tokenDecimals.usdt]);

  useEffect(() => {
    fetchPrice();
  }, [fetchPrice]);

  const [quotedAmountOutRaw, setQuotedAmountOutRaw] = useState<bigint>(0n);
  const amountInParsed = useMemo(() => {
    if (!amountIn) return 0n;
    try {
      return ethers.parseUnits(amountIn, inputDecimals);
    } catch {
      return null;
    }
  }, [amountIn, inputDecimals]);

  const fetchQuote = useCallback(async () => {
    const manager = getManager();
    if (!manager || !amountInParsed || amountInParsed <= 0n) {
      setQuotedAmountOutRaw(0n);
      return;
    }

    try {
      setLoadingQuote(true);

      if (direction === "SEER_TO_USDT") {
        const result = await manager.quoteSEERForUSDT(amountInParsed);
        setQuotedAmountOutRaw(result.amountOut);
      } else {
        const result = await manager.quoteUSDTForSEER(amountInParsed);
        setQuotedAmountOutRaw(result.amountOut);
      }
    } catch {
      setQuotedAmountOutRaw(0n);
    } finally {
      setLoadingQuote(false);
    }
  }, [amountInParsed, direction, getManager]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  // Manager 报价已扣税, 直接使用
  const amountOutRaw = quotedAmountOutRaw;

  const handleSwap = async () => {
    if (!isConnected) {
      connectWallet();
      return;
    }

    if (!signer || !provider || !account || !usdtContract || !seerContract) {
      toast.error("钱包或合约未就绪");
      return;
    }

    if (!amountInParsed || amountInParsed <= 0n) {
      toast.error("请输入有效数量");
      return;
    }

    if (!CONTRACT_ADDRESSES.USDT || !CONTRACT_ADDRESSES.SEER_TOKEN) {
      toast.error("合约地址未配置");
      return;
    }

    setSwapping(true);
    try {
      const network = await provider.getNetwork();
      if (network.chainId !== TARGET_CHAIN_ID) {
        toast.error(`请切换到 ${CHAIN_NAME} 网络后再进行 Swap`, { id: "swap" });
        return;
      }

      if (!swapManagerAddress) {
        toast.error("SwapPoolManager 地址未配置", { id: "swap" });
        return;
      }

      const managerCode = await provider.getCode(swapManagerAddress);
      if (!managerCode || managerCode === "0x") {
        toast.error("SwapPoolManager 合约未部署或地址配置错误", { id: "swap" });
        return;
      }

      const signerAddress = (await signer.getAddress()).toLowerCase();
      const connectedAccount = account.toLowerCase();

      if (signerAddress !== connectedAccount) {
        console.warn("[Swap] account/signer mismatch", { connectedAccount, signerAddress });
      }

      const managerWithSigner = new ethers.Contract(swapManagerAddress, SwapPoolManagerABI, signer);
      const inputContract = direction === "USDT_TO_SEER" ? usdtContract : seerContract;
      const outputContract = direction === "USDT_TO_SEER" ? seerContract : usdtContract;

      const inputBalanceRaw = direction === "USDT_TO_SEER"
        ? (usdtBalance ?? 0n)
        : (seerBalance ?? 0n);

      if (inputBalanceRaw < amountInParsed) {
        toast.error(`${inputSymbol} 余额不足`, { id: "swap" });
        return;
      }

      // 授权给 Manager (而非 Router)
      const allowance = await inputContract.allowance(signerAddress, swapManagerAddress);
      if (allowance < amountInParsed) {
        toast.loading("正在授权代币...", { id: "swap" });
        const approveTx = await inputContract.approve(swapManagerAddress, ethers.MaxUint256);
        await approveTx.wait();
      }

      const outputBalanceBefore = await outputContract.balanceOf(signerAddress);

      // Manager 报价已含税, 直接用 amountOutRaw 作为基准
      if (amountOutRaw <= 0n) {
        toast.error("报价为 0，当前不支持该兑换规模", { id: "swap" });
        return;
      }
      const slippageBps = BigInt(Math.floor(slippagePercent * 100));
      const amountOutMin = (amountOutRaw * (10000n - slippageBps)) / 10000n;

      toast.loading("正在发送 Swap 交易...", { id: "swap" });

      let tx;
      if (direction === "SEER_TO_USDT") {
        tx = await managerWithSigner.swapSEERForUSDT(amountInParsed, amountOutMin, signerAddress);
      } else {
        tx = await managerWithSigner.swapUSDTForSEER(amountInParsed, amountOutMin, signerAddress);
      }
      await tx.wait();

      const outputBalanceAfter = await outputContract.balanceOf(signerAddress);
      const receivedAmount = outputBalanceAfter - outputBalanceBefore;

      if (receivedAmount > 0n) {
        toast.success(
          `Swap 成功，实际到账 ${formatDecimalString(ethers.formatUnits(receivedAmount, outputDecimals), 6)} ${outputSymbol}`,
          { id: "swap" }
        );
      } else {
        toast.success("Swap 已上链，但未检测到当前地址余额增加，请核对钱包地址与代币合约", { id: "swap" });
      }
      setAmountIn("");
      await refreshBalances();
      await fetchPrice();
    } catch (err: any) {
      const msg = formatSwapError(err);
      toast.error(msg, { id: "swap" });
    } finally {
      setSwapping(false);
    }
  };

  const inputSymbol = direction === "USDT_TO_SEER" ? "USDT" : "KNIGHTS";
  const outputSymbol = direction === "USDT_TO_SEER" ? "KNIGHTS" : "USDT";

  // null means balance not yet loaded (wallet just connected)
  const inputBalanceRawForDisplay = direction === "USDT_TO_SEER" ? usdtBalance : seerBalance;
  const inputBalanceLoading = isConnected && inputBalanceRawForDisplay === null;
  const inputBalanceFormatted = inputBalanceRawForDisplay != null
    ? ethers.formatUnits(inputBalanceRawForDisplay, inputDecimals)
    : "0";
  const displayAmountOut = formatDecimalString(ethers.formatUnits(amountOutRaw, outputDecimals), 6);
  const insufficientBalance =
    isConnected &&
    !inputBalanceLoading &&
    amountInParsed !== null &&
    amountInParsed > 0n &&
    amountInParsed > (inputBalanceRawForDisplay ?? 0n);

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-gradient-to-r from-indigo-900/40 to-violet-900/40 border border-indigo-500/15 rounded-2xl p-6 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ArrowLeftRight size={22} className="text-violet-400" /> KNIGHTS / USDT 兑换
        </h2>
        <p className="text-slate-400 text-sm mt-1">站内链上兑换（SwapPoolManager）</p>
        {!isConnected && (
          <p className="text-amber-400 text-sm mt-3 flex items-center gap-1">
            <Wallet size={14} /> 连接钱包后可查看余额并填写兑换数量
          </p>
        )}
      </div>

      <div className="bg-[#1A1532]/80 border border-indigo-500/15 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-slate-400 text-xs">当前池子参考价</p>
          <p className="text-white text-sm font-bold">
            1 KNIGHTS = {seerPrice.toFixed(6)} USDT
            {loadingPrice && <span className="text-slate-500 ml-2">(刷新中)</span>}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDirection("USDT_TO_SEER")}
            className={`rounded-lg py-2 text-sm font-bold transition-colors ${
              direction === "USDT_TO_SEER"
                ? "bg-indigo-500/20 text-violet-300 border border-indigo-400/30"
                : "bg-[#13102B] text-slate-400 border border-indigo-500/10"
            }`}
          >
            USDT → KNIGHTS
          </button>
          <button
            onClick={() => setDirection("SEER_TO_USDT")}
            className={`rounded-lg py-2 text-sm font-bold transition-colors ${
              direction === "SEER_TO_USDT"
                ? "bg-indigo-500/20 text-violet-300 border border-indigo-400/30"
                : "bg-[#13102B] text-slate-400 border border-indigo-500/10"
            }`}
          >
            KNIGHTS → USDT
          </button>
        </div>

        <div className="bg-[#13102B]/70 border border-indigo-500/10 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs">输入数量 ({inputSymbol})</span>
            <span className={`text-xs ${insufficientBalance ? "text-red-400" : "text-slate-500"}`}>
              余额: {inputBalanceLoading ? "加载中..." : formatDecimalString(inputBalanceFormatted, 4)}
            </span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            min="0"
            step="any"
            value={amountIn}
            onChange={(e) => {
              const nextValue = e.target.value.trim();
              if (isValidAmountInput(nextValue, inputDecimals)) {
                setAmountIn(nextValue);
              }
            }}
            placeholder={`输入 ${inputSymbol} 数量`}
            className="w-full bg-[#0F0B1E]/80 border border-indigo-500/15 rounded-lg px-3 py-2 text-white text-sm"
          />
          <div className="pt-1 border-t border-indigo-500/10">
            <p className="text-slate-400 text-xs mb-1">预计获得 ({outputSymbol}，已扣 {Number(direction === "USDT_TO_SEER" ? taxBP.buy : taxBP.sell) / 100}% 税)</p>
            <p className="text-amber-400 text-xl font-bold">
              {loadingQuote ? "报价中..." : displayAmountOut}
            </p>
          </div>
        </div>

        <div className="bg-amber-400/20 border border-amber-400/40 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-amber-950 dark:text-amber-100 text-sm font-bold leading-relaxed">
            交易税: 买入 {Number(taxBP.buy) / 100}% / 卖出 {Number(taxBP.sell) / 100}%（通过 SwapPoolManager 收取）。预计获得数量已扣除税费。当前滑点保护为 {slippagePercent}%。
          </p>
        </div>

        {insufficientBalance && (
          <p className="text-red-400 text-sm font-bold text-center">{inputSymbol} 余额不足，无法发起兑换</p>
        )}

        <button
          onClick={handleSwap}
          disabled={swapping || loadingQuote || !amountInParsed || amountInParsed <= 0n || insufficientBalance || inputBalanceLoading}
          className="w-full inline-flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all"
        >
          {swapping ? "交易进行中..." : inputBalanceLoading ? "余额加载中..." : "立即 Swap"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1A1532]/70 border border-indigo-500/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Coins size={14} className="text-emerald-400" />
            <span className="text-slate-400 text-xs">KNIGHTS 合约</span>
          </div>
          <p className="text-slate-300 text-xs font-mono break-all">{CONTRACT_ADDRESSES.SEER_TOKEN || "未配置"}</p>
        </div>
        <div className="bg-[#1A1532]/70 border border-indigo-500/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-violet-400" />
            <span className="text-slate-400 text-xs">USDT 合约</span>
          </div>
          <p className="text-slate-300 text-xs font-mono break-all">{CONTRACT_ADDRESSES.USDT || "未配置"}</p>
        </div>
        <div className="bg-[#1A1532]/70 border border-indigo-500/10 rounded-xl p-4 col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-indigo-400" />
            <span className="text-slate-400 text-xs">SwapPoolManager / DEX</span>
          </div>
          <p className="text-slate-300 text-xs font-mono break-all">Manager: {swapManagerAddress || "未配置"}</p>
          <p className="text-slate-300 text-xs font-mono break-all mt-1">Router: {dexRouterAddress || "未配置"}</p>
          <p className="text-slate-300 text-xs font-mono break-all mt-1">Pair: {CONTRACT_ADDRESSES.DEX_PAIR || "未配置"}</p>
        </div>
      </div>
    </div>
  );
};

export default SwapPanel;
