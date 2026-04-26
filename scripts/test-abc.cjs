/**
 * SEER Protocol — A/B/C 三地址完整功能测试脚本
 * ═══════════════════════════════════════════════════════
 * 使用 Owner 私钥向 A/B/C 地址 mint 测试 USDT，
 * 并依次模拟：注册 → 购买矿机 → 检查收益 → 签到
 *
 * 运行前确认 .env 中有：
 *   PRIVATE_KEY=<owner 私钥>
 *   PRIVATE_KEY_A=<A 地址私钥>
 *   PRIVATE_KEY_B=<B 地址私钥>
 *   PRIVATE_KEY_C=<C 地址私钥>
 *
 * 运行：npx hardhat run scripts/test-abc.cjs --network cncMainnet
 */

const hre = require("hardhat");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// ─── 合约地址（从部署记录读取）───────────────────────────────
const CONTRACTS = {
  usdt:     "0x02ED3072eB83e4E0654d30250102aA58cE977789",
  seer:     "0xD8BD9571DFEDb614625515b22A801d7F7eB896AA",
  protocol: "0xB16B62957FBA686c28dd81ffbD046513a709E7dB",
  airdrop:  "0xb0ca0a4Ee42cbbd5F0A01eE49ef1C837CF0f368e",
};

// ─── 测试地址（在此填写 A / B / C 钱包地址）─────────────────
const TEST_ADDRS = {
  A: process.env.ADDR_A || "0x4C10831CBcF9884ba72051b5287b6c87E4F74A48",
  B: process.env.ADDR_B || "",   // ← 填入 B 地址
  C: process.env.ADDR_C || "",   // ← 填入 C 地址
};

// 每个测试地址 mint 多少 USDT（6位精度）
const PROTOCOL_USDT_DECIMALS = 6;
const MINT_USDT_DISPLAY = "5000";

// 购买哪个档位矿机（0=Basic 100U, 1=V1 1000U）
const MINER_TIER = 0;  // Basic

// ─── ABI ────────────────────────────────────────────────────
const USDT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const PROTOCOL_ABI = [
  "function owner() view returns (address)",
  "function getUserInfo(address) view returns (bool registered,address referrer,uint8 teamLevel,uint256 totalInvestedUsdt,uint256 teamVolumeUsdt,uint256 seerBalance,uint256 seerBetting,uint256 totalEarnedSeer,uint256 directReferralCount)",
  "function register(address referrer) external",
  "function purchaseMiner(uint8 tier) external",
  "function getUserMinerCount(address) view returns (uint256)",
  "function getUserMiner(address,uint256) view returns (tuple(uint8 tier,uint256 costUsdt,uint256 vaultA_usdt,uint256 vaultB_usdt,uint256 purchaseTime,uint256 lastClaimTime,uint256 totalClaimed,uint256 cycleDays,bool active,bool isAutoGifted,uint256 vaultA_initialUsdt,uint256 vaultB_initialUsdt,uint256 aReleasedDays,uint256 bReleasedDays))",
  "function getPendingRewards(address) view returns (uint256)",
  "function canCheckin(address) view returns (bool)",
  "function totalUsers() view returns (uint256)",
  "function miningPoolRemaining() view returns (uint256)",
];

const AIRDROP_ABI = [
  "function getAirdropInfo(address) view returns (uint256,bool,bool,bool)",
  "function remainingAirdropSlots() view returns (uint256)",
];

// ─── 辅助函数 ─────────────────────────────────────────────────
const fmtUnits = (v, decimals) => (Number(hre.ethers.formatUnits(v, decimals))).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmt6  = (v) => fmtUnits(v, PROTOCOL_USDT_DECIMALS);
const fmt18 = (v) => (Number(hre.ethers.formatEther(v))).toLocaleString("en-US", { maximumFractionDigits: 4 });
const sep   = () => console.log("─".repeat(60));

