/**
 * Deploy SeerProtocol only with proper library linking.
 * Reads existing addresses from env or OZ manifest, then wires + funds.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
require("dotenv").config();

function ensureAddress(value, name) {
  const v = String(value || "").trim();
  if (!v || !hre.ethers.isAddress(v)) throw new Error(`Invalid ${name}: "${value}"`);
  return v;
}

async function identifyProxy(address, label) {
  const provider = hre.ethers.provider;
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

  await identifyProxy(seerAddress, "SEER");
  await identifyProxy(minerNodeAddress, "MinerNode");
  await identifyProxy(airdropAddress, "AirdropManager");

  const balance = await hre.ethers.provider.getBalance(deployerAddress);
  console.log("Balance:     ", hre.ethers.formatEther(balance), "CNC");

  console.log("\n[1/5] Deploying LibSeerAdmin library...");
  const LibSeerAdmin = await hre.ethers.getContractFactory("LibSeerAdmin");
  const libAdmin = await LibSeerAdmin.deploy();
  await libAdmin.waitForDeployment();
  const libAdminAddress = await libAdmin.getAddress();
  console.log("LibSeerAdmin deployed:", libAdminAddress);

  console.log("\n[2/5] Deploying LibSeerClaim library...");
  const LibSeerClaim = await hre.ethers.getContractFactory("LibSeerClaim");
  const libClaim = await LibSeerClaim.deploy();
  await libClaim.waitForDeployment();
  const libClaimAddress = await libClaim.getAddress();
  console.log("LibSeerClaim deployed:", libClaimAddress);

  console.log("\n[3/5] Deploying SeerProtocol with linked libraries...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol", {
    libraries: {
      "contracts/lib/LibSeerAdmin.sol:LibSeerAdmin": libAdminAddress,
      "contracts/lib/LibSeerClaim.sol:LibSeerClaim": libClaimAddress,
    },
  });
  const protocol = await hre.upgrades.deployProxy(
    SeerProtocol,
    [usdtAddress, seerAddress, foundationWallet],
    {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["constructor", "external-library-linking"],
      unsafeAllowLinkedLibraries: true,
      txOverrides: { gasLimit: 10_000_000n },
    }
  );
  await protocol.waitForDeployment();
  const protocolAddress = await protocol.getAddress();
  const txHash = protocol.deploymentTransaction()?.hash || "N/A";
  console.log("SeerProtocol proxy:", protocolAddress);
  console.log("Deployment tx:", txHash);

  console.log("\n[4/5] Wiring contracts...");
  const seer = await hre.ethers.getContractAt("SEER", seerAddress, deployer);
  const minerNode = await hre.ethers.getContractAt("MinerNode", minerNodeAddress, deployer);
  const airdrop = await hre.ethers.getContractAt("AirdropManager", airdropAddress, deployer);

  let tx = await seer.setSeerProtocol(protocolAddress);
  await tx.wait();
  console.log("✓ SEER.setSeerProtocol");

  tx = await minerNode.setSeerProtocol(protocolAddress);
  await tx.wait();
  console.log("✓ MinerNode.setSeerProtocol");

  tx = await airdrop.setSeerProtocol(protocolAddress);
  await tx.wait();
  console.log("✓ AirdropManager.setSeerProtocol");

  console.log("\n[5/5] Summary");
  console.log("============");
  console.log("LibSeerAdmin:  ", libAdminAddress);
  console.log("LibSeerClaim:  ", libClaimAddress);
  console.log("SeerProtocol:  ", protocolAddress);
  console.log("Deployment Tx: ", txHash);
  console.log("Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
