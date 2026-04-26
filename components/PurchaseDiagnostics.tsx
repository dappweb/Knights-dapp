import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { checkPurchaseEligibility, extractDiagnosticInfo } from '../src/purchaseCheckHelper';
import { useWeb3 } from '../src/Web3Context';

/**
 * 璐拱澶辫触璇婃柇缁勪欢
 * 鍦ㄨ喘涔板墠鑷姩妫€鏌ユ墍鏈夊彲鑳藉け璐ョ殑鍘熷洜
 */
export const PurchaseDiagnostics: React.FC<{ visible: boolean; minerTier?: number }> = ({ 
  visible, 
  minerTier = 0 
}) => {
  const { address } = useAccount();
  const { protocolContract, usdtContract, usdtDecimals } = useWeb3();
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && address && protocolContract && usdtContract) {
      runDiagnostics();
    }
  }, [visible, address, minerTier]);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const result = await checkPurchaseEligibility(
        address!,
        minerTier,
        protocolContract,
        usdtContract,
        usdtDecimals
      );
      const info = extractDiagnosticInfo(result);
      setDiagnostics(info);
    } catch (error) {
      console.error('Diagnostics error:', error);
      setDiagnostics({ 
        status: 'error', 
        issues: ['璇婃柇杩囩▼鍑洪敊锛岃閲嶈瘯'] 
      });
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !address) return null;

  const MINER_TIERS = ['Basic', 'V1', 'V2', 'V3'];
  const tierName = MINER_TIERS[minerTier] || 'Unknown';

  return (
    <div className={`mt-4 p-4 rounded-lg border ${
      diagnostics?.status === 'success' ? 'bg-green-950 border-green-700' :
      diagnostics?.status === 'warning' ? 'bg-yellow-950 border-yellow-700' :
      'bg-red-950 border-red-700'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">
          {diagnostics?.status === 'success' ? '鉁? : 
           diagnostics?.status === 'warning' ? '鈿狅笍' : '鉂?}
        </span>
        <h3 className="text-sm font-semibold text-slate-200">
          璐拱鍓嶆鏌?({tierName} 鐭挎満)
        </h3>
      </div>

      {loading && (
        <div className="text-sm text-slate-400 animate-pulse">妫€鏌ヤ腑...</div>
      )}

      {!loading && diagnostics && (
        <>
          {/* 涓ラ噸闂 */}
          {diagnostics.issues && diagnostics.issues.length > 0 && (
            <div className="space-y-2 mb-3">
              {diagnostics.issues.map((issue: string, idx: number) => (
                <div key={idx} className="text-sm text-red-200 flex items-start gap-2">
                  <span className="flex-shrink-0">鈥?/span>
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          )}

          {/* 璀﹀憡 */}
          {diagnostics.warnings && diagnostics.warnings.length > 0 && (
            <div className="space-y-2 mb-3">
              {diagnostics.warnings.map((warn: string, idx: number) => (
                <div key={idx} className="text-sm text-yellow-200 flex items-start gap-2">
                  <span className="flex-shrink-0">鈥?/span>
                  <span>{warn}</span>
                </div>
              ))}
            </div>
          )}

          {/* 璇︽儏淇℃伅 */}
          <div className="mt-3 text-xs text-slate-300 space-y-1 border-t border-slate-700 pt-3">
            <div className="flex justify-between">
              <span>娉ㄥ唽鐘舵€?</span>
              <span>{diagnostics.registered ? '鉁?宸叉敞鍐? : '鉂?鏈敞鍐?}</span>
            </div>
            <div className="flex justify-between">
              <span>鍗忚鐘舵€?</span>
              <span>{diagnostics.paused ? '鈿狅笍 宸叉殏鍋? : '鉁?姝ｅ父'}</span>
            </div>
            <div className="flex justify-between">
              <span>閿€鍞樁娈?</span>
              <span>{diagnostics.salePhase}</span>
            </div>
            {diagnostics.usdtBalance && (
              <div className="flex justify-between">
                <span>USDT浣欓:</span>
                <span>{diagnostics.usdtBalance}</span>
              </div>
            )}
          </div>
        </>
      )}

      <button
        onClick={runDiagnostics}
        disabled={loading}
        className="mt-3 w-full px-3 py-2 text-xs bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded text-slate-100 font-medium transition"
      >
        {loading ? '璇婃柇涓?..' : '閲嶆柊璇婃柇'}
      </button>
    </div>
  );
};

export default PurchaseDiagnostics;
