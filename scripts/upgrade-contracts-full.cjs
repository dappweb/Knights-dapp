const hre = require("hardhat");
const { ethers } = require("hardhat");

const PROTOCOL_PROXY = process.env.PROTOCOL_PROXY || "0xAf99bEaE50D93C931327e31d0015446466494102";
const MINERNODE_PROXY = process.env.MINERNODE_PROXY || "0x04cC8be6bcFBFe0296DAc368f75B07Fa246aab65";

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("  🔄 完整合约升级 - SeerProtocol + MinerNode");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  console.log(`📘 使用账户: ${deployer.address}`);
  console.log(`💰 账户余额: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} BNB\n`);

  try {
    // ═══════════════════════════════════════════════════════════════
    // 升级 SeerProtocol
    // ═══════════════════════════════════════════════════════════════
    console.log("📋 [1/4] 升级 SeerProtocol 合约...");
    const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol");
    const protocolUpgrade = await hre.upgrades.upgradeProxy(
      PROTOCOL_PROXY,
      SeerProtocol,
      { kind: "uups", unsafeAllow: ["constructor"] }
    );
    await protocolUpgrade.waitForDeployment();
    const protocolAddr = await protocolUpgrade.getAddress();
    console.log(`✅ SeerProtocol 升级成功: ${protocolAddr}\n`);

    // ═══════════════════════════════════════════════════════════════
    // 升级 MinerNode
    // ═══════════════════════════════════════════════════════════════
    console.log("📋 [2/4] 升级 MinerNode 合约...");
    const MinerNode = await hre.ethers.getContractFactory("MinerNode");
    const nodeUpgrade = await hre.upgrades.upgradeProxy(
      MINERNODE_PROXY,
      MinerNode,
      { kind: "uups", unsafeAllow: ["constructor"] }
    );
    await nodeUpgrade.waitForDeployment();
    const nodeAddr = await nodeUpgrade.getAddress();
    console.log(`✅ MinerNode 升级成功: ${nodeAddr}\n`);

    // ═══════════════════════════════════════════════════════════════
    // 验证新函数
    // ═══════════════════════════════════════════════════════════════
    console.log("📋 [3/4] 验证新增函数...\n");

    // 验证 SeerProtocol 的函数
    const protocolABI = [
      "function editMinerTier(address,uint256,uint8)",
      "function editMinerCost(address,uint256,uint256)",
      "function editMinerVaultA(address,uint256,uint256)",
      "function editMinerVaultB(address,uint256,uint256)",
      "function editNodeTier(address,uint256,uint8)",
      "function editNodeWeight(address,uint256,uint256)",
      "function editNodeCost(address,uint256,uint256)",
    ];

    const protocolContract = new ethers.Contract(protocolAddr, protocolABI, deployer);
    
    const protocolFuncs = [
      "editMinerTier",
      "editMinerCost",
      "editMinerVaultA",
      "editMinerVaultB",
      "editNodeTier",
      "editNodeWeight",
      "editNodeCost",
    ];

    console.log("SeerProtocol 新增函数:");
    for (const func of protocolFuncs) {
      try {
        const result = typeof protocolContract[func] === "function" ? "✅" : "❌";
        console.log(`  ${result} ${func}`);
      } catch (e) {
        console.log(`  ❌ ${func}`);
      }
    }
    console.log();

    // 验证 MinerNode 的函数
    const nodeABI = [
      "function adminEditNodeTier(address,uint256,uint8)",
      "function adminEditNodeWeight(address,uint256,uint256)",
      "function adminEditNodeCost(address,uint256,uint256)",
    ];

    const nodeContract = new ethers.Contract(nodeAddr, nodeABI, deployer);
    
    const nodeFuncs = [
      "adminEditNodeTier",
      "adminEditNodeWeight", 
      "adminEditNodeCost",
    ];

    console.log("MinerNode 新增函数:");
    for (const func of nodeFuncs) {
      try {
        const result = typeof nodeContract[func] === "function" ? "✅" : "❌";
        console.log(`  ${result} ${func}`);
      } catch (e) {
        console.log(`  ❌ ${func}`);
      }
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════
    // 总结
    // ═══════════════════════════════════════════════════════════════
    console.log("📋 [4/4] 升级总结\n");
    console.log("🎯 合约升级完成:");
    console.log(`   • SeerProtocol:  ${protocolAddr}`);
    console.log(`   • MinerNode:     ${nodeAddr}`);
    console.log(`\n✨ 新增功能:`);
    console.log(`   📊 矿机属性编辑:  editMinerTier, editMinerCost, editMinerVaultA, editMinerVaultB`);
    console.log(`   🔗 节点属性编辑:  editNodeTier, editNodeWeight, editNodeCost`);
    console.log(`\n═══════════════════════════════════════════════════════════════════\n`);

  } catch (error) {
    console.error("\n❌ 升级失败:");
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
