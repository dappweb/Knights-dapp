const path = require("path");
const dotenv = require("dotenv");
const hre = require("hardhat");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const SEER_ABI = [
  "function owner() view returns (address)",
  "function foundationWallet() view returns (address)",
  "function nodeRewardPool() view returns (address)",
  "function taxEnabled() view returns (bool)",
  "function isTaxedPair(address pair) view returns (bool)",
  "function isExemptFromTax(address account) view returns (bool)",
  "function totalBurned() view returns (uint256)",
  "function totalNodeRewards() view returns (uint256)",
  "function totalFoundationFees() view returns (uint256)",
];

function requiredEnv(name, fallback = "") {
  const value = process.env[name] || fallback;
  if (!value || !String(value).trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return value.trim();
}

async function main() {
  const seerAddress = requiredEnv("VITE_SEER_TOKEN_ADDRESS", process.env.SEER_TOKEN_ADDRESS || "");
  const pairAddress = requiredEnv("DEX_PAIR_ADDRESS", process.env.VITE_DEX_PAIR_ADDRESS || "");
  const protocolAddress = process.env.VITE_PROTOCOL_ADDRESS || process.env.PROTOCOL_ADDRESS || "";
  const minerNodeAddress = process.env.VITE_MINER_NODE_ADDRESS || process.env.MINER_NODE_ADDRESS || "";
  const airdropAddress = process.env.VITE_AIRDROP_ADDRESS || process.env.AIRDROP_ADDRESS || "";

  const [signer] = await hre.ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const seer = await hre.ethers.getContractAt(SEER_ABI, seerAddress, signer);

  const [
    owner,
    foundationWallet,
    nodeRewardPool,
    taxEnabled,
    isTaxedPair,
    totalBurned,
    totalNodeRewards,
    totalFoundationFees,
  ] = await Promise.all([
    seer.owner(),
    seer.foundationWallet(),
    seer.nodeRewardPool(),
    seer.taxEnabled(),
    seer.isTaxedPair(pairAddress),
    seer.totalBurned(),
    seer.totalNodeRewards(),
    seer.totalFoundationFees(),
  ]);

  const checks = [];
  if (protocolAddress) {
    checks.push({ label: "Protocol exempt", address: protocolAddress, ok: await seer.isExemptFromTax(protocolAddress) });
  }
  if (minerNodeAddress) {
    checks.push({ label: "MinerNode exempt", address: minerNodeAddress, ok: await seer.isExemptFromTax(minerNodeAddress) });
  }
  if (airdropAddress) {
    checks.push({ label: "Airdrop exempt", address: airdropAddress, ok: await seer.isExemptFromTax(airdropAddress) });
  }

  console.log("\n=== SEER Tax Config Check ===");
  console.log("Network:", hre.network.name);
  console.log("Signer:", signerAddress);
  console.log("SEER:", seerAddress);
  console.log("Pair:", pairAddress);
  console.log("Owner:", owner);
  console.log("Foundation:", foundationWallet);
  console.log("NodeRewardPool:", nodeRewardPool);
  console.log("taxEnabled:", taxEnabled);
  console.log("isTaxedPair:", isTaxedPair);
  console.log("totalBurned:", hre.ethers.formatEther(totalBurned));
  console.log("totalNodeRewards:", hre.ethers.formatEther(totalNodeRewards));
  console.log("totalFoundationFees:", hre.ethers.formatEther(totalFoundationFees));

  if (checks.length > 0) {
    console.log("\nExemption checks:");
    for (const item of checks) {
      console.log(`- ${item.label}: ${item.ok ? "OK" : "MISSING"} (${item.address})`);
    }
  }

  const failed = [];
  if (!taxEnabled) failed.push("taxEnabled is false");
  if (!isTaxedPair) failed.push("DEX_PAIR_ADDRESS is not marked as taxed pair");

  if (failed.length > 0) {
    console.error("\n❌ Tax config validation failed:");
    for (const item of failed) console.error("-", item);
    process.exit(2);
  }

  console.log("\n✅ Tax config validation passed.");
}

main().catch((error) => {
  console.error("\n❌ verify-tax-config failed:", error.message || error);
  process.exit(1);
});
