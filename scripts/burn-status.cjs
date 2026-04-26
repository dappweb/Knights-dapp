#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { ethers } = require("ethers");

for (const file of [".env", ".env.production", ".env.local"]) {
  const fullPath = path.resolve(__dirname, "..", file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false });
  }
}

const rpcUrl = process.env.VITE_RPC_URL || process.env.RPC_URL || process.env.VITE_CNC_MAINNET_RPC_URL || process.env.CNC_MAINNET_RPC_URL;
const seerAddress = process.env.VITE_SEER_TOKEN_ADDRESS;
const stateFile = process.env.DAILY_BURN_STATE_FILE || path.resolve(__dirname, "../runtime/daily-burn-state.json");

if (!rpcUrl || !seerAddress) {
  console.error("Missing required env: VITE_RPC_URL/RPC_URL, VITE_SEER_TOKEN_ADDRESS");
  process.exit(1);
}

const SEER_ABI = [
  "function totalBurned() view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const seer = new ethers.Contract(seerAddress, SEER_ABI, provider);

  const [network, decimals, totalBurned] = await Promise.all([
    provider.getNetwork(),
    seer.decimals(),
    seer.totalBurned(),
  ]);

  let state = null;
  if (fs.existsSync(stateFile)) {
    try {
      state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    } catch {
      state = null;
    }
  }

  console.log(JSON.stringify({
    chainId: Number(network.chainId),
    seerAddress,
    totalBurnedSeer: ethers.formatUnits(totalBurned, decimals),
    stateFile,
    lastRun: state,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});