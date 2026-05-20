const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config();

const ZERO = "0x0000000000000000000000000000000000000000";
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const direct = process.argv.find((item) => item.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function decodeAddress(topic) {
  return ethers.getAddress(`0x${topic.slice(-40)}`);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function saveJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

async function getLogsWithRetry(provider, filter, retries = 5) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await provider.getLogs(filter);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw lastError;
}

async function findCreationBlock(provider, address) {
  const latest = await provider.getBlockNumber();
  let lo = 0;
  let hi = latest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await provider.getCode(address, mid);
    if (code && code !== "0x") hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

async function main() {
  const token = ethers.getAddress(argValue("--token", process.env.EXPORT_TOKEN_ADDRESS || ""));
  const label = argValue("--label", token);
  const rpcUrl = process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org";
  const provider = new ethers.JsonRpcProvider(rpcUrl, 56, { staticNetwork: true });
  const latest = Number(argValue("--to-block", process.env.EXPORT_TO_BLOCK || await provider.getBlockNumber()));
  const fromBlock = Number(argValue("--from-block", process.env.EXPORT_FROM_BLOCK || await findCreationBlock(provider, token)));
  const chunkSize = Number(argValue("--chunk-size", process.env.EXPORT_LOG_CHUNK_BLOCKS || "50000"));
  const outDir = path.resolve(argValue("--out-dir", path.join("deployments", "bscMainnet", "migration", "holders")));
  const checkpointPath = path.join(outDir, `${label}.checkpoint.json`);
  const csvPath = path.join(outDir, `${label}.holders.csv`);
  const checkpoint = loadJson(checkpointPath, {
    token,
    label,
    fromBlock,
    nextBlock: fromBlock,
    toBlock: latest,
    balances: {},
    transferLogs: 0,
  });

  let nextBlock = Math.max(Number(checkpoint.nextBlock || fromBlock), fromBlock);
  const balances = new Map(Object.entries(checkpoint.balances || {}).map(([account, balance]) => [account, BigInt(balance)]));
  let transferLogs = Number(checkpoint.transferLogs || 0);
  while (nextBlock <= latest) {
    const scanFrom = nextBlock;
    const toBlock = Math.min(nextBlock + chunkSize - 1, latest);
    const logs = await getLogsWithRetry(provider, {
      address: token,
      topics: [TRANSFER_TOPIC],
      fromBlock: nextBlock,
      toBlock,
    });
    for (const log of logs) {
      const from = decodeAddress(log.topics[1]);
      const to = decodeAddress(log.topics[2]);
      const amount = BigInt(log.data);
      if (from !== ZERO) balances.set(from, (balances.get(from) || 0n) - amount);
      if (to !== ZERO) balances.set(to, (balances.get(to) || 0n) + amount);
    }
    transferLogs += logs.length;
    nextBlock = toBlock + 1;
    checkpoint.nextBlock = nextBlock;
    checkpoint.toBlock = latest;
    checkpoint.transferLogs = transferLogs;
    checkpoint.balances = Object.fromEntries([...balances.entries()].filter(([, balance]) => balance !== 0n).map(([account, balance]) => [account, balance.toString()]));
    saveJson(checkpointPath, checkpoint);
    console.log(JSON.stringify({ label, fromBlock: scanFrom, scannedTo: toBlock, latest, logs: logs.length, holders: Object.keys(checkpoint.balances).length }));
  }

  const rows = [...balances.entries()]
    .filter(([, balance]) => balance > 0n)
    .sort((a, b) => (a[0].toLowerCase() < b[0].toLowerCase() ? -1 : 1));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    csvPath,
    ["Address,Balance", ...rows.map(([account, balance]) => `${csvEscape(account)},${ethers.formatEther(balance)}`)].join("\n")
  );
  console.log(JSON.stringify({ ok: true, token, label, fromBlock, toBlock: latest, transferLogs, holders: rows.length, csvPath }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }, null, 2));
  process.exitCode = 1;
});
