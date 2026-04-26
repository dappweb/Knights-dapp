/**
 * 升级 SeerProtocol: 回滚 _getBranchVolume 至 `child.teamVolumeUsdt`
 *
 * 背景:
 *   前一次升级 (metrics-alignment) 将 _getBranchVolume 改为
 *     return child.totalInvestedUsdt + child.teamVolumeUsdt;
 *   但链上历史 teamVolumeUsdt 本身已包含本人入金 (= self + 整条下线),
 *   导致分支业绩被重复计算本人入金, 小区/等级判定偏大。
 *
 *   本次回滚保持 _getBranchVolume 返回 child.teamVolumeUsdt, 与前端同步。
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
  console.log("  🔄 SeerProtocol 升级 — 回滚 branch 定义 (Plan A)");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`📘 部署账户: ${deployer.address}`);
  console.log(`💰 账户余额: ${ethers.formatEther(bal)}`);
  console.log(`🏷️  Protocol 代理: ${PROTOCOL_PROXY}\n`);

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

  console.log("📋 [1/3] 升级 SeerProtocol 实现...");
  const SeerProtocol = await ethers.getContractFactory("SeerProtocol", {
    libraries: { LibSeerAdmin: libAdminAddr, LibSeerClaim: libClaimAddr },
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
  console.log(`✅ 升级完成`);
  console.log(`   代理地址: ${PROTOCOL_PROXY}`);
  console.log(`   新实现:   ${implAddr}\n`);

  console.log("📋 [2/3] 烟雾测试...");
  const iface = new ethers.Interface([
    "function nodeSaleOpen() view returns (bool)",
    "function minerSaleOpen() view returns (bool)",
    "function getSmallAreaVolume(address) view returns (uint256)",
    "function getBranchVolume(address,address) view returns (uint256)",
  ]);
  const protocol = new ethers.Contract(PROTOCOL_PROXY, iface, deployer);
  console.log(`   nodeSaleOpen : ${await protocol.nodeSaleOpen()}`);
  console.log(`   minerSaleOpen: ${await protocol.minerSaleOpen()}`);

  // 针对 0x3EE3... 验证
  const TEST_USER = "0x3EE3023202a13a2aDCBae486C57999600a9CD4D8";
  const TEST_DIRECT = "0xf922D966f138B64F2Cda62e1F54cd9411d035727";
  try {
    const bv = await protocol.getBranchVolume(TEST_USER, TEST_DIRECT);
    const sa = await protocol.getSmallAreaVolume(TEST_USER);
    console.log(`   [样例] 0x3EE3.branch(0xf922) = ${ethers.formatUnits(bv, 18)} USDT (期望 17000)`);
    console.log(`   [样例] 0x3EE3.smallArea      = ${ethers.formatUnits(sa, 18)} USDT (期望 20000)`);
  } catch (e) {
    console.log(`   [样例] 读取失败: ${e.message}`);
  }
  console.log("");

  console.log("📋 [3/3] 写回部署元数据...");
  deployment.lastUpgrade = {
    type: "metrics-alignment-rollback",
    timestamp: new Date().toISOString(),
    implementation: implAddr,
    libraries: { LibSeerAdmin: libAdminAddr, LibSeerClaim: libClaimAddr },
    note: "_getBranchVolume reverted to child.teamVolumeUsdt (on-chain teamVol already includes self)",
  };
  fs.writeFileSync(DEPLOY_FILE, JSON.stringify(deployment, null, 2));
  console.log(`   ✅ 已更新 ${path.relative(process.cwd(), DEPLOY_FILE)}\n`);

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  ✅ 回滚升级完成");
  console.log("═══════════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n❌ 升级失败:", err);
  process.exit(1);
});
