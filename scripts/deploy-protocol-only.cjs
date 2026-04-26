/**
 * Deploy SeerProtocol only (MinerNode + AirdropManager already deployed).
 * Reads existing addresses from env or OZ manifest, then wires + funds.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
require("dotenv").config();

function parseTokenAmount(value, fallback) {
  if (!value || !String(value).trim()) return fallback;
  return hre.ethers.parseEther(String(value).trim());
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureAddress(value, name) {
  const v = String(value || "").trim();
  if (!v || !hre.ethers.isAddress(v)) throw new Error(`Invalid ${name}: "${value}"`);
  return v;
}

function readManifestProxies() {
  const manifestPath = path.resolve(process.cwd(), ".openzeppelin", "unknown-50716.json");
  if (!fs.existsSync(manifestPath)) return [];
  const payload = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return Array.isArray(payload.proxies) ? payload.proxies.map((p) => p.address) : [];
}

async function identifyProxy(address, label) {
  // Try to call a known selector to identify the contract
  const provider = hre.ethers.provider;
  // Just verify it has code
  const code = await provider.getCode(address);
  if (code === "0x" || code === "0x0") throw new Error(`${label} ${address} has no code on-chain`);
  return address;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const networkName = hre.network.name;
  const deployerAddress = await deployer.getAddress();
  const foundationWallet = process.env.TREASURY_WALLET || deployerAddress;

  const usdtAddress = ensureAddress(
    process.env.USDT_TOKEN_ADDRESS || process.env.VITE_USDT_ADDRESS,
    "USDT_TOKEN_ADDRESS"
  );
  const seerAddress = ensureAddress(
    process.env.EXISTING_SEER_ADDRESS || process.env.VITE_SEER_TOKEN_ADDRESS,
    "EXISTING_SEER_ADDRESS"
  );
  const minerNodeAddress = ensureAddress(
    process.env.EXISTING_MINER_NODE_ADDRESS || process.env.VITE_MINER_NODE_ADDRESS,
    "EXISTING_MINER_NODE_ADDRESS"
  );
  const airdropAddress = ensureAddress(
    process.env.EXISTING_AIRDROP_ADDRESS || process.env.VITE_AIRDROP_ADDRESS,
    "EXISTING_AIRDROP_ADDRESS"
  );

  console.log(`\n=== SeerProtocol-only deployment on ${networkName} ===`);
  console.log("Deployer:    ", deployerAddress);
  console.log("Foundation:  ", foundationWallet);
  console.log("USDT:        ", usdtAddress);
  console.log("SEER:        ", seerAddress);
  console.log("MinerNode:   ", minerNodeAddress);
  console.log("Airdrop:     ", airdropAddress);

  // Verify on-chain
  await identifyProxy(seerAddress, "SEER");
  await identifyProxy(minerNodeAddress, "MinerNode");
  await identifyProxy(airdropAddress, "AirdropManager");

  const balance = await hre.ethers.provider.getBalance(deployerAddress);
  console.log("Balance:     ", hre.ethers.formatEther(balance), "CNC");

  console.log("\n[1/4] Deploying SeerProtocol...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol");
  const protocol = await hre.upgrades.deployProxy(
    SeerProtocol,
    [usdtAddress, seerAddress, foundationWallet],
    {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["constructor"],
      txOverrides: { gasLimit: 10_000_000n },
    }
  );
  await protocol.waitForDeployment();
  const protocolAddress = await protocol.getAddress();
  console.log("SeerProtocol proxy:", protocolAddress);

  console.log("\n[2/4] Wiring contracts...");
  const seer = await hre.ethers.getContractAt("SEER", seerAddress, deployer);
  const minerNode = await hre.ethers.getContractAt("MinerNode", minerNodeAddress, deployer);
  const airdrop = await hre.ethers.getContractAt("AirdropManager", airdropAddress, deployer);

  await (await minerNode.setProtocolAddress(protocolAddress)).wait();
  console.log("  MinerNode -> protocol ✓");
  await (await airdrop.setProtocolAddress(protocolAddress)).wait();
  console.log("  AirdropManager -> protocol ✓");
  await (await protocol.setMinerNode(minerNodeAddress)).wait();
  console.log("  Protocol -> MinerNode ✓");
  await (await protocol.setAirdropManager(airdropAddress)).wait();
  console.log("  Protocol -> AirdropManager ✓");
  await (await seer.setNodeRewardPool(minerNodeAddress)).wait();
  console.log("  SEER.nodeRewardPool = MinerNode ✓");
  await (await seer.setTaxExemption(protocolAddress, true)).wait();
  console.log("  SEER taxExempt: protocol ✓");
  await (await seer.setTaxExemption(minerNodeAddress, true)).wait();
  console.log("  SEER taxExempt: minerNode ✓");
  await (await seer.setTaxExemption(airdropAddress, true)).wait();
  console.log("  SEER taxExempt: airdrop ✓");

  const miningFund = parseTokenAmount(process.env.MINING_POOL_FUND_SEER, hre.ethers.parseEther("1000000"));
  const airdropFund = parseTokenAmount(process.env.AIRDROP_POOL_FUND_SEER, hre.ethers.parseEther("50000"));

  console.log("\n[3/4] Funding pools...");
  console.log("  Mining pool:", hre.ethers.formatEther(miningFund), "SEER");
  console.log("  Airdrop pool:", hre.ethers.formatEther(airdropFund), "SEER");
  await (await seer.approve(protocolAddress, miningFund)).wait();
  await (await protocol.fundMiningPool(miningFund)).wait();
  console.log("  Mining pool funded ✓");
  await (await seer.approve(airdropAddress, airdropFund)).wait();
  await (await airdrop.fundAirdropPool(airdropFund)).wait();
  console.log("  Airdrop pool funded ✓");

  const output = {
    network: networkName,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    contracts: {
      usdt: usdtAddress,
      seer: seerAddress,
      protocol: protocolAddress,
      minerNode: minerNodeAddress,
      airdrop: airdropAddress,
    },
    funding: {
      miningPoolSeer: hre.ethers.formatEther(miningFund),
      airdropPoolSeer: hre.ethers.formatEther(airdropFund),
    },
  };

  const baseDir = path.resolve(process.cwd(), "deployments");
  ensureDir(baseDir);
  const latestFile = path.join(baseDir, `${networkName}.latest.json`);
  fs.writeFileSync(latestFile, JSON.stringify(output, null, 2), "utf8");

  const networkDir = path.join(baseDir, networkName);
  ensureDir(networkDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(networkDir, `${stamp}.json`), JSON.stringify(output, null, 2), "utf8");

  console.log("\n[4/4] Writing env hints to .env ...");
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf8");
    const upsert = (key, value) => {
      const line = `${key}=${value}`;
      const regex = new RegExp(`^${key}=.*$`, "m");
      envContent = regex.test(envContent) ? envContent.replace(regex, line) : `${envContent.trimEnd()}\n${line}\n`;
    };
    upsert("VITE_USDT_ADDRESS", usdtAddress);
    upsert("VITE_SEER_TOKEN_ADDRESS", seerAddress);
    upsert("VITE_PROTOCOL_ADDRESS", protocolAddress);
    upsert("VITE_MINER_NODE_ADDRESS", minerNodeAddress);
    upsert("VITE_AIRDROP_ADDRESS", airdropAddress);
    fs.writeFileSync(envPath, envContent, "utf8");
  }

  console.log("\n✅ SeerProtocol deployment complete!");
  console.log("   Protocol:  ", protocolAddress);
  console.log("   MinerNode: ", minerNodeAddress);
  console.log("   Airdrop:   ", airdropAddress);
  console.log("   SEER:      ", seerAddress);
  console.log("   Saved:     ", latestFile);
}

main().catch((error) => {
  console.error("\n❌ Protocol deployment failed:", error.message || error);
  process.exit(1);
});
