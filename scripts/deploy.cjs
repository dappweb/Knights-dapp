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

const TX_CONFIRMATIONS = Math.max(1, Number(process.env.DEPLOY_TX_CONFIRMATIONS || "1"));

async function waitForTx(tx, label) {
  const receipt = await tx.wait(TX_CONFIRMATIONS);
  if (!receipt || receipt.status !== 1n) {
    throw new Error(`${label} transaction failed`);
  }
  return receipt;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const networkName = hre.network.name;
  const deployerAddress = await deployer.getAddress();
  const foundationWallet = process.env.TREASURY_WALLET || deployerAddress;

  console.log(`\n=== Deploying SEER stack to ${networkName} ===`);
  console.log("Deployer:", deployerAddress);
  console.log("Foundation:", foundationWallet);

  const existingUsdt = process.env.USDT_TOKEN_ADDRESS || process.env.VITE_USDT_ADDRESS || "";
  let usdtAddress = existingUsdt;

  if (!usdtAddress) {
    console.log("\n[1/7] Deploying MockUSDT...");
    const MockUSDT = await hre.ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();
    usdtAddress = await usdt.getAddress();
  } else {
    console.log("\n[1/7] Reusing USDT:", usdtAddress);
  }

  console.log("\n[2/7] Deploying SEER...");
  const SEER = await hre.ethers.getContractFactory("SEER");
  const seer = await hre.upgrades.deployProxy(
    SEER,
    [foundationWallet, deployerAddress],
    {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["constructor", "state-variable-assignment"],
    }
  );
  await seer.waitForDeployment();
  const seerAddress = await seer.getAddress();

  console.log("\n[3/7] Deploying MinerNode...");
  const MinerNode = await hre.ethers.getContractFactory("MinerNode");
  const minerNode = await hre.upgrades.deployProxy(MinerNode, [seerAddress], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await minerNode.waitForDeployment();
  const minerNodeAddress = await minerNode.getAddress();

  console.log("\n[4/7] Deploying AirdropManager...");
  const AirdropManager = await hre.ethers.getContractFactory("AirdropManager");
  const airdrop = await hre.upgrades.deployProxy(AirdropManager, [seerAddress], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await airdrop.waitForDeployment();
  const airdropAddress = await airdrop.getAddress();

  console.log("\n[5/7] Deploying SeerProtocol...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol");
  const protocol = await hre.upgrades.deployProxy(
    SeerProtocol,
    [usdtAddress, seerAddress, foundationWallet],
    {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["constructor"],
    }
  );
  await protocol.waitForDeployment();
  const protocolAddress = await protocol.getAddress();

  console.log("\n[6/7] Wiring contracts...");
  await waitForTx(await minerNode.setProtocolAddress(protocolAddress), "minerNode.setProtocolAddress");
  await waitForTx(await airdrop.setProtocolAddress(protocolAddress), "airdrop.setProtocolAddress");
  await waitForTx(await protocol.setMinerNode(minerNodeAddress), "protocol.setMinerNode");
  await waitForTx(await protocol.setAirdropManager(airdropAddress), "protocol.setAirdropManager");
  await waitForTx(await seer.setNodeRewardPool(minerNodeAddress), "seer.setNodeRewardPool");
  await waitForTx(await seer.setTaxExemption(protocolAddress, true), "seer.setTaxExemption(protocol)");
  await waitForTx(await seer.setTaxExemption(minerNodeAddress, true), "seer.setTaxExemption(minerNode)");
  await waitForTx(await seer.setTaxExemption(airdropAddress, true), "seer.setTaxExemption(airdrop)");

  const miningFund = parseTokenAmount(process.env.MINING_POOL_FUND_SEER, hre.ethers.parseEther("1000000"));
  const airdropFund = parseTokenAmount(process.env.AIRDROP_POOL_FUND_SEER, hre.ethers.parseEther("50000"));

  console.log("\n[7/7] Funding pools...");
  await waitForTx(await seer.approve(protocolAddress, miningFund), "seer.approve(protocol)");
  await waitForTx(await protocol.fundMiningPool(miningFund), "protocol.fundMiningPool");
  await waitForTx(await seer.approve(airdropAddress, airdropFund), "seer.approve(airdrop)");
  await waitForTx(await airdrop.fundAirdropPool(airdropFund), "airdrop.fundAirdropPool");

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

  console.log("\n✅ Deployment complete.");
  console.log("USDT:", usdtAddress);
  console.log("SEER:", seerAddress);
  console.log("Protocol:", protocolAddress);
  console.log("MinerNode:", minerNodeAddress);
  console.log("AirdropManager:", airdropAddress);
  console.log("Saved:", latestFile);
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:", error);
  process.exit(1);
});
