const hre = require("hardhat");
require("dotenv").config();

/**
 * 重新部署 MinerNode 合约（UUPS 代理）并更新关联引用
 * 
 * 原合约 0xfedD9B3Db6F1D789c5Ca9E3F19cc806E935Ff73d 是plain部署，
 * 缺少 v1NodeCount/v2NodeCount/v3NodeCount 等函数。
 * 本脚本部署全新代理实例，并更新 Protocol + SEER 的引用。
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  console.log("Deployer:", deployerAddr);

  // 现有合约地址
  const SEER_ADDRESS = "0xD8BD9571DFEDb614625515b22A801d7F7eB896AA";
  const PROTOCOL_ADDRESS = "0xB16B62957FBA686c28dd81ffbD046513a709E7dB";
  const OLD_MINER_NODE = "0xfedD9B3Db6F1D789c5Ca9E3F19cc806E935Ff73d";

  console.log("\n[1/4] Deploying new MinerNode (UUPS proxy)...");
  const MinerNode = await hre.ethers.getContractFactory("MinerNode");
  const minerNode = await hre.upgrades.deployProxy(MinerNode, [SEER_ADDRESS], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await minerNode.waitForDeployment();
  const newAddr = await minerNode.getAddress();
  console.log("New MinerNode proxy:", newAddr);

  // 验证代理结构
  const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implRaw = await hre.ethers.provider.getStorage(newAddr, implSlot);
  const implAddr = "0x" + implRaw.slice(26);
  console.log("Implementation:", implAddr);

  console.log("\n[2/4] Wiring new MinerNode to Protocol...");
  // Set protocol address on new MinerNode
  await (await minerNode.setProtocolAddress(PROTOCOL_ADDRESS)).wait();
  console.log("  minerNode.setProtocolAddress ✓");

  // Update Protocol to point to new MinerNode
  const protocolAbi = ["function setMinerNode(address) external"];
  const protocol = new hre.ethers.Contract(PROTOCOL_ADDRESS, protocolAbi, deployer);
  await (await protocol.setMinerNode(newAddr)).wait();
  console.log("  protocol.setMinerNode ✓");

  console.log("\n[3/4] Updating SEER token references...");
  const seerAbi = [
    "function setNodeRewardPool(address) external",
    "function setTaxExemption(address,bool) external",
  ];
  const seer = new hre.ethers.Contract(SEER_ADDRESS, seerAbi, deployer);
  await (await seer.setNodeRewardPool(newAddr)).wait();
  console.log("  seer.setNodeRewardPool ✓");
  await (await seer.setTaxExemption(newAddr, true)).wait();
  console.log("  seer.setTaxExemption(newMinerNode, true) ✓");

  console.log("\n[4/4] Verifying new functions...");
  const verifyAbi = [
    "function nodeCount() view returns (uint256)",
    "function v1NodeCount() view returns (uint256)",
    "function v2NodeCount() view returns (uint256)",
    "function v3NodeCount() view returns (uint256)",
    "function areAllNodeQuotasFilled() view returns (bool)",
    "function owner() view returns (address)",
    "function protocolAddress() view returns (address)",
  ];
  const verify = new hre.ethers.Contract(newAddr, verifyAbi, deployer);
  console.log("  nodeCount:", (await verify.nodeCount()).toString());
  console.log("  v1NodeCount:", (await verify.v1NodeCount()).toString());
  console.log("  v2NodeCount:", (await verify.v2NodeCount()).toString());
  console.log("  v3NodeCount:", (await verify.v3NodeCount()).toString());
  console.log("  areAllNodeQuotasFilled:", await verify.areAllNodeQuotasFilled());
  console.log("  owner:", await verify.owner());
  console.log("  protocolAddress:", await verify.protocolAddress());

  console.log("\n✅ MinerNode redeployment complete!");
  console.log("OLD MinerNode:", OLD_MINER_NODE);
  console.log("NEW MinerNode:", newAddr);
  console.log("\n⚠️  Update .env.production:");
  console.log(`   VITE_MINER_NODE_ADDRESS=${newAddr}`);
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:", error);
  process.exit(1);
});

