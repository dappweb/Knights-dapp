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

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const isForced = args.has("--force");

const rpcUrl = process.env.VITE_RPC_URL || process.env.RPC_URL || process.env.VITE_CNC_MAINNET_RPC_URL || process.env.CNC_MAINNET_RPC_URL;
const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const seerAddress = process.env.VITE_SEER_TOKEN_ADDRESS;
const burnAmountSeer = process.env.DAILY_BURN_AMOUNT_SEER || process.env.BURN_AMOUNT_SEER;
const stateFile = process.env.DAILY_BURN_STATE_FILE || path.resolve(__dirname, "../runtime/daily-burn-state.json");
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
const telegramChatId = process.env.TELEGRAM_CHAT_ID || "";

if (!rpcUrl || !privateKey || !seerAddress) {
  console.error("Missing required env: VITE_RPC_URL/RPC_URL, PRIVATE_KEY, VITE_SEER_TOKEN_ADDRESS");
  process.exit(1);
}

const SEER_ABI = [
  "function burn(uint256 amount) external",
  "function balanceOf(address owner) view returns (uint256)",
  "function totalBurned() view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const utcDate = () => new Date().toISOString().slice(0, 10);

function readState() {
  if (!fs.existsSync(stateFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return {};
  }
}

function writeState(nextState) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(nextState, null, 2));
}

async function notifyTelegram(message) {
  if (!telegramBotToken || !telegramChatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramChatId, text: message }),
    });
  } catch (error) {
    console.warn("Telegram notify failed:", error.message || error);
  }
}

async function main() {
  if (!burnAmountSeer) {
    console.log("DAILY_BURN_AMOUNT_SEER is not configured. Skip daily burn.");
    return;
  }

  const today = utcDate();
  const state = readState();

  if (!isForced && state.lastBurnDate === today) {
    console.log(`Daily burn already executed for ${today}. tx=${state.lastTxHash || "n/a"}`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const seer = new ethers.Contract(seerAddress, SEER_ABI, signer);

  const decimals = Number(await seer.decimals());
  const amount = ethers.parseUnits(String(burnAmountSeer), decimals);
  const [network, beforeBalance, beforeTotalBurned] = await Promise.all([
    provider.getNetwork(),
    seer.balanceOf(signer.address),
    seer.totalBurned(),
  ]);

  if (beforeBalance < amount) {
    throw new Error(`Insufficient SEER balance for burn. need=${ethers.formatUnits(amount, decimals)} have=${ethers.formatUnits(beforeBalance, decimals)}`);
  }

  console.log(`Daily burn date: ${today}`);
  console.log(`Network: chainId=${network.chainId}`);
  console.log(`Signer: ${signer.address}`);
  console.log(`SEER: ${seerAddress}`);
  console.log(`Amount: ${ethers.formatUnits(amount, decimals)} SEER`);
  console.log(`Dry run: ${isDryRun}`);

  if (isDryRun) {
    return;
  }

  const tx = await seer.burn(amount);
  const receipt = await tx.wait();
  const [afterBalance, afterTotalBurned] = await Promise.all([
    seer.balanceOf(signer.address),
    seer.totalBurned(),
  ]);

  const burnedDelta = afterTotalBurned - beforeTotalBurned;
  writeState({
    lastBurnDate: today,
    lastTxHash: tx.hash,
    lastBurnAmountSeer: ethers.formatUnits(amount, decimals),
    burnedDeltaSeer: ethers.formatUnits(burnedDelta, decimals),
    signer: signer.address,
    seerAddress,
    chainId: Number(network.chainId),
    blockNumber: receipt.blockNumber,
    updatedAt: new Date().toISOString(),
  });

  console.log(`Burn success. tx=${tx.hash}`);
  console.log(`Balance: ${ethers.formatUnits(beforeBalance, decimals)} -> ${ethers.formatUnits(afterBalance, decimals)}`);
  console.log(`Total burned: ${ethers.formatUnits(beforeTotalBurned, decimals)} -> ${ethers.formatUnits(afterTotalBurned, decimals)}`);

  await notifyTelegram(`SEER daily burn success\nDate: ${today}\nAmount: ${ethers.formatUnits(amount, decimals)} SEER\nTx: ${tx.hash}`);
}

main().catch(async (error) => {
  console.error("Daily burn failed:", error.message || error);
  await notifyTelegram(`SEER daily burn failed\nDate: ${utcDate()}\nError: ${error.message || error}`);
  process.exit(1);
});