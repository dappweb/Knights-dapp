/**
 * 升级 SeerProtocol: 对齐五项业绩口径
 *
 * 变更点:
 *   contracts/SeerProtocol.sol :: _getBranchVolume(directChild)
 *     旧: return child.teamVolumeUsdt
 *     新: return child.totalInvestedUsdt + child.teamVolumeUsdt
 *
 * 仅改内部 view 函数, 无存储结构变更, 无 initializer 调用。
 *
 * 用法:
 *   npx hardhat run scripts/upgrade-protocol-metrics-alignment.cjs --network cncMainnet
 */

const hre = require("hardhat");
const { ethers, upgrades } = hre;
const fs = require("fs");
const path = require("path");

const DEPLOY_FILE = path.resolve(__dirname, "../deployments/cncMainnet.latest.json");

function loadDeployment() {
  const data = JSON.parse(fs.readFileSync(DEPLOY_FILE, "utf8"));
  if (!data.contracts?.protocol) throw new Error("deployment file missing contracts.protocol");
  return data;
}

async function main() {
  const deployment = loadDeployment();
  const PROTOCOL_PROXY = process.env.PROTOCOL_PROXY || deployment.contracts.protocol;

  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("  🔄 SeerProtocol 升级 — 五项业绩口径对齐");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`📘 部署账户: ${deployer.address}`);
  console.log(`💰 账户余额: ${ethers.formatEther(bal)}`);
  console.log(`🏷️  Protocol 代理: ${PROTOCOL_PROXY}\n`);

  // ── 0. 部署外部库 (SeerProtocol 依赖 LibSeerAdmin / LibSeerClaim) ──
  console.log("📋 [0/3] 部署外部库...");
  const LibSeerAdmin = await ethers.getContractFactory("LibSeerAdmin");
  const libAdmin = await LibSeerAdmin.deploy();
  await libAdmin.waitForDeployment();
  const libAdminAddr = await libAdmin.getAddress();
  console.log(`   ✅ LibSeerAdmin: ${libAdminAddr}`);

  const LibSeerClaim = await ethers.getContractFactory("LibSeerClaim");
  const libClaim = await LibSeerClaim.deploy();
  await libClaim.waitForDeployment();
  const libClaimAddr = await libClaim.getAddress();
  console.log(`   ✅ LibSeerClaim: ${libClaimAddr}\n`);

  // ── 1. 升级实现 ──
  console.log("📋 [1/3] 升级 SeerProtocol 实现...");
  const SeerProtocol = await ethers.getContractFactory("SeerProtocol", {
    libraries: {
      LibSeerAdmin: libAdminAddr,
      LibSeerClaim: libClaimAddr,
    },
  });
  const upgraded = await upgrades.upgradeProxy(PROTOCOL_PROXY, SeerProtocol, {
    kind: "uups",
    unsafeAllow: [
      "constructor",
      "external-library-linking",
      "missing-initializer-call",
      "missing-initializer",
    ],
  });
  await upgraded.waitForDeployment();
  const implAddr = await upgrades.erc1967.getImplementationAddress(PROTOCOL_PROXY);
  console.log(`✅ SeerProtocol 升级完成`);
  console.log(`   代理地址: ${PROTOCOL_PROXY}`);
  console.log(`   新实现:   ${implAddr}\n`);

  // ── 2. 烟雾测试: 读取几个 view 函数 ──
  console.log("📋 [2/3] 烟雾测试...");
  const iface = new ethers.Interface([
    "function nodeSaleOpen() view returns (bool)",
    "function minerSaleOpen() view returns (bool)",
    "function getBranchVolume(address,address) view returns (uint256)",
    "function getSmallAreaVolume(address) view returns (uint256)",
  ]);
  const protocol = new ethers.Contract(PROTOCOL_PROXY, iface, deployer);
  console.log(`   nodeSaleOpen : ${await protocol.nodeSaleOpen()}`);
  console.log(`   minerSaleOpen: ${await protocol.minerSaleOpen()}`);
  console.log(`   ✅ 基础接口可用\n`);

  // ── 3. 回写 deployment 元数据 ──
  console.log("📋 [3/3] 写回部署元数据...");
  deployment.lastUpgrade = {
    type: "metrics-alignment",
    timestamp: new Date().toISOString(),
    implementation: implAddr,
    libraries: {
      LibSeerAdmin: libAdminAddr,
      LibSeerClaim: libClaimAddr,
    },
    note: "_getBranchVolume now returns totalInvestedUsdt + teamVolumeUsdt (aligns with frontend branchVolume definition)",
  };
  fs.writeFileSync(DEPLOY_FILE, JSON.stringify(deployment, null, 2));
  console.log(`   ✅ 已更新 ${path.relative(process.cwd(), DEPLOY_FILE)}\n`);

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  ✅ 升级完成 — 业绩口径已对齐");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("\n💡 提醒: 现有用户 teamLevel 将在下次下级入金触发 _updateTeamVolume 时自动重算。");
  console.log("   若需立即重算全量用户等级, 请另行编写 admin 批量同步脚本。\n");
}

main().catch((err) => {
  console.error("\n❌ 升级失败:", err);
  process.exit(1);
});
