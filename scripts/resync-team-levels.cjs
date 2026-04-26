/**
 * resync-team-levels.cjs
 *
 * 将链上用户 teamLevel 重算并与新口径（按小区业绩）对齐。
 *
 * 步骤:
 *   1. 通过 UserRegistered 事件枚举所有注册地址 (chunked queryFilter)。
 *   2. 对每个地址按新口径计算 smallArea -> 应有等级。
 *   3. 与链上当前 teamLevel 对比；不一致则通过 setUserTeamLevel 修正。
 *
 * 用法:
 *   npx hardhat run scripts/resync-team-levels.cjs --network cncMainnet
 *
 *   DRY_RUN=1 npx hardhat run ...   # 只输出差异, 不发送修正交易
 *   FROM_BLOCK=12345 ...            # 指定起始扫描区块 (默认 0)
 */

const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

const DEPLOY_FILE = path.resolve(__dirname, "../deployments/cncMainnet.latest.json");
const CHUNK = 100000;

const TEAM_LEVELS = ["None", "V1", "V2", "V3", "V4", "V5"];
const THRESHOLDS_USDT = [
  { name: "V5", value: 5_000_000n * 10n ** 18n, idx: 5 },
  { name: "V4", value: 1_000_000n * 10n ** 18n, idx: 4 },
  { name: "V3",   value: 300_000n * 10n ** 18n, idx: 3 },
  { name: "V2",   value: 100_000n * 10n ** 18n, idx: 2 },
  { name: "V1",    value: 30_000n * 10n ** 18n, idx: 1 },
];

function levelBySmallArea(small) {
  for (const t of THRESHOLDS_USDT) if (small >= t.value) return t.idx;
  return 0;
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1";
  const fromBlock = Number(process.env.FROM_BLOCK || 0);

  const deployment = JSON.parse(fs.readFileSync(DEPLOY_FILE, "utf8"));
  const PROTOCOL = deployment.contracts.protocol;

  const [signer] = await ethers.getSigners();
  console.log(`\n部署/管理账户: ${signer.address}`);
  console.log(`Protocol:       ${PROTOCOL}`);
  console.log(`模式:           ${dryRun ? "DRY-RUN" : "WRITE"}\n`);

  const abi = [
    "event UserRegistered(address indexed user, address indexed referrer, uint256 timestamp)",
    "event TeamLevelUpgrade(address indexed user, uint8 oldLevel, uint8 newLevel)",
    "function getUserInfo(address) view returns (bool registered,address referrer,uint8 teamLevel,uint256 totalInvestedUsdt,uint256 teamVolumeUsdt,uint256 seerBalance,uint256 seerBetting,uint256 totalEarnedSeer,uint256 directReferralCount)",
    "function getDirectReferrals(address) view returns (address[])",
    "function setUserTeamLevel(address _user, uint8 _level) external",
    "function totalUsers() view returns (uint256)",
  ];
  const c = new ethers.Contract(PROTOCOL, abi, signer);

  const provider = signer.provider;
  const head = await provider.getBlockNumber();
  console.log(`最新区块: ${head}`);

  // 枚举所有注册用户
  console.log("\n[1/3] 扫描 UserRegistered 事件...");
  const filter = c.filters.UserRegistered();
  const users = new Set();
  for (let from = fromBlock; from <= head; from += CHUNK + 1) {
    const to = Math.min(from + CHUNK, head);
    let logs;
    try {
      logs = await c.queryFilter(filter, from, to);
    } catch (e) {
      console.log(`   ⚠️  ${from}-${to} 失败, 缩小步长重试`);
      for (let f = from; f <= to; f += 500) {
        const t = Math.min(f + 499, to);
        const ls = await c.queryFilter(filter, f, t);
        ls.forEach(l => users.add(l.args.user.toLowerCase()));
      }
      continue;
    }
    logs.forEach(l => users.add(l.args.user.toLowerCase()));
    if (logs.length) {
      process.stdout.write(`   blocks ${from}-${to}  +${logs.length}  total=${users.size}\r`);
    }
  }
  console.log(`\n   共发现 ${users.size} 个注册地址`);

  // 计算每人应有等级
  console.log("\n[2/3] 计算各账号小区业绩与应有等级...");
  const mismatches = [];
  let i = 0;
  for (const addr of users) {
    i++;
    const info = await c.getUserInfo(addr);
    const directs = await c.getDirectReferrals(addr);
    let sumBranch = 0n;
    let maxBranch = 0n;
    for (const d of directs) {
      const di = await c.getUserInfo(d);
      const bv = di.teamVolumeUsdt; // 分支业绩 = 直推 teamVolumeUsdt
      sumBranch += bv;
      if (bv > maxBranch) maxBranch = bv;
    }
    const smallArea = directs.length > 1 ? sumBranch - maxBranch : 0n;
    const expected = levelBySmallArea(smallArea);
    const onchain = Number(info.teamLevel);
    if (expected !== onchain) {
      mismatches.push({ addr, smallArea, expected, onchain });
    }
    if (i % 20 === 0) process.stdout.write(`   进度 ${i}/${users.size}  差异=${mismatches.length}\r`);
  }
  console.log(`\n   扫描完成: ${mismatches.length} 个账号等级与新口径不一致`);

  if (mismatches.length === 0) {
    console.log("\n✅ 全部账号已对齐, 无需修正。");
    return;
  }

  console.log("\n   待修正列表:");
  for (const m of mismatches) {
    console.log(`     ${ethers.getAddress(m.addr)}  小区=${ethers.formatUnits(m.smallArea, 18)}U  链上=${TEAM_LEVELS[m.onchain]} → 应为=${TEAM_LEVELS[m.expected]}`);
  }

  if (dryRun) {
    console.log("\n[DRY-RUN] 跳过链上修正; 设置 DRY_RUN=0 重新运行以执行修正。");
    return;
  }

  console.log(`\n[3/3] 通过 setUserTeamLevel 修正 ${mismatches.length} 个账号...`);
  let ok = 0, fail = 0;
  for (const m of mismatches) {
    try {
      const tx = await c.setUserTeamLevel(m.addr, m.expected);
      await tx.wait();
      ok++;
      console.log(`   ✅ ${ethers.getAddress(m.addr)}  → ${TEAM_LEVELS[m.expected]}  tx=${tx.hash}`);
    } catch (e) {
      fail++;
      console.log(`   ❌ ${ethers.getAddress(m.addr)}  失败: ${e.shortMessage || e.message}`);
    }
  }
  console.log(`\n完成: 成功 ${ok}, 失败 ${fail}`);
}

main().catch((err) => {
  console.error("\n❌ 失败:", err);
  process.exit(1);
});
