/**
 * 璐拱鍓嶇姸鎬佹鏌ュ伐鍏?
 * 妫€鏌ユ墍鏈夊彲鑳藉鑷磋喘涔板け璐ョ殑鍥犵礌
 */

import { ethers } from 'ethers';

interface PurchaseCheckResult {
  canPurchase: boolean;
  issues: string[];
  warnings: string[];
  details: Record<string, any>;
}

export async function checkPurchaseEligibility(
  userAddress: string,
  minerTier: number,
  protocolContract: any,
  usdtContract: any,
  usdtDecimals: number = 6
): Promise<PurchaseCheckResult> {
  const result: PurchaseCheckResult = {
    canPurchase: true,
    issues: [],
    warnings: [],
    details: {},
  };

  try {
    const MINER_COSTS = [100n, 1000n, 3000n, 10000n];
    const requiredCostWei = MINER_COSTS[minerTier] * (10n ** BigInt(usdtDecimals));

    // 1. 妫€鏌ョ敤鎴锋槸鍚﹀凡娉ㄥ唽
    const userInfo = await protocolContract.users(userAddress);
    result.details.registered = userInfo.registered;
    if (!userInfo.registered) {
      result.issues.push('鐢ㄦ埛鏈敞鍐岋紝璇峰厛瀹屾垚鎺ㄨ崘浜虹粦瀹?);
      result.canPurchase = false;
    }

    // 2. 妫€鏌ュ崗璁姸鎬?
    const paused = await protocolContract.paused();
    result.details.paused = paused;
    if (paused) {
      result.issues.push('鍗忚宸叉殏鍋滐紝鏃犳硶杩涜璐拱');
      result.canPurchase = false;
    }

    // 3. 妫€鏌ラ攢鍞樁娈靛拰寮€鍏?
    const salePhase = await protocolContract.salePhase();
    const nodeSaleOpen = await protocolContract.nodeSaleOpen();
    const minerSaleOpen = await protocolContract.minerSaleOpen();

    result.details.salePhase = salePhase === 0n ? 'NODE_PHASE' : 'MINER_PHASE';
    result.details.nodeSaleOpen = nodeSaleOpen;
    result.details.minerSaleOpen = minerSaleOpen;

    if (salePhase === 0n && !nodeSaleOpen) {
      result.issues.push('鑺傜偣閿€鍞凡鍏抽棴');
      result.canPurchase = false;
    } else if (salePhase === 1n && !minerSaleOpen) {
      result.issues.push('鐭挎満閿€鍞凡鍏抽棴');
      result.canPurchase = false;
    }

    // 4. 妫€鏌ユ。浣嶉厤缃?
    const tierConfig = await protocolContract.minerTierConfigs(minerTier);
    result.details.tierConfig = {
      enabled: tierConfig.enabled,
      costUsdt: ethers.formatUnits(tierConfig.costUsdt, usdtDecimals),
      soldCount: Number(tierConfig.soldCount),
      maxSupply: Number(tierConfig.maxSupply),
    };

    if (!tierConfig.enabled) {
      result.issues.push(`鐭挎満妗ｄ綅 ${minerTier} 宸茬鐢╜);
      result.canPurchase = false;
    }

    if (tierConfig.maxSupply > 0n && tierConfig.soldCount >= tierConfig.maxSupply) {
      result.issues.push(`鐭挎満妗ｄ綅 ${minerTier} 宸插敭瀹宍);
      result.canPurchase = false;
    }

    // 5. 妫€鏌SDT浣欓
    const usdtBalance = await usdtContract.balanceOf(userAddress);
    result.details.usdtBalance = ethers.formatUnits(usdtBalance, usdtDecimals);

    if (usdtBalance < requiredCostWei) {
      const shortage = requiredCostWei - usdtBalance;
      result.issues.push(
        `USDT浣欓涓嶈冻锛岃繕闇€瑕?${ethers.formatUnits(shortage, usdtDecimals)} USDT`
      );
      result.canPurchase = false;
    }

    // 6. 妫€鏌SDT鎺堟潈
    const usdtAllowance = await usdtContract.allowance(userAddress, protocolContract.target);
    result.details.usdtAllowance = ethers.formatUnits(usdtAllowance, usdtDecimals);

    if (usdtAllowance < requiredCostWei) {
      result.warnings.push(
        `USDT鎺堟潈棰濆害涓嶈冻锛岄渶瑕乤pprove ${ethers.formatUnits(requiredCostWei, usdtDecimals)} USDT`
      );
    }

    // 7. 鑺傜偣闃舵闄愯喘妫€鏌?
    if (salePhase === 0n && minerTier > 0) {
      // 鑺傜偣闃舵涓嬶紝璁＄畻鐢ㄦ埛鍦ㄨ妗ｄ綅鐨勫凡璐暟閲?
      try {
        let tierCount = 0;
        let index = 0;
        while (true) {
          try {
            const miner = await protocolContract.userMiners(userAddress, index);
            if (miner.tier === minerTier && !miner.isAutoGifted) {
              tierCount++;
            }
            index++;
          } catch {
            break;
          }
        }

        // 鑾峰彇璇ユ。浣嶇殑闄愯喘鏁伴噺锛堜粠甯搁噺鎴栧悎绾︽帹瀵硷級
        const PURCHASE_LIMITS: Record<number, number> = {
          0: 0, // Basic: 鏃犻檺
          1: 5, // V1: 闄愯喘绀轰緥
          2: 5, // V2: 闄愯喘绀轰緥
          3: 5, // V3: 闄愯喘绀轰緥
        };

        const limit = PURCHASE_LIMITS[minerTier] || 0;
        if (limit > 0 && tierCount >= limit) {
          result.warnings.push(
            `鑺傜偣闃舵璇ユ。浣嶅崟鍦板潃闄愯喘 ${limit} 涓紝宸茶揪闄愰`
          );
        }
      } catch (e) {
        // 闄愯喘妫€鏌ュけ璐ワ紝涓嶉樆姝㈣喘涔?
      }
    }

  } catch (error) {
    result.warnings.push(`妫€鏌ヨ繃绋嬪嚭閿? ${String(error)}`);
  }

  return result;
}

/**
 * 鏍煎紡鍖栨鏌ョ粨鏋滀负浜虹被鍙鐨勬秷鎭?
 */
export function formatCheckResults(result: PurchaseCheckResult): string {
  if (result.canPurchase && result.warnings.length === 0) {
    return '鉁?鎵€鏈夋鏌ラ€氳繃锛屽彲浠ヨ繘琛岃喘涔?;
  }

  const messages: string[] = [];

  if (!result.canPurchase) {
    messages.push('鉂?璐拱妫€鏌ユ湭閫氳繃:');
    result.issues.forEach((issue) => {
      messages.push(`  鈥?${issue}`);
    });
  } else {
    messages.push('鉁?鍙互杩涜璐拱锛屼絾鏈夎鍛?');
  }

  if (result.warnings.length > 0) {
    if (result.canPurchase) {
      messages.push('鈿狅笍 璀﹀憡:');
    }
    result.warnings.forEach((warn) => {
      messages.push(`  鈥?${warn}`);
    });
  }

  return messages.join('\n');
}

/**
 * 鎻愬彇鍏抽敭璇婃柇淇℃伅涓篣I鍙嬪ソ鐨勫璞?
 */
export function extractDiagnosticInfo(result: PurchaseCheckResult) {
  return {
    canPurchase: result.canPurchase,
    issueCount: result.issues.length,
    warningCount: result.warnings.length,
    issues: result.issues,
    warnings: result.warnings,
    status: result.canPurchase ? (result.warnings.length > 0 ? 'warning' : 'success') : 'error',
    registered: result.details.registered,
    paused: result.details.paused,
    salePhase: result.details.salePhase,
    usdtBalance: result.details.usdtBalance,
    usdtAllowance: result.details.usdtAllowance,
  };
}
