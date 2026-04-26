const hre = require("hardhat");
require("dotenv").config();
const fs = require("fs");
const path = require("path");

/**
 * 重新部署 Protocol + MinerNode（UUPS 代理）
 * 复用已有 USDT / SEER / Airdrop
 * 
 * 步骤:
 *   1. Deploy SeerProtocol (UUPS proxy)
 *   2. Deploy MinerNode (UUPS proxy) — 复用上一步已部署的 0x507e...DBcE
 *   3. Wire: minerNode↔protocol, protocol↔airdrop, seer税控
 *   4. Fund mining pool from SEER token
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  console.log("Deployer:", deployerAddr);

  // ─── 复用的合约 ───
  const USDT_ADDRESS     = "0x02ED3072eB83e4E0654d30250102aA58cE977789";
  const SEER_ADDRESS     = "0xD8BD9571DFEDb614625515b22A801d7F7eB896AA";
  const AIRDROP_ADDRESS  = "0xb0ca0a4Ee42cbbd5F0A01eE49ef1C837CF0f368e";
  const foundationWallet = process.env.TREASURY_WALLET || deployerAddr;

  // ─── 上一步已部署的新 MinerNode 代理 ───
  const NEW_MINER_NODE   = "0x507ebd9eeF668ba9a27a452EC9aF7192755EDBcE";

  console.log("\nReusing:");
  console.log("  USDT:      ", USDT_ADDRESS);
  console.log("  SEER:      ", SEER_ADDRESS);
  console.log("  Airdrop:   ", AIRDROP_ADDRESS);
  console.log("  MinerNode: ", NEW_MINER_NODE, "(already deployed)");
  console.log("  Foundation:", foundationWallet);

  // ──────────────────────────────────────────
  // 1. Deploy new SeerProtocol (UUPS proxy)
  // ──────────────────────────────────────────
  console.log("\n[1/5] Deploying SeerProtocol (UUPS proxy)...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol");
  const protocol = await hre.upgrades.deployProxy(
    SeerProtocol,
    [USDT_ADDRESS, SEER_ADDRESS, foundationWallet],
    {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["constructor", "state-variable-assignment"],
    }
  );
  await protocol.waitForDeployment();
  const protocolAddress = await protocol.getAddress();
  console.log("  SeerProtocol proxy:", protocolAddress);

  // ──────────────────────────────────────────
  // 2. Wire contracts
  // ──────────────────────────────────────────
  console.log("\n[2/5] Wiring contracts...");

  // MinerNode ↔ Protocol
  const minerNodeAbi = ["function setProtocolAddress(address) external"];
  const minerNode = new hre.ethers.Contract(NEW_MINER_NODE, minerNodeAbi, deployer);
  await (await minerNode.setProtocolAddress(protocolAddress)).wait();
  console.log("  minerNode.setProtocolAddress ✓");

  await (await protocol.setMinerNode(NEW_MINER_NODE)).wait();
  console.log("  protocol.setMinerNode ✓");

  // Airdrop ↔ Protocol
  const airdropAbi = ["function setProtocolAddress(address) external"];
  const airdrop = new hre.ethers.Contract(AIRDROP_ADDRESS, airdropAbi, deployer);
  try {
    await (await airdrop.setProtocolAddress(protocolAddress)).wait();
    console.log("  airdrop.setProtocolAddress ✓");
  } catch (e) {
    console.warn("  airdrop.setProtocolAddress failed (may be non-upgradeable):", e.message?.slice(0, 80));
  }
  await (await protocol.setAirdropManager(AIRDROP_ADDRESS)).wait();
  console.log("  protocol.setAirdropManager ✓");

  // ──────────────────────────────────────────
  // 3. SEER token wiring
  // ──────────────────────────────────────────
  console.log("\n[3/5] Configuring SEER token...");
  const seerAbi = [
    "function setNodeRewardPool(address) external",
    "function setTaxExemption(address,bool) external",
    "function approve(address,uint256) external returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ];
  const seer = new hre.ethers.Contract(SEER_ADDRESS, seerAbi, deployer);

  await (await seer.setNodeRewardPool(NEW_MINER_NODE)).wait();
  console.log("  seer.setNodeRewardPool ✓");

  await (await seer.setTaxExemption(protocolAddress, true)).wait();
  console.log("  seer.setTaxExemption(protocol) ✓");

  await (await seer.setTaxExemption(NEW_MINER_NODE, true)).wait();
  console.log("  seer.setTaxExemption(minerNode) ✓");

  // ──────────────────────────────────────────
  // 4. Fund mining pool
  // ──────────────────────────────────────────
  console.log("\n[4/5] Funding mining pool...");
  const deployerSeerBalance = await seer.balanceOf(deployerAddr);
  console.log("  Deployer SEER balance:", hre.ethers.formatEther(deployerSeerBalance));

  const miningFund = hre.ethers.parseEther("1000000"); // 100万 SEER
  if (deployerSeerBalance >= miningFund) {
    await (await seer.approve(protocolAddress, miningFund)).wait();
    await (await protocol.fundMiningPool(miningFund)).wait();
    console.log("  Funded mining pool: 1,000,000 SEER ✓");
  } else if (deployerSeerBalance > 0n) {
    await (await seer.approve(protocolAddress, deployerSeerBalance)).wait();
    await (await protocol.fundMiningPool(deployerSeerBalance)).wait();
    console.log("  Funded mining pool:", hre.ethers.formatEther(deployerSeerBalance), "SEER ✓");
  } else {
    console.warn("  ⚠️  No SEER balance to fund mining pool");
  }

  // ──────────────────────────────────────────
  // 5. Verify
  // ──────────────────────────────────────────
  console.log("\n[5/5] Verifying...");
  const verifyAbi = [
    "function owner() view returns (address)",
    "function minerNode() view returns (address)",
    "function miningPoolRemaining() view returns (uint256)",
    "function salePhase() view returns (uint8)",
    "function totalUsers() view returns (uint256)",
  ];
  const verify = new hre.ethers.Contract(protocolAddress, verifyAbi, deployer);
  console.log("  Protocol.owner:", await verify.owner());
  console.log("  Protocol.minerNode:", await verify.minerNode());
  console.log("  Protocol.miningPoolRemaining:", hre.ethers.formatEther(await verify.miningPoolRemaining()), "SEER");
  console.log("  Protocol.salePhase:", (await verify.salePhase()).toString());
  console.log("  Protocol.totalUsers:", (await verify.totalUsers()).toString());

  const mnVerifyAbi = [
    "function v1NodeCount() view returns (uint256)",
    "function v2NodeCount() view returns (uint256)",
    "function v3NodeCount() view returns (uint256)",
    "function nodeCount() view returns (uint256)",
    "function protocolAddress() view returns (address)",
  ];
  const mnVerify = new hre.ethers.Contract(NEW_MINER_NODE, mnVerifyAbi, deployer);
  console.log("  MinerNode.protocolAddress:", await mnVerify.protocolAddress());
  console.log("  MinerNode.nodeCount:", (await mnVerify.nodeCount()).toString());
  console.log("  MinerNode.v1NodeCount:", (await mnVerify.v1NodeCount()).toString());
  console.log("  MinerNode.v2NodeCount:", (await mnVerify.v2NodeCount()).toString());
  console.log("  MinerNode.v3NodeCount:", (await mnVerify.v3NodeCount()).toString());

  // ──────────────────────────────────────────
  // Save deployment info
  // ──────────────────────────────────────────
  const output = {
    network: hre.network.name,
    deployer: deployerAddr,
    timestamp: new Date().toISOString(),
    contracts: {
      usdt: USDT_ADDRESS,
      seer: SEER_ADDRESS,
      protocol: protocolAddress,
      minerNode: NEW_MINER_NODE,
      airdrop: AIRDROP_ADDRESS,
    },
    note: "Protocol + MinerNode redeployed as UUPS proxies. USDT/SEER/Airdrop reused.",
  };

  const baseDir = path.resolve(process.cwd(), "deployments");
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(path.join(baseDir, "cncMainnet.latest.json"), JSON.stringify(output, null, 2), "utf8");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const networkDir = path.join(baseDir, "cncMainnet");
  if (!fs.existsSync(networkDir)) fs.mkdirSync(networkDir, { recursive: true });
  fs.writeFileSync(path.join(networkDir, `${stamp}.json`), JSON.stringify(output, null, 2), "utf8");

  console.log("\n✅ Redeployment complete!");
  console.log("\n📋 New addresses:");
  console.log("  USDT:      ", USDT_ADDRESS, "(reused)");
  console.log("  SEER:      ", SEER_ADDRESS, "(reused)");
  console.log("  Protocol:  ", protocolAddress, "(NEW)");
  console.log("  MinerNode: ", NEW_MINER_NODE, "(NEW)");
  console.log("  Airdrop:   ", AIRDROP_ADDRESS, "(reused)");
  console.log("\n⚠️  Update .env.production:");
  console.log(`   VITE_PROTOCOL_ADDRESS=${protocolAddress}`);
  console.log(`   VITE_MINER_NODE_ADDRESS=${NEW_MINER_NODE}`);
}

main().catch((error) => {
  console.error("\n❌ Redeployment failed:", error);
  process.exit(1);
});
