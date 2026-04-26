import fs from "fs";
import path from "path";
import hre from "hardhat";
import dotenv from "dotenv";

dotenv.config();

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function printAddress(label, value) {
  console.log(`${label}: ${value || "(missing)"}`);
}

async function printTokenMeta(label, address) {
  if (!address) return;
  try {
    const token = await hre.ethers.getContractAt([
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)"
    ], address);
    const [symbol, decimals] = await Promise.all([
      token.symbol().catch(() => "?"),
      token.decimals().catch(() => -1),
    ]);
    console.log(`${label} meta: ${symbol} / decimals=${Number(decimals)}`);
  } catch (error) {
    console.log(`${label} meta: unreadable (${error.message || error})`);
  }
}

async function main() {
  const networkName = hre.network.name;
  const chain = await hre.ethers.provider.getNetwork();
  const latestFile = path.resolve(process.cwd(), "deployments", `${networkName}.latest.json`);
  const deployment = readJsonIfExists(latestFile);

  console.log(`\n=== Network Check: ${networkName} ===`);
  console.log(`Chain ID: ${Number(chain.chainId)}`);
  console.log(`Latest deployment file: ${fs.existsSync(latestFile) ? latestFile : "not found"}`);

  if (deployment) {
    console.log("\nFrom deployment file:");
    printAddress("USDT", deployment?.contracts?.usdt);
    printAddress("SEER", deployment?.contracts?.seer);
    printAddress("Protocol", deployment?.contracts?.protocol);
    printAddress("MinerNode", deployment?.contracts?.minerNode);
    printAddress("Airdrop", deployment?.contracts?.airdrop);
    await printTokenMeta("Deployment USDT", deployment?.contracts?.usdt);
  }

  console.log("\nFrom env:");
  printAddress("VITE_USDT_ADDRESS", process.env.VITE_USDT_ADDRESS || process.env.USDT_TOKEN_ADDRESS);
  printAddress("VITE_SEER_TOKEN_ADDRESS", process.env.VITE_SEER_TOKEN_ADDRESS);
  printAddress("VITE_PROTOCOL_ADDRESS", process.env.VITE_PROTOCOL_ADDRESS);
  printAddress("VITE_MINER_NODE_ADDRESS", process.env.VITE_MINER_NODE_ADDRESS);
  printAddress("VITE_AIRDROP_ADDRESS", process.env.VITE_AIRDROP_ADDRESS);
  await printTokenMeta("Env USDT", process.env.VITE_USDT_ADDRESS || process.env.USDT_TOKEN_ADDRESS);

  console.log("\n✅ Network check complete.");
}

main().catch((error) => {
  console.error("\n❌ Network check failed:", error);
  process.exit(1);
});
