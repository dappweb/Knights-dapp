/**
 * backfill-airdrops.cjs
 * ─────────────────────────────────────────────────────
 * 由于链上 Protocol 旧版本未自动调用 AirdropManager，
 * 此脚本扫描所有已注册用户，补发并解锁其应有的空投。
 *
 * 用法:
 *   node scripts/backfill-airdrops.cjs
 *
 * 可重复运行，已处理过的用户会被跳过（幂等）。
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { ethers } = require("ethers");

const RPC_URL       = process.env.VITE_RPC_URL || process.env.RPC_URL || process.env.CNC_MAINNET_RPC_URL || process.env.VITE_CNC_MAINNET_RPC_URL;
const PK            = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const PROTOCOL_ADDR = process.env.VITE_PROTOCOL_ADDRESS;
const AIRDROP_ADDR  = process.env.VITE_AIRDROP_ADDRESS;

if (!RPC_URL || !PK || !PROTOCOL_ADDR || !AIRDROP_ADDR) {
  console.error("❌ Missing env vars: VITE_RPC_URL/RPC_URL, PRIVATE_KEY, VITE_PROTOCOL_ADDRESS, VITE_AIRDROP_ADDRESS");
  process.exit(1);
}

const PROTOCOL_ABI = [
  "event UserRegistered(address indexed user, address indexed referrer, uint256 timestamp)",
  "function getUserMinerCount(address) view returns(uint256)",
];

const AIRDROP_ABI = [
  "function getAirdropInfo(address) view returns(uint256 amount, bool claimed, bool unlocked, bool withdrawn)",
  "function claimAirdrop(address _user) external",
  "function unlockAirdrop(address _user) external",
  "function airdropPoolRemaining() view returns(uint256)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PK, provider);

  const protocol = new ethers.Contract(PROTOCOL_ADDR, PROTOCOL_ABI, provider);
  const airdrop  = new ethers.Contract(AIRDROP_ADDR,  AIRDROP_ABI,  wallet);

  console.log("🔍 Scanning for all UserRegistered events …");
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - 500_000);
  const logs = await protocol.queryFilter(protocol.filters.UserRegistered(), fromBlock, latest);
  console.log(`   Found ${logs.length} registered users\n`);

  const poolRemaining = await airdrop.airdropPoolRemaining();
  console.log(`   Airdrop pool remaining: ${ethers.formatEther(poolRemaining)} SEER\n`);

  let claimedCount = 0, unlockedCount = 0, skippedCount = 0;

  for (const log of logs) {
    const user = log.args?.user;
    if (!user) continue;

    const ad = await airdrop.getAirdropInfo(user);
    const miners = await protocol.getUserMinerCount(user);

    process.stdout.write(`${user.slice(0, 10)}…  miners=${miners}  claimed=${ad.claimed}  unlocked=${ad.unlocked}  `);

    // ── Step 1: claimAirdrop ──────────────────────────────────
    if (!ad.claimed) {
      try {
        const tx = await airdrop.claimAirdrop(user);
        await tx.wait();
        console.log(`  ✅ claimed (${tx.hash.slice(0, 12)}…)`);
        claimedCount++;
      } catch (e) {
        console.log(`  ❌ claim failed: ${e.shortMessage || e.message}`);
        continue;
      }
    }

    // ── Step 2: unlockAirdrop (only if they have ≥1 miner) ───
    const latestAd = await airdrop.getAirdropInfo(user);
    if (latestAd.claimed && !latestAd.unlocked && Number(miners) > 0) {
      try {
        const tx = await airdrop.unlockAirdrop(user);
        await tx.wait();
        console.log(`  🔓 unlocked (${tx.hash.slice(0, 12)}…)`);
        unlockedCount++;
      } catch (e) {
        console.log(`  ❌ unlock failed: ${e.shortMessage || e.message}`);
      }
    } else if (latestAd.unlocked) {
      console.log("  ✓ already unlocked");
      skippedCount++;
    } else if (Number(miners) === 0) {
      console.log("  ⏳ no miner yet (locked)");
      skippedCount++;
    } else {
      console.log("  ✓ ok");
      skippedCount++;
    }
  }

  console.log(`\n✅ Done. claimed=${claimedCount}  unlocked=${unlockedCount}  skipped=${skippedCount}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
