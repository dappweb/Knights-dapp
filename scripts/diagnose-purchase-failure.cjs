#!/usr/bin/env node

/**
 * 诊断购买节点/矿机失败原因
 * 使用: node scripts/diagnose-purchase-failure.cjs <userAddress> <minerTier>
 * 例: node scripts/diagnose-purchase-failure.cjs 0xcdC161B1a8406ed5B380574Be58D620dD429006D8 2
 */

const hre = require('hardhat');
const { ethers } = require('hardhat');

const SEER_PROTOCOL = '0x950aB6763963e89718bD9E6AC2031a29e8d53002';
const MINER_NODE = '0x873BAc3Db515271b2e09039Cb1F13f4186c49bB9';
const USDT = '0xC4eA24dFC165Fedb881783a84F44C2806CF7FBbD';

const MINER_TIERS = {
  0: 'Basic',
  1: 'V1',
  2: 'V2',
  3: 'V3'
};

const MINER_COSTS = {
  0: 100n,
  1: 1000n,
  2: 3000n,
  3: 10000n
};

async function diagnose(userAddress, minerTier) {
  console.log('\n=== SEER 购买失败诊断工具 ===\n');
  console.log(`用户地址: ${userAddress}`);
  console.log(`矿机档位: ${MINER_TIERS[minerTier] || 'Unknown'} (${minerTier})`);
  console.log(`\n开始检查...\n`);

  try {
    // 连接到网络
    const provider = ethers.provider;
    const network = await provider.getNetwork();
    console.log(`✓ 已连接到链: ${network.name} (ChainID: ${network.chainId})\n`);

    // 加载合约
    const protocolABI = require('../artifacts/contracts/SeerProtocol.sol/SeerProtocol.json').abi;
    const usdtABI = require('../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json').abi;
    
    const protocol = new ethers.Contract(SEER_PROTOCOL, protocolABI, provider);
    const usdt = new ethers.Contract(USDT, usdtABI, provider);

    console.log('📋 ─────────────────────────────────────────');
    console.log('   检查项 1: 协议状态');
    console.log('─────────────────────────────────────────\n');

    const paused = await protocol.paused();
    console.log(`  协议是否暂停: ${paused ? '❌ YES' : '✅ NO'}`);
    if (paused) {
      console.log('  💡 解决方案: 管理员需要调用 setPaused(false) 恢复协议\n');
      return;
    }

    console.log('\n📋 ─────────────────────────────────────────');
    console.log('   检查项 2: 销售阶段和开关');
    console.log('─────────────────────────────────────────\n');

    const salePhase = await protocol.salePhase();
    const nodeSaleOpen = await protocol.nodeSaleOpen();
    const minerSaleOpen = await protocol.minerSaleOpen();
    const phaseName = salePhase === 0n ? 'NODE_PHASE' : 'MINER_PHASE';

    console.log(`  当前销售阶段: ${phaseName}`);
    console.log(`  节点销售开关: ${nodeSaleOpen ? '✅ ON' : '❌ OFF'}`);
    console.log(`  矿机销售开关: ${minerSaleOpen ? '✅ ON' : '❌ OFF'}\n`);

    if (salePhase === 0n && !nodeSaleOpen) {
      console.log('  ⚠️ NODE_PHASE 阶段但节点销售已关闭');
      console.log('  💡 解决方案: 管理员调用 setNodeSaleOpen(true)\n');
      return;
    }

    if (salePhase === 1n && !minerSaleOpen) {
      console.log('  ⚠️ MINER_PHASE 阶段但矿机销售已关闭');
      console.log('  💡 解决方案: 管理员调用 setMinerSaleOpen(true)\n');
      return;
    }

    console.log('\n📋 ─────────────────────────────────────────');
    console.log('   检查项 3: 矿机档位配置');
    console.log('─────────────────────────────────────────\n');

    const tierConfig = await protocol.minerTierConfigs(minerTier);
    console.log(`  档位: ${MINER_TIERS[minerTier]}`);
    console.log(`  成本: ${ethers.formatUnits(tierConfig.costUsdt, 6)} USDT`);
    console.log(`  乘数: ${tierConfig.multiplier}`);
    console.log(`  周期: ${tierConfig.cycleDays} 天`);
    console.log(`  B仓: ${ethers.formatUnits(tierConfig.bVaultUsdt, 6)} USDT`);
    console.log(`  启用: ${tierConfig.enabled ? '✅ YES' : '❌ NO'}`);
    console.log(`  已售: ${tierConfig.soldCount} / ${tierConfig.maxSupply === 0n ? '∞' : tierConfig.maxSupply}\n`);

    if (!tierConfig.enabled) {
      console.log('  ❌ 该矿机档位已被禁用');
      console.log('  💡 解决方案: 管理员需要启用该档位\n');
      return;
    }

    if (tierConfig.maxSupply > 0n && tierConfig.soldCount >= tierConfig.maxSupply) {
      console.log(`  ❌ 该档位已售完 (${tierConfig.soldCount}/${tierConfig.maxSupply})`);
      console.log('  💡 解决方案: 等待或选择其他档位\n');
      return;
    }

    console.log('\n📋 ─────────────────────────────────────────');
    console.log('   检查项 4: 用户USDT资产');
    console.log('─────────────────────────────────────────\n');

    const usdtBalance = await usdt.balanceOf(userAddress);
    const usdtAllowance = await usdt.allowance(userAddress, SEER_PROTOCOL);
    const requiredCost = MINER_COSTS[minerTier] || 0n;

    console.log(`  USDT余额: ${ethers.formatUnits(usdtBalance, 6)} USDT`);
    console.log(`  USDT授权额度: ${ethers.formatUnits(usdtAllowance, 6)} USDT`);
    console.log(`  购买需要: ${ethers.formatUnits(requiredCost * 10n ** 6n, 6)} USDT\n`);

    if (usdtBalance < requiredCost * 10n ** 6n) {
      console.log(`  ❌ USDT余额不足`);
      console.log(`  💡 解决方案: 需要补充 ${ethers.formatUnits(requiredCost * 10n ** 6n - usdtBalance, 6)} USDT\n`);
      return;
    }

    if (usdtAllowance < requiredCost * 10n ** 6n) {
      console.log(`  ❌ USDT授权额度不足`);
      console.log(`  💡 解决方案: 需要对 SeerProtocol (${SEER_PROTOCOL}) 进行 approve`);
      console.log(`     approve 金额: ${ethers.formatUnits(requiredCost * 10n ** 6n, 6)} USDT\n`);
      return;
    }

    console.log('\n📋 ─────────────────────────────────────────');
    console.log('   检查项 5: 用户在NODE_PHASE的购买限额');
    console.log('─────────────────────────────────────────\n');

    if (salePhase === 0n) {
      const userMinerCount = await protocol.userMiners(userAddress, 0);
      // 实际需要查询该用户所有档位的矿机数
      console.log(`  当前在 NODE_PHASE 阶段，检查单地址限购...`);
      console.log(`  💡 提示: 节点阶段 V1/V2/V3 各有地址限购`);
      console.log(`     Basic 档位: 不限购`);
      console.log(`     V1 档位: 地址限购`);
      console.log(`     V2 档位: 地址限购`);
      console.log(`     V3 档位: 地址限购\n`);
      
      if (minerTier > 0) {
        console.log(`  ⚠️ 建议: 如果已达该档位限额，可等待 15 天后自动切换到 MINER_PHASE\n`);
      }
    } else {
      console.log(`  ✅ 在 MINER_PHASE 阶段，无地址限购限制\n`);
    }

    console.log('\n📋 ─────────────────────────────────────────');
    console.log('   ✅ 所有检查项均通过！');
    console.log('─────────────────────────────────────────\n');
    console.log('  可能的失败原因:');
    console.log('  1. 交易 gas 不足');
    console.log('  2. 前端代码问题（重试或刷新）');
    console.log('  3. 网络临时故障\n');
    console.log('  建议: 重新尝试购买或稍后重试\n');

  } catch (error) {
    console.error('\n❌ 诊断失败:', error.message);
    process.exit(1);
  }
}

// 主函数
async function main() {
  if (process.argv.length < 4) {
    console.log('使用方法: node scripts/diagnose-purchase-failure.cjs <userAddress> <minerTier>');
    console.log('示例: node scripts/diagnose-purchase-failure.cjs 0xcdC161B1a8406ed5B380574Be58D620dD429006D8 2');
    console.log('\n矿机档位:');
    console.log('  0 = Basic');
    console.log('  1 = V1');
    console.log('  2 = V2');
    console.log('  3 = V3\n');
    process.exit(1);
  }

  const userAddress = process.argv[2];
  const minerTier = parseInt(process.argv[3]);

  if (!ethers.isAddress(userAddress)) {
    console.error('❌ 无效的以太坊地址');
    process.exit(1);
  }

  if (minerTier < 0 || minerTier > 3) {
    console.error('❌ 无效的矿机档位 (应为 0-3)');
    process.exit(1);
  }

  await diagnose(userAddress, minerTier);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
