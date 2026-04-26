/**
 * 升级 SeerProtocol: 加入节点销售资金 10/10/80 分配 (明帕/暗帕/项目方)
 *
 * 用法:
 *   # 仅升级实现 (不改当前钱包配置; 链上已有配置会保留)
 *   npx hardhat run scripts/upgrade-protocol-paipoint.cjs --network cncMainnet
 *
 *   # 升级并激活红框方案 (10/10/80)
 *   PROJECT_WALLET=0x...  DARK_PAI_WALLET=0x...  \
 *   npx hardhat run scripts/upgrade-protocol-paipoint.cjs --network cncMainnet
 *
 *   # 暗帕钱包留空 = 暗帕份额并入 projectWallet
 *   PROJECT_WALLET=0x... npx hardhat run ...
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

function isAddr(a) {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
}

async function main() {
  const deployment = loadDeployment();
  const PROTOCOL_PROXY = process.env.PROTOCOL_PROXY || deployment.contracts.protocol;
  const PROJECT_WALLET = (process.env.PROJECT_WALLET || "").trim();
  const DARK_PAI_WALLET = (process.env.DARK_PAI_WALLET || "").trim();

  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("  🔄 SeerProtocol 升级 — 节点销售资金 10/10/80 分配");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`📘 使用账户: ${deployer.address}`);
  console.log(`💰 账户余额: ${ethers.formatEther(bal)}`);
  console.log(`🏷️  Protocol 代理: ${PROTOCOL_PROXY}\n`);

  // ── 0. 先部署外部库 (SeerProtocol 现依赖 LibSeerAdmin / LibSeerClaim) ──
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

  // ── 1. 升级实现 ─────────────────────────────────────────────
  console.log("📋 [1/3] 升级 SeerProtocol 实现...");
  const SeerProtocol = await ethers.getContractFactory("SeerProtocol", {
    libraries: {
      LibSeerAdmin: libAdminAddr,
      LibSeerClaim: libClaimAddr,
    },
  });
  const upgraded = await upgrades.upgradeProxy(PROTOCOL_PROXY, SeerProtocol, {
    kind: "uups",
    unsafeAllow: ["constructor", "external-library-linking", "missing-initializer-call", "missing-initializer"],
  });
  await upgraded.waitForDeployment();
  const implAddr = await upgrades.erc1967.getImplementationAddress(PROTOCOL_PROXY);
  console.log(`✅ SeerProtocol 升级完成`);
  console.log(`   代理地址: ${PROTOCOL_PROXY}`);
  console.log(`   新实现:   ${implAddr}\n`);

  // ── 2. 验证新函数/存储 ──────────────────────────────────────
  console.log("📋 [2/3] 验证新增入口...");
  const iface = new ethers.Interface([
    "function projectWallet() view returns (address)",
    "function darkPaiWallet() view returns (address)",
    "function brightPaiBP() view returns (uint256)",
    "function darkPaiBP() view returns (uint256)",
    "function setProjectWallet(address)",
    "function setDarkPaiWallet(address)",
    "function setPaiPointBP(uint256,uint256)",
  ]);
  const protocol = new ethers.Contract(PROTOCOL_PROXY, iface, deployer);

  const before = {
    projectWallet: await protocol.projectWallet(),
    darkPaiWallet: await protocol.darkPaiWallet(),
    brightPaiBP: await protocol.brightPaiBP(),
    darkPaiBP: await protocol.darkPaiBP(),
  };
  console.log("   当前配置 (升级后、激活前):");
  console.log(`     projectWallet:  ${before.projectWallet}`);
  console.log(`     darkPaiWallet:  ${before.darkPaiWallet}`);
  console.log(`     brightPaiBP:    ${before.brightPaiBP.toString()}`);
  console.log(`     darkPaiBP:      ${before.darkPaiBP.toString()}\n`);

  // ── 3. (可选) 激活红框方案 ─────────────────────────────────
  console.log("📋 [3/3] 资金分配激活...");
  if (!PROJECT_WALLET) {
    console.log("   ⚠️  未提供 PROJECT_WALLET 环境变量, 跳过激活。");
    console.log("   当前逻辑: 保持链上已存在的 project/darkPai/BP 配置不变。");
    console.log("   激活方法:");
    console.log("     PROJECT_WALLET=0x... DARK_PAI_WALLET=0x... \\");
    console.log("       npx hardhat run scripts/upgrade-protocol-paipoint.cjs --network cncMainnet");
    console.log("   或直接调用 setProjectWallet / setDarkPaiWallet / setPaiPointBP\n");
  } else {
    if (!isAddr(PROJECT_WALLET)) throw new Error(`PROJECT_WALLET 格式错误: ${PROJECT_WALLET}`);
    const darkArg = DARK_PAI_WALLET ? DARK_PAI_WALLET : ethers.ZeroAddress;
    if (DARK_PAI_WALLET && !isAddr(DARK_PAI_WALLET)) {
      throw new Error(`DARK_PAI_WALLET 格式错误: ${DARK_PAI_WALLET}`);
    }

    console.log(`   ➜ projectWallet: ${PROJECT_WALLET}`);
    console.log(`   ➜ darkPaiWallet: ${darkArg}  ${darkArg === ethers.ZeroAddress ? "(未配置, 暗帕并入项目方)" : ""}`);
    console.log(`   ➜ brightPaiBP / darkPaiBP: 1000 / 1000 (10% / 10%)\n`);

    const tx1 = await protocol.setProjectWallet(PROJECT_WALLET);
    console.log(`   📤 setProjectWallet tx: ${tx1.hash}`);
    await tx1.wait();

    if (darkArg !== ethers.ZeroAddress) {
      const tx2 = await protocol.setDarkPaiWallet(darkArg);
      console.log(`   📤 setDarkPaiWallet tx: ${tx2.hash}`);
      await tx2.wait();
    }

    const tx3 = await protocol.setPaiPointBP(1000, 1000);
    console.log(`   📤 setPaiPointBP tx: ${tx3.hash}`);
    await tx3.wait();
    console.log("   ✅ 激活完成\n");

    const after = {
      projectWallet: await protocol.projectWallet(),
      darkPaiWallet: await protocol.darkPaiWallet(),
      brightPaiBP: await protocol.brightPaiBP(),
      darkPaiBP: await protocol.darkPaiBP(),
    };
    console.log("   校验:");
    console.log(`     projectWallet:  ${after.projectWallet}`);
    console.log(`     darkPaiWallet:  ${after.darkPaiWallet}`);
    console.log(`     brightPaiBP:    ${after.brightPaiBP.toString()}`);
    console.log(`     darkPaiBP:      ${after.darkPaiBP.toString()}\n`);
  }

  // ── 回写 deployment 元数据 ──────────────────────────────
  deployment.lastUpgrade = {
    type: "paipoint-distribution",
    timestamp: new Date().toISOString(),
    implementation: implAddr,
    libraries: {
      LibSeerAdmin: libAdminAddr,
      LibSeerClaim: libClaimAddr,
    },
    projectWallet: PROJECT_WALLET || null,
    darkPaiWallet: DARK_PAI_WALLET || null,
  };
  fs.writeFileSync(DEPLOY_FILE, JSON.stringify(deployment, null, 2));
  console.log(`📝 已更新 ${path.relative(process.cwd(), DEPLOY_FILE)}\n`);

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  ✅ 完成");
  console.log("═══════════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n❌ 升级失败:", err);
  process.exit(1);
});
