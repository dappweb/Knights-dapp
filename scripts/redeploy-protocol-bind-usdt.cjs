const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
require("dotenv").config();

function requiredEnv(name, fallback = "") {
  const value = process.env[name] || fallback;
  if (!value || !String(value).trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return value.trim();
}

function upsertEnvValue(content, key, value) {
  const line = `${key}=${value ?? ""}`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

async function ensureUsdtAddress(signer) {
  let usdtAddress = (process.env.USDT_TOKEN_ADDRESS || process.env.VITE_USDT_ADDRESS || "").trim();
  if (!usdtAddress) {
    throw new Error("USDT address is missing in env");
  }

  const code = await hre.ethers.provider.getCode(usdtAddress);
  if (code !== "0x") {
    return { usdtAddress, deployedNew: false };
  }

  console.log(`⚠️  USDT address has no contract code: ${usdtAddress}`);
  console.log("Deploying new MockUSDT on CNC Mainnet...");
  const MockUSDT = await hre.ethers.getContractFactory("MockUSDT", signer);
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();
  usdtAddress = await usdt.getAddress();
  return { usdtAddress, deployedNew: true };
}

async function syncProtocolConfig(oldProtocol, newProtocol) {
  const oldStateAbi = [
    "function basicMinerCycleDays() view returns (uint256)",
    "function v1MinerCycleDays() view returns (uint256)",
    "function v2MinerCycleDays() view returns (uint256)",
    "function v3MinerCycleDays() view returns (uint256)",
    "function seerPurchaseFeeBP() view returns (uint256)",
    "function nurtureRewardPerLayerBP() view returns (uint256)",
    "function nurtureRewardMaxLayers() view returns (uint256)",
    "function nodeSaleOpen() view returns (bool)",
    "function minerSaleOpen() view returns (bool)",
    "function salePhase() view returns (uint8)",
    "function paused() view returns (bool)",
  ];

  const oldView = new hre.ethers.Contract(oldProtocol, oldStateAbi, newProtocol.runner);

  const [
    basicDays,
    v1Days,
    v2Days,
    v3Days,
    seerFeeBP,
    perLayerBP,
    maxLayers,
    nodeSaleOpen,
    minerSaleOpen,
    salePhase,
    paused,
  ] = await Promise.all([
    oldView.basicMinerCycleDays(),
    oldView.v1MinerCycleDays(),
    oldView.v2MinerCycleDays(),
    oldView.v3MinerCycleDays(),
    oldView.seerPurchaseFeeBP(),
    oldView.nurtureRewardPerLayerBP(),
    oldView.nurtureRewardMaxLayers(),
    oldView.nodeSaleOpen(),
    oldView.minerSaleOpen(),
    oldView.salePhase(),
    oldView.paused(),
  ]);

  await (await newProtocol.setMinerCycleDays(basicDays, v1Days, v2Days, v3Days)).wait();
  await (await newProtocol.setSeerPurchaseFeeBP(seerFeeBP)).wait();
  await (await newProtocol.setNurtureRewardConfig(perLayerBP, maxLayers)).wait();
  await (await newProtocol.setNodeSaleOpen(nodeSaleOpen)).wait();
  await (await newProtocol.setMinerSaleOpen(minerSaleOpen)).wait();

  if (Number(salePhase) === 1) {
    await (await newProtocol.switchToMinerPhase()).wait();
  }

  if (paused) {
    await (await newProtocol.setPaused(true)).wait();
  }
}

async function migrateMiningPool(oldProtocolAddress, newProtocolAddress, seerAddress, signer) {
  const oldAbi = [
    "function owner() view returns (address)",
    "function miningPoolRemaining() view returns (uint256)",
    "function emergencyWithdrawToken(address token, uint256 amount)",
  ];
  const oldProtocol = new hre.ethers.Contract(oldProtocolAddress, oldAbi, signer);

  const seer = new hre.ethers.Contract(
    seerAddress,
    [
      "function balanceOf(address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
    ],
    signer
  );

  const owner = await oldProtocol.owner();
  const signerAddress = await signer.getAddress();
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    console.log("⚠️  Skip mining pool migration: signer is not old protocol owner.");
    return 0n;
  }

  const remaining = await oldProtocol.miningPoolRemaining();
  if (remaining === 0n) {
    console.log("Old protocol miningPoolRemaining is 0, no migration needed.");
    return 0n;
  }

  const before = await seer.balanceOf(signerAddress);
  await (await oldProtocol.emergencyWithdrawToken(seerAddress, remaining)).wait();
  const after = await seer.balanceOf(signerAddress);
  const moved = after - before;

  if (moved > 0n) {
    const newProtocol = new hre.ethers.Contract(
      newProtocolAddress,
      ["function fundMiningPool(uint256 amount)"],
      signer
    );
    await (await seer.approve(newProtocolAddress, moved)).wait();
    await (await newProtocol.fundMiningPool(moved)).wait();
  }

  return moved;
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const networkName = hre.network.name;

  const oldProtocolAddress = requiredEnv("VITE_PROTOCOL_ADDRESS", process.env.PROTOCOL_ADDRESS || "");
  const seerAddress = requiredEnv("VITE_SEER_TOKEN_ADDRESS", process.env.SEER_TOKEN_ADDRESS || "");
  const minerNodeAddress = requiredEnv("VITE_MINER_NODE_ADDRESS", process.env.MINER_NODE_ADDRESS || "");
  const airdropAddress = requiredEnv("VITE_AIRDROP_ADDRESS", process.env.AIRDROP_ADDRESS || "");
  const foundationWallet = (process.env.TREASURY_WALLET || signerAddress).trim();

  const { usdtAddress, deployedNew } = await ensureUsdtAddress(signer);

  console.log("\n=== Redeploy Protocol Bind USDT ===");
  console.log("Network:", networkName);
  console.log("Signer:", signerAddress);
  console.log("Old Protocol:", oldProtocolAddress);
  console.log("USDT:", usdtAddress, deployedNew ? "(newly deployed)" : "(existing)");
  console.log("SEER:", seerAddress);
  console.log("MinerNode:", minerNodeAddress);
  console.log("Airdrop:", airdropAddress);
  console.log("Foundation:", foundationWallet);

  console.log("\n[1/6] Deploying new SeerProtocol proxy...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol", signer);
  const newProtocol = await hre.upgrades.deployProxy(
    SeerProtocol,
    [usdtAddress, seerAddress, foundationWallet],
    {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["constructor", "state-variable-assignment"],
    }
  );
  await newProtocol.waitForDeployment();
  const newProtocolAddress = await newProtocol.getAddress();
  console.log("New Protocol:", newProtocolAddress);

  console.log("\n[2/6] Wiring external contracts...");
  const minerNode = new hre.ethers.Contract(minerNodeAddress, ["function setProtocolAddress(address)"], signer);
  const airdrop = new hre.ethers.Contract(airdropAddress, ["function setProtocolAddress(address)"], signer);

  await (await minerNode.setProtocolAddress(newProtocolAddress)).wait();
  await (await airdrop.setProtocolAddress(newProtocolAddress)).wait();
  await (await newProtocol.setMinerNode(minerNodeAddress)).wait();
  await (await newProtocol.setAirdropManager(airdropAddress)).wait();

  console.log("\n[3/6] Applying SEER permissions...");
  const seer = new hre.ethers.Contract(seerAddress, ["function setTaxExemption(address,bool)"], signer);
  await (await seer.setTaxExemption(newProtocolAddress, true)).wait();

  console.log("\n[4/6] Syncing protocol configuration from old proxy...");
  await syncProtocolConfig(oldProtocolAddress, newProtocol);

  console.log("\n[5/6] Migrating mining pool balance from old protocol...");
  const movedMiningPool = await migrateMiningPool(oldProtocolAddress, newProtocolAddress, seerAddress, signer);
  console.log("Moved mining pool (SEER):", hre.ethers.formatEther(movedMiningPool));

  console.log("\n[6/6] Updating env and deployment records...");
  const envPath = path.resolve(process.cwd(), ".env");
  const envProdPath = path.resolve(process.cwd(), ".env.production");

  let envContent = fs.readFileSync(envPath, "utf8");
  envContent = upsertEnvValue(envContent, "USDT_TOKEN_ADDRESS", usdtAddress);
  envContent = upsertEnvValue(envContent, "VITE_USDT_ADDRESS", usdtAddress);
  envContent = upsertEnvValue(envContent, "PROTOCOL_ADDRESS", newProtocolAddress);
  envContent = upsertEnvValue(envContent, "VITE_PROTOCOL_ADDRESS", newProtocolAddress);
  fs.writeFileSync(envPath, envContent, "utf8");

  if (fs.existsSync(envProdPath)) {
    let envProd = fs.readFileSync(envProdPath, "utf8");
    envProd = upsertEnvValue(envProd, "VITE_USDT_ADDRESS", usdtAddress);
    envProd = upsertEnvValue(envProd, "VITE_PROTOCOL_ADDRESS", newProtocolAddress);
    fs.writeFileSync(envProdPath, envProd, "utf8");
  }

  const output = {
    network: networkName,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: signerAddress,
    timestamp: new Date().toISOString(),
    contracts: {
      usdt: usdtAddress,
      seer: seerAddress,
      protocol: newProtocolAddress,
      minerNode: minerNodeAddress,
      airdrop: airdropAddress,
    },
    migratedMiningPoolSeer: hre.ethers.formatEther(movedMiningPool),
    note: deployedNew
      ? "USDT env target had no bytecode; deployed new MockUSDT and rebound protocol."
      : "Rebound protocol to existing USDT address from env.",
  };

  const baseDir = path.resolve(process.cwd(), "deployments");
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  const latestFile = path.join(baseDir, `${networkName}.latest.json`);
  fs.writeFileSync(latestFile, JSON.stringify(output, null, 2), "utf8");

  const networkDir = path.join(baseDir, networkName);
  if (!fs.existsSync(networkDir)) fs.mkdirSync(networkDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(networkDir, `${stamp}.json`), JSON.stringify(output, null, 2), "utf8");

  console.log("\n✅ Done.");
  console.log("USDT:", usdtAddress);
  console.log("Protocol:", newProtocolAddress);
}

main().catch((error) => {
  console.error("\n❌ Redeploy bind USDT failed:", error);
  process.exit(1);
});