async function getSigner(pk) {
  return new hre.ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`, hre.ethers.provider);
}

async function printUserStatus(protocol, airdrop, label, addr) {
  const info   = await protocol.getUserInfo(addr);
  const count  = await protocol.getUserMinerCount(addr);
  const pending= await protocol.getPendingRewards(addr);
  const cc     = await protocol.canCheckin(addr);
  const [adrop] = await airdrop.getAirdropInfo(addr);

  console.log(`\n👤 ${label} (${addr})`);
  console.log(`   注册: ${info[0]}  |  推荐人: ${info[1]}`);
  console.log(`   矿机数量: ${count}  |  待领收益: ${fmt18(pending)} SEER  |  可签到: ${cc}`);
  console.log(`   已投入: ${fmt6(info[3])} USDT  |  SEER余额: ${fmt18(info[5])} SEER`);
  console.log(`   空投分配: ${fmt18(adrop)} SEER`);
  if (Number(count) > 0) {
    for (let i = 0; i < Number(count); i++) {
      const m = await protocol.getUserMiner(addr, i);
      const tierName = ["Basic","V1","V2","V3"][m[0]] || `Tier${m[0]}`;
      console.log(`   🔧 矿机[${i}] ${tierName} | A仓:${fmt6(m[2])}U B仓:${fmt6(m[3])}U | 活跃:${m[8]} | 已领:${fmt18(m[6])} SEER`);
    }
  }
}

// ─── 主逻辑 ───────────────────────────────────────────────────
async function main() {
  const [owner] = await hre.ethers.getSigners();
  const ownerAddr = await owner.getAddress();

  const usdt     = new hre.ethers.Contract(CONTRACTS.usdt,     USDT_ABI,     owner);
  const protocol = new hre.ethers.Contract(CONTRACTS.protocol, PROTOCOL_ABI, owner);
  const airdrop  = new hre.ethers.Contract(CONTRACTS.airdrop,  AIRDROP_ABI,  owner);
  const usdtDecimals = Number(await usdt.decimals().catch(() => PROTOCOL_USDT_DECIMALS));
  const MINT_USDT = hre.ethers.parseUnits(MINT_USDT_DISPLAY, usdtDecimals);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║       SEER Protocol — A/B/C 三地址功能测试脚本          ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Owner: ${ownerAddr}`);
  console.log(`Protocol: ${CONTRACTS.protocol}`);
  console.log(`USDT decimals: ${usdtDecimals}`);
  if (usdtDecimals !== PROTOCOL_USDT_DECIMALS) {
    throw new Error(`USDT decimals mismatch: token=${usdtDecimals}, protocol=${PROTOCOL_USDT_DECIMALS}. Refusing to run purchase flow.`);
  }
  const totalUsers = await protocol.totalUsers();
  const poolRem    = await protocol.miningPoolRemaining();
  console.log(`总用户: ${totalUsers}  |  挖矿池剩余: ${fmt18(poolRem)} SEER`);

  // ── 1. 检查测试地址 ─────────────────────────────────────────
  sep();
  console.log("📋 测试地址配置:");
  const addrs = {};
  for (const [key, addr] of Object.entries(TEST_ADDRS)) {
    if (!addr || !hre.ethers.isAddress(addr)) {
      console.log(`  ${key}: ❌ 未配置（在 .env 中设置 ADDR_${key}= 或直接填写脚本顶部）`);
    } else {
      console.log(`  ${key}: ${addr}`);
      addrs[key] = addr;
    }
  }

  // ── 2. Mint USDT 给测试地址 ─────────────────────────────────
  sep();
  const ownerUsdtBal = await usdt.balanceOf(ownerAddr);
  console.log(`💰 Owner USDT 余额: ${fmtUnits(ownerUsdtBal, usdtDecimals)} USDT`);
  console.log(`💰 向测试地址转账 ${fmtUnits(MINT_USDT, usdtDecimals)} USDT 各一份（owner transfer）...`);
  for (const [key, addr] of Object.entries(addrs)) {
    const before = await usdt.balanceOf(addr);
    console.log(`  ${key} (${addr}) 当前余额: ${fmtUnits(before, usdtDecimals)} USDT`);
    if (before >= MINT_USDT) {
      console.log(`  ✅ ${key} 余额已充足，跳过转账`);
      continue;
    }
    const need = MINT_USDT - before;
    try {
      // 先尝试 mint，若失败则用 owner transfer
      let ok = false;
      try {
        const tx = await usdt.mint(addr, need);
        await tx.wait();
        ok = true;
        console.log(`  ✅ ${key} Mint 成功`);
      } catch (_) {
        // mint caps exceeded or no permission — fallback to transfer
      }
      if (!ok) {
        const tx = await usdt.transfer(addr, need);
        await tx.wait();
        console.log(`  ✅ ${key} Transfer 成功（owner → ${key})`);
      }
      const after = await usdt.balanceOf(addr);
      console.log(`     新余额: ${fmtUnits(after, usdtDecimals)} USDT`);
    } catch (e) {
      console.log(`  ❌ ${key} 转账失败: ${e.reason || e.message}`);
    }
  }

  // ── 3. 用各自私钥注册 & 购买矿机 ───────────────────────────
  sep();
  console.log("🔑 从 .env 读取各地址私钥并执行注册+购买矿机...");

  const signerKeys = {
    A: process.env.PRIVATE_KEY_A,
    B: process.env.PRIVATE_KEY_B,
    C: process.env.PRIVATE_KEY_C,
  };

  // 链：A 推荐 B，B 推荐 C
  const referrers = {
    A: ownerAddr,            // A 以 owner 为推荐人
    B: addrs.A || ownerAddr, // B 以 A 为推荐人
    C: addrs.B || addrs.A || ownerAddr,
  };

  for (const key of ["A", "B", "C"]) {
    const pk   = signerKeys[key];
    const addr = addrs[key];
    if (!addr) { console.log(`  ${key}: 地址未配置，跳过`); continue; }
    if (!pk)   {
      console.log(`  ${key}: ⚠️  私钥 PRIVATE_KEY_${key} 未配置 → 跳过链上注册/购买`);
      console.log(`         请在前端用地址 ${addr} 手动注册（推荐人: ${referrers[key]}）`);
      continue;
    }

    const signer   = await getSigner(pk);
    const prot_s   = protocol.connect(signer);
    const usdt_s   = usdt.connect(signer);
    const ref      = referrers[key];

    // 注册
    const info = await protocol.getUserInfo(addr);
    if (!info[0]) {
      console.log(`  ${key}: 注册中（推荐人: ${ref}）...`);
      try {
        const tx = await prot_s.register(ref);
        await tx.wait();
        console.log(`  ✅ ${key} 注册成功`);
      } catch (e) {
        console.log(`  ❌ ${key} 注册失败: ${e.reason || e.message}`);
        continue;
      }
    } else {
      console.log(`  ${key}: 已注册，跳过`);
    }

    // 购买矿机
    const minerCount = await protocol.getUserMinerCount(addr);
    if (Number(minerCount) === 0) {
      console.log(`  ${key}: 购买矿机 (Tier ${MINER_TIER})...`);
      try {
        const COST = MINER_TIER === 0 ? 100n * 10n**6n
                   : MINER_TIER === 1 ? 1000n * 10n**6n
                   : MINER_TIER === 2 ? 3000n * 10n**6n
                   : 10000n * 10n**6n;
        const allowance = await usdt.allowance(addr, CONTRACTS.protocol);
        if (allowance < COST) {
          const appTx = await usdt_s.approve(CONTRACTS.protocol, COST);
          await appTx.wait();
          console.log(`    ✅ USDT 授权完成`);
        }
        const tx = await prot_s.purchaseMiner(MINER_TIER);
        await tx.wait();
        console.log(`  ✅ ${key} 购买矿机成功`);
      } catch (e) {
        console.log(`  ❌ ${key} 购买矿机失败: ${e.reason || e.message}`);
      }
    } else {
      console.log(`  ${key}: 已有 ${minerCount} 台矿机，跳过购买`);
    }
  }

  // ── 4. 打印所有地址最终状态 ─────────────────────────────────
  sep();
  console.log("📊 所有测试地址最终状态:");
  for (const [key, addr] of Object.entries(addrs)) {
    await printUserStatus(protocol, airdrop, key, addr);
  }

  sep();
  console.log("✅ 测试脚本执行完毕");
  console.log("\n📝 后续手动测试步骤（在前端/钱包内操作）：");
  console.log("   1. 等待约 24h 后用各地址 dailyCheckin() 签到");
  console.log("   2. 等待矿机释放后 claimMining() 领取收益");
  console.log("   3. 有余额后 withdraw() 提现");
  console.log("   4. 观察推荐链奖励（A推荐B、B推荐C购买时 A应收到奖励）");
}

main().catch((e) => { console.error(e); process.exit(1); });
