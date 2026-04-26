import { ethers } from "ethers";
import { AlertCircle, Check, Clipboard, Loader } from "lucide-react";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useLanguage } from "../src/LanguageContext";
import { useWeb3 } from "../src/Web3Context";

interface ForcedReferrerBindingProps {
  isOpen: boolean;
  onClose: () => void;
}

const ForcedReferrerBinding: React.FC<ForcedReferrerBindingProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();
  const { protocolContract, account, doRegister, isRegistering } = useWeb3();
  const [manualAddress, setManualAddress] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [bindSuccess, setBindSuccess] = useState(false);

  // 预填 URL 推荐人或 localStorage 中缓存推荐人（兼容 TP hash 路由）
  useEffect(() => {
    if (!isOpen) return;

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
    const hash = window.location.hash || "";
    const queryIdx = hash.indexOf("?");
    const fromHash = queryIdx >= 0 ? pickFrom(new URLSearchParams(hash.slice(queryIdx + 1))) : "";
    const pendingRef = localStorage.getItem("pendingReferrer") || "";

    const prefill = fromSearch || fromHash || pendingRef;
    if (prefill && ethers.isAddress(prefill)) {
      setManualAddress(ethers.getAddress(prefill));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (trimmed) {
        setManualAddress(trimmed);
        setValidationError(null);
      }
    } catch {
      toast.error("无法读取剪贴板，请手动粘贴");
    }
  };

  const handleBind = async (useDefault: boolean) => {
    setIsValidating(true);
    setValidationError(null);

    try {
      if (useDefault) {
        // 默认推荐人交由 Web3Context 处理（优先 ROOT_REFERRER_ADDRESS，其次 owner）
        localStorage.removeItem("pendingReferrer");
        localStorage.setItem("allowDefaultReferrer", "1");
      } else {
        // 手动输入
        const trimmed = manualAddress.trim();
        if (!trimmed) {
          setValidationError("请输入推荐人地址");
          setIsValidating(false);
          return;
        }
        if (!ethers.isAddress(trimmed)) {
          setValidationError("请输入有效的以太坊地址（0x开头，42位）");
          setIsValidating(false);
          return;
        }
        if (trimmed.toLowerCase() === account?.toLowerCase()) {
          setValidationError("推荐人不能是您自己");
          setIsValidating(false);
          return;
        }
        // 手动推荐人必须先校验注册状态
        if (protocolContract) {
          const refInfo = await protocolContract.getUserInfo(trimmed);
          if (!refInfo[0]) {
            setValidationError("该推荐人尚未注册，请检查地址或选择其他推荐人");
            setIsValidating(false);
            return;
          }
        }

        localStorage.setItem("pendingReferrer", trimmed);
        localStorage.removeItem("allowDefaultReferrer");
      }

      await doRegister?.();

      // 注册后验证是否成功
      if (protocolContract && account) {
        const info = await protocolContract.getUserInfo(account);
        if (info[0]) {
          setBindSuccess(true);
          toast.success("绑定成功！");
          setTimeout(() => {
            setManualAddress("");
            setValidationError(null);
            onClose();
          }, 800);
          return;
        }
      }

      // 如果没能确认成功，可能 doRegister 内部报错了
      setValidationError("绑定未完成，请重试");
    } catch (err: any) {
      const reason = err?.reason || err?.shortMessage || err?.message || "";
      setValidationError(reason || "绑定失败，请重试");
    } finally {
      setIsValidating(false);
    }
  };

  const isBusy = isValidating || isRegistering;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-md mx-4 bg-[#1A1532] border border-indigo-500/30 rounded-2xl shadow-2xl p-6 md:p-8 z-10 max-h-[90vh] overflow-y-auto">
        {/* 标题 */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/30">
              <AlertCircle size={20} className="text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-white">绑定推荐人</h2>
          </div>
          <p className="text-slate-400 text-sm">
            首次使用需绑定推荐人，绑定后不可更改
          </p>
        </div>

        <div className="space-y-4">
          {/* 推荐人地址输入 */}
          <div className="space-y-2">
            <label className="text-slate-300 font-medium text-sm">推荐人地址</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualAddress}
                onChange={(e) => {
                  setManualAddress(e.target.value);
                  setValidationError(null);
                }}
                placeholder="0x..."
                className="flex-1 min-w-0 px-3 py-3 bg-[#2E2A56] border border-indigo-300/35 rounded-lg text-slate-100 placeholder-slate-300 focus:outline-none focus:border-indigo-200 transition-colors font-mono text-sm"
                disabled={isBusy || bindSuccess}
              />
              <button
                onClick={handlePaste}
                disabled={isBusy || bindSuccess}
                className="px-3 py-3 bg-[#2E2A56] border border-indigo-300/35 rounded-lg text-slate-200 hover:text-white hover:border-indigo-200 transition-colors flex-shrink-0 disabled:opacity-40"
                title="粘贴"
              >
                <Clipboard size={18} />
              </button>
            </div>
          </div>

          {/* 错误提示 */}
          {validationError && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
              <p className="text-rose-300 text-sm">{validationError}</p>
            </div>
          )}

          {/* 成功提示 */}
          {bindSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-center gap-2">
              <Check size={16} className="text-emerald-400" />
              <p className="text-emerald-300 text-sm">推荐人绑定成功！</p>
            </div>
          )}

          {/* 手动绑定按钮 */}
          <button
            onClick={() => handleBind(false)}
            disabled={!manualAddress.trim() || isBusy || bindSuccess}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-400 hover:to-cyan-500 disabled:from-slate-600 disabled:to-slate-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all transform active:scale-95 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
          >
            {isBusy && manualAddress.trim() && !bindSuccess ? (
              <><Loader size={18} className="animate-spin" /> 绑定中...</>
            ) : (
              <><Check size={18} /> 确认绑定</>
            )}
          </button>

          {/* 分隔线 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-slate-700" />
            <span className="text-slate-500 text-xs">或</span>
            <div className="flex-1 border-t border-slate-700" />
          </div>

          {/* 默认推荐人按钮 */}
          <button
            onClick={() => handleBind(true)}
            disabled={isBusy || bindSuccess}
            className="w-full py-3 bg-[#231D42] border border-violet-500/30 hover:border-violet-500/50 hover:bg-violet-500/10 disabled:opacity-40 text-violet-300 font-bold rounded-xl transition-all transform active:scale-95 flex items-center justify-center gap-2"
          >
            {isBusy && !manualAddress.trim() && !bindSuccess ? (
              <><Loader size={18} className="animate-spin" /> 绑定中...</>
            ) : (
              "使用系统默认推荐人"
            )}
          </button>

          {/* 提示 */}
          <p className="text-slate-500 text-xs text-center">
            如果您通过邀请链接进入，推荐人地址已自动填入
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForcedReferrerBinding;
