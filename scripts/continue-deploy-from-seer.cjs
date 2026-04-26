const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
require("dotenv").config();

function parseTokenAmount(value, fallback) {
  if (!value || !String(value).trim()) return fallback;
  return hre.ethers.parseEther(String(value).trim());
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureAddress(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized || !hre.ethers.isAddress(normalized)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return normalized;
}

function readExistingSeerAddress() {
  const manifestPath = path.resolve(process.cwd(), ".openzeppelin", "unknown-50716.json");
  if (!fs.existsSync(manifestPath)) return "";
  const payload = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const proxy = Array.isArray(payload.proxies) ? payload.proxies[0] : null;
  return proxy?.address || "";
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
    process.env.EXISTING_SEER_ADDRESS || process.env.VITE_SEER_TOKEN_ADDRESS || readExistingSeerAddress(),
    "EXISTING_SEER_ADDRESS"
  );

  console.log(`\n=== Continue SEER stack deployment on ${networkName} ===`);
  console.log("Deployer:", deployerAddress);
  console.log("Foundation:", foundationWallet);
  console.log("USDT:", usdtAddress);
  console.log("Existing SEER:", seerAddress);

  console.log("\n[1/6] Deploying MinerNode...");
  const MinerNode = await hre.ethers.getContractFactory("MinerNode");
  const minerNode = await hre.upgrades.deployProxy(MinerNode, [seerAddress], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await minerNode.waitForDeployment();
  const minerNodeAddress = await minerNode.getAddress();

  console.log("\n[2/6] Deploying AirdropManager...");
  const AirdropManager = await hre.ethers.getContractFactory("AirdropManager");
  const airdrop = await hre.upgrades.deployProxy(AirdropManager, [seerAddress], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await airdrop.waitForDeployment();
  const airdropAddress = await airdrop.getAddress();

  console.log("\n[3/6] Deploying SeerProtocol...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol");
  // SeerProtocol bytecode exceeds the EIP-170 24576-byte Spurious Dragon warning limit;
  // provide an explicit gasLimit to bypass the conservative estimateGas check on CNC.
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

  console.log("\n[4/6] Wiring contracts...");
  const seer = await hre.ethers.getContractAt("SEER", seerAddress, deployer);
  await (await minerNode.setProtocolAddress(protocolAddress)).wait();
  await (await airdrop.setProtocolAddress(protocolAddress)).wait();
  await (await protocol.setMinerNode(minerNodeAddress)).wait();
  await (await protocol.setAirdropManager(airdropAddress)).wait();
  await (await seer.setNodeRewardPool(minerNodeAddress)).wait();
  await (await seer.setTaxExemption(protocolAddress, true)).wait();
  await (await seer.setTaxExemption(minerNodeAddress, true)).wait();
  await (await seer.setTaxExemption(airdropAddress, true)).wait();

  const miningFund = parseTokenAmount(process.env.MINING_POOL_FUND_SEER, hre.ethers.parseEther("1000000"));
  const airdropFund = parseTokenAmount(process.env.AIRDROP_POOL_FUND_SEER, hre.ethers.parseEther("50000"));

  console.log("\n[5/6] Funding pools...");
  await (await seer.approve(protocolAddress, miningFund)).wait();
  await (await protocol.fundMiningPool(miningFund)).wait();
  await (await seer.approve(airdropAddress, airdropFund)).wait();
  await (await airdrop.fundAirdropPool(airdropFund)).wait();

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
  const stampedFile = path.join(networkDir, `${stamp}.json`);
  fs.writeFileSync(stampedFile, JSON.stringify(output, null, 2), "utf8");

  console.log("\n[6/6] Writing env hints...");
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

  console.log("\n✅ Continued deployment complete.");
  console.log("Saved:", latestFile);
}

main().catch((error) => {
  console.error("\n❌ Continue deployment failed:", error);
  process.exit(1);
});