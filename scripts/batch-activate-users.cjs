/**
 * batch-activate-users.cjs
 * ─────────────────────────────────────────────────────
 * 批量激活(注册)用户地址，使其可以作为推荐人被绑定。
 *
 * 工作流程:
 *   1. 扫描链上 UserRegistered 事件，获取所有已注册用户 (已激活)
 *   2. 读取待激活地址列表 (从命令行参数 或 ACTIVATE_ADDRESSES 环境变量)
 *   3. 过滤掉已注册的地址
 *   4. 调用 adminBatchRegister 批量注册
 *
 * 用法:
 *   # 方式1: 命令行传入地址 (逗号分隔)
 *   node scripts/batch-activate-users.cjs 0xAddr1,0xAddr2,0xAddr3
 *
 *   # 方式2: 环境变量传入
 *   ACTIVATE_ADDRESSES="0xAddr1,0xAddr2" node scripts/batch-activate-users.cjs
 *
 *   # 方式3: 不传参数 → 查看当前已注册用户列表
 *   node scripts/batch-activate-users.cjs
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.production") });
const { ethers } = require("ethers");

const RPC_URL =
  process.env.VITE_RPC_URL ||
  process.env.RPC_URL ||
  process.env.CNC_MAINNET_RPC_URL ||
  process.env.VITE_CNC_MAINNET_RPC_URL;
const PK = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const PROTOCOL_ADDR = process.env.VITE_PROTOCOL_ADDRESS;

if (!RPC_URL || !PK || !PROTOCOL_ADDR) {
  console.error("❌ Missing env vars: RPC_URL, PRIVATE_KEY, VITE_PROTOCOL_ADDRESS");
  process.exit(1);
}

const PROTOCOL_ABI = [
  "event UserRegistered(address indexed user, address indexed referrer, uint256 timestamp)",
  "function getUserInfo(address) view returns (bool registered, address referrer, uint8 teamLevel, uint256 totalInvestedUsdt, uint256 teamVolumeUsdt, uint256 seerBalance, uint256 seerBetting, uint256 totalEarnedSeer, uint256 directReferralCount)",
  "function totalUsers() view returns (uint256)",
  "function owner() view returns (address)",
  "function adminBatchRegister(address[] _users, address[] _referrers) external",
  "event AdminBatchRegistered(address indexed admin, uint256 count, uint256 timestamp)",
];

const BATCH_SIZE = 100; // 每次最多注册100个，避免gas过高

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PK, provider);
  const protocol = new ethers.Contract(PROTOCOL_ADDR, PROTOCOL_ABI, wallet);

  const ownerAddr = await protocol.owner();
  const walletAddr = await wallet.getAddress();
  console.log("Wallet:", walletAddr);
  console.log("Owner:", ownerAddr);
  console.log("Protocol:", PROTOCOL_ADDR);

  if (walletAddr.toLowerCase() !== ownerAddr.toLowerCase()) {
    console.error("❌ Wallet is not the contract owner. Only owner can batch register.");
    process.exit(1);
  }

  // Step 1: 扫描已注册用户
  console.log("\n🔍 Scanning existing registered users...");
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - 500_000);
  const logs = await protocol.queryFilter(protocol.filters.UserRegistered(), fromBlock, latest);
  
  const registeredSet = new Set();
  for (const log of logs) {
    if (log.args?.user) {
      registeredSet.add(log.args.user.toLowerCase());
    }
  }
  const totalOnChain = await protocol.totalUsers();
  console.log(`   On-chain totalUsers: ${totalOnChain}`);
  console.log(`   Found ${registeredSet.size} registered users from events`);

  // Step 2: 获取待激活地址
  const rawInput = process.argv[2] || process.env.ACTIVATE_ADDRESSES || "";
  const addressesToActivate = rawInput
    .split(",")
    .map((a) => a.trim())
    .filter((a) => ethers.isAddress(a));

  if (addressesToActivate.length === 0) {
    console.log("\n📋 No addresses to activate. Current registered users:");
    for (const addr of registeredSet) {
      console.log(`   ${addr}`);
    }
    console.log(`\nUsage: node scripts/batch-activate-users.cjs 0xAddr1,0xAddr2,...`);
    return;
  }

  console.log(`\n📋 Requested activation for ${addressesToActivate.length} addresses`);

  // Step 3: 过滤已注册的
  const needActivation = [];
  const alreadyActive = [];
  for (const addr of addressesToActivate) {
    if (registeredSet.has(addr.toLowerCase())) {
      alreadyActive.push(addr);
    } else {
      needActivation.push(addr);
    }
  }

  if (alreadyActive.length > 0) {
    console.log(`   ✅ Already registered (skip): ${alreadyActive.length}`);
    for (const a of alreadyActive) {
      console.log(`      ${a}`);
    }
  }

  if (needActivation.length === 0) {
    console.log("\n✅ All addresses are already activated!");
    return;
  }

  console.log(`   🔄 Need activation: ${needActivation.length}`);

  // Step 4: 批量注册 (推荐人默认挂在owner下)
  const referrers = needActivation.map(() => ethers.ZeroAddress); // address(0) → 默认挂owner

  for (let i = 0; i < needActivation.length; i += BATCH_SIZE) {
    const batchUsers = needActivation.slice(i, i + BATCH_SIZE);
    const batchRefs = referrers.slice(i, i + BATCH_SIZE);

    console.log(`\n🚀 Batch ${Math.floor(i / BATCH_SIZE) + 1}: registering ${batchUsers.length} users...`);
    for (const u of batchUsers) {
      console.log(`   → ${u}`);
    }

    const tx = await protocol.adminBatchRegister(batchUsers, batchRefs);
    console.log(`   tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}, gas used: ${receipt.gasUsed}`);
  }

  const newTotal = await protocol.totalUsers();
  console.log(`\n✅ Done! totalUsers: ${totalOnChain} → ${newTotal}`);
}

main().catch((error) => {
  console.error("\n❌ Failed:", error);
  process.exit(1);
});
