const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const TRANSFER_ABI = [
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "function decimals() view returns(uint8)",
];

const KNT_ABI = [
  "function processedUsdtDeposits(bytes32) view returns(bool)",
  "function processUsdtDeposit(address,uint256,bytes32,uint256,uint256,uint256,uint256,uint256,uint256) returns(uint256)",
  "event UsdtDeposited(address indexed user,uint256 usdtAmount,uint256 kntUsed,uint256 labubuUsed,uint256 lpAmount,uint256 lpValueUsdt)",
  "event LiquidityKntBurned(address indexed account,uint256 amount)",
  "event RewardDistributed(address indexed user,address indexed operator,uint256 amount)",
];

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, jsonReplacer, 2));
}

async function wait(txPromise) {
  const tx = await txPromise;
  return tx.wait();
}

async function getLogsChunked(provider, filter, fromBlock, toBlock, chunkSize) {
  const logs = [];
  for (let from = fromBlock; from <= toBlock; from += chunkSize) {
    const to = Math.min(toBlock, from + chunkSize - 1);
    logs.push(...await provider.getLogs({ ...filter, fromBlock: from, toBlock: to }));
  }
  return logs;
}

function formatKntReceipt(knt, receipt) {
  const details = {
    liquidityKntBurned: "0.0",
    liquidityKntBurnedRaw: "0",
    rewardsDistributed: [],
  };

  for (const log of receipt.logs || []) {
    try {
      const parsed = knt.interface.parseLog(log);
      if (!parsed) continue;

      if (parsed.name === "UsdtDeposited") {
        details.kntUsed = hre.ethers.formatEther(parsed.args.kntUsed);
        details.kntUsedRaw = parsed.args.kntUsed.toString();
        details.labubuUsed = hre.ethers.formatEther(parsed.args.labubuUsed);
        details.labubuUsedRaw = parsed.args.labubuUsed.toString();
        details.lpAmount = hre.ethers.formatEther(parsed.args.lpAmount);
        details.lpAmountRaw = parsed.args.lpAmount.toString();
        details.lpValueUsdt = hre.ethers.formatEther(parsed.args.lpValueUsdt);
        details.lpValueUsdtRaw = parsed.args.lpValueUsdt.toString();
      }

      if (parsed.name === "LiquidityKntBurned") {
        const previous = BigInt(details.liquidityKntBurnedRaw || "0");
        const next = previous + parsed.args.amount;
        details.liquidityKntBurned = hre.ethers.formatEther(next);
        details.liquidityKntBurnedRaw = next.toString();
      }

      if (parsed.name === "RewardDistributed") {
        details.rewardsDistributed.push({
          user: parsed.args.user,
          operator: parsed.args.operator,
          amount: hre.ethers.formatEther(parsed.args.amount),
          rawAmount: parsed.args.amount.toString(),
        });
      }
    } catch (_error) {
      // Ignore non-KNT logs from the same transaction.
    }
  }

  return details;
}

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required for keeper processing");
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "bscTestnet", "knt-pancake-test-pool.json");
  const deployment = readJson(deploymentPath);
  if (!deployment.KNTAllInOne || !deployment.USDT) {
    throw new Error(`Missing KNTAllInOne or USDT in ${deploymentPath}`);
  }

  const [keeper] = await hre.ethers.getSigners();
  const keeperAddress = await keeper.getAddress();
  const provider = hre.ethers.provider;
  const latestBlock = await provider.getBlockNumber();

  const logPath = path.join(__dirname, "..", "deployments", "bscTestnet", "admin-keeper-log.json");
  const configuredStartBlock = Number(process.env.KEEPER_START_BLOCK || deployment.deployedAtBlock || 0);
  const adminLog = readJson(logPath, {
    network: hre.network.name,
    chainId: Number((await provider.getNetwork()).chainId),
    contract: deployment.KNTAllInOne,
    usdt: deployment.USDT,
    lastScannedBlock: configuredStartBlock,
    runs: [],
    deposits: [],
  });
  adminLog.network = hre.network.name;
  adminLog.chainId = Number((await provider.getNetwork()).chainId);
  adminLog.contract = deployment.KNTAllInOne;
  adminLog.usdt = deployment.USDT;

  const fromBlock = Number(
    process.env.KEEPER_FROM_BLOCK || Math.max(Number(adminLog.lastScannedBlock || 0), configuredStartBlock)
  );
  const confirmations = Number(process.env.KEEPER_CONFIRMATIONS || 3);
  const confirmedToBlock = Math.max(0, latestBlock - confirmations);
  const maxScanBlocks = Number(process.env.KEEPER_SCAN_MAX_BLOCKS || 100);
  const toBlock = Number(
    process.env.KEEPER_TO_BLOCK ||
      (maxScanBlocks > 0 ? Math.min(confirmedToBlock, fromBlock + maxScanBlocks - 1) : confirmedToBlock)
  );
  if (toBlock < fromBlock) {
    console.log(`No confirmed blocks to scan. from=${fromBlock}, to=${toBlock}, latest=${latestBlock}`);
    return;
  }

  const usdt = new hre.ethers.Contract(deployment.USDT, TRANSFER_ABI, provider);
  const knt = new hre.ethers.Contract(deployment.KNTAllInOne, KNT_ABI, keeper);
  const transferTopic = usdt.interface.getEvent("Transfer").topicHash;
  const toTopic = hre.ethers.zeroPadValue(deployment.KNTAllInOne, 32);

  const logChunkBlocks = Number(process.env.KEEPER_LOG_CHUNK_BLOCKS || 20);
  const logs = await getLogsChunked(
    provider,
    {
      address: deployment.USDT,
      topics: [transferTopic, null, toTopic],
    },
    fromBlock,
    toBlock,
    logChunkBlocks
  );

  const deadlineSeconds = Number(process.env.KEEPER_DEADLINE_SECONDS || 1200);
  const run = {
    startedAt: new Date().toISOString(),
    keeper: keeperAddress,
    fromBlock,
    toBlock,
    discovered: logs.length,
    processed: 0,
    skipped: 0,
    failed: 0,
  };

  const coder = hre.ethers.AbiCoder.defaultAbiCoder();
  for (const log of logs) {
    const parsed = usdt.interface.parseLog(log);
    const account = parsed.args.from;
    const amount = parsed.args.value;
    const depositId = hre.ethers.keccak256(coder.encode(["bytes32", "uint256"], [log.transactionHash, log.index]));
    const entry = {
      detectedAt: new Date().toISOString(),
      status: "detected",
      depositId,
      user: account,
      amount: hre.ethers.formatEther(amount),
      rawAmount: amount,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.index,
    };

    try {
      if (await knt.processedUsdtDeposits(depositId)) {
        entry.status = "skipped";
        entry.reason = "already processed on-chain";
        run.skipped += 1;
      } else {
        const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
        const receipt = await wait(
          knt.processUsdtDeposit(account, amount, depositId, 0, 0, 0, 0, 0, deadline)
        );
        entry.status = "processed";
        entry.processedAt = new Date().toISOString();
        entry.processTx = receipt.hash;
        Object.assign(entry, formatKntReceipt(knt, receipt));
        run.processed += 1;
      }
    } catch (error) {
      entry.status = "failed";
      entry.error = error.shortMessage || error.message;
      run.failed += 1;
    }

    adminLog.deposits.push(entry);
    writeJson(logPath, adminLog);
    console.log(`${entry.status}: ${entry.user} ${entry.amount} USDT ${entry.txHash}`);
  }

  run.finishedAt = new Date().toISOString();
  adminLog.lastScannedBlock = toBlock + 1;
  adminLog.runs.push(run);
  writeJson(logPath, adminLog);
  console.log(`Keeper run written to ${logPath}`);
  console.log(JSON.stringify(run, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
