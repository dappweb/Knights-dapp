const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
require("dotenv").config();

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const DEFAULT_OLD_KNT = "0xc59D5f8EaAE58BcBde67099F103c8Be06f999999";
const DEFAULT_OLD_LP = "0xe9a8272e1bd69f4201F4804f13C0527CA0B99C50";
const ROOT = path.resolve(__dirname, "..");

const OLD_KNT_ABI = [
  "function balanceOf(address) view returns(uint256)",
  "function totalSupply() view returns(uint256)",
  "function totalLpNumber() view returns(uint256)",
  "function totalLpU() view returns(uint256)",
  "function totalLpPower() view returns(uint256)",
  "function totalLpUPower() view returns(uint256)",
  "function totalNodes() view returns(uint256)",
  "function queueLen() view returns(uint256)",
  "function effectiveLpCount() view returns(uint256)",
  "function referee(address) view returns(address)",
  "function pendingReferrer(address) view returns(address)",
  "function users(address) view returns(uint256 lpU,uint256 lpNumber,uint256 lpPower,uint256 lpUPower,uint256 index,uint256 nodeIndex,uint256 pendingLP,uint256 pendingNode,uint256 refLpU,uint256 directCount,uint256 allDirectCount,uint256 teamLpU,uint256 teamDecLpU,uint256 teamNodeCount,uint256 direNodeCount,uint256 teamValidAccount,bool isNode)",
  "function pending2(address) view returns(tuple(uint256 lpU,uint256 lpNumber,uint256 lpPower,uint256 lpUPower,uint256 index,uint256 nodeIndex,uint256 pendingLP,uint256 pendingNode,uint256 refLpU,uint256 directCount,uint256 allDirectCount,uint256 teamLpU,uint256 teamDecLpU,uint256 teamNodeCount,uint256 direNodeCount,uint256 teamValidAccount,bool isNode))",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns(uint256)",
  "function totalSupply() view returns(uint256)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
];

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const direct = process.argv.find((item) => item.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function normalize(address) {
  try {
    return ethers.getAddress(String(address || "").trim());
  } catch (_error) {
    return "";
  }
}

function parseDecimalToWei(value, decimals = 18) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text || text === "-") return 0n;
  return ethers.parseUnits(text, decimals);
}

function format(value) {
  return ethers.formatEther(BigInt(value || 0));
}

function readJson(filePath, fallback) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function splitCsvLine(line) {
  const out = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function readHolderCsv(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return new Map();
  const lines = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return new Map();
  const headers = splitCsvLine(lines[0]).map((item) => item.trim().toLowerCase());
  const addressIndex = headers.findIndex((item) => item.includes("address") || item.includes("holder"));
  const balanceIndex = headers.findIndex((item) => item.includes("balance") || item.includes("quantity") || item.includes("amount"));
  if (addressIndex < 0 || balanceIndex < 0) throw new Error(`Cannot detect address/balance columns in ${filePath}`);
  const rows = new Map();
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const account = normalize(cells[addressIndex]);
    if (!account) continue;
    rows.set(account, parseDecimalToWei(cells[balanceIndex]));
  }
  return rows;
}

async function withConcurrency(items, limit, worker) {
  const results = [];
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function safeCall(fn, fallback) {
  try {
    return await fn();
  } catch (_error) {
    return fallback;
  }
}

async function main() {
  const deploymentPath = path.join(ROOT, "deployments", "bscMainnet", "knt-upgradeable-mainnet.json");
  const deployment = readJson(deploymentPath, {});
  const oldKntAddress = normalize(argValue("--old-knt", process.env.OLD_KNT_ADDRESS || DEFAULT_OLD_KNT));
  const oldLpAddress = normalize(argValue("--old-lp", process.env.OLD_KNT_LP_ADDRESS || DEFAULT_OLD_LP));
  const newKntAddress = normalize(argValue("--new-knt", process.env.KNT_CONTRACT_ADDRESS || deployment.KNTAllInOne || ""));
  const treePath = argValue("--tree", path.join(process.env.USERPROFILE || "", "Downloads", "Telegram Desktop", "dump.json"));
  const tokenCsvPath = argValue("--token-csv", process.env.KNT_TOKEN_HOLDERS_CSV || "");
  const lpCsvPath = argValue("--lp-csv", process.env.KNT_LP_HOLDERS_CSV || "");
  const outputPath = argValue("--out", path.join(ROOT, "deployments", "bscMainnet", "migration", "knt-mainnet-migration-state.json"));
  const rootReferrer = normalize(argValue("--root-referrer", process.env.MIGRATION_ROOT_REFERRER || deployment.deployer || ""));
  const limit = Number(argValue("--limit", process.env.MIGRATION_BUILD_LIMIT || "0"));
  const rpcUrl = process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org";
  if (!oldKntAddress || !oldLpAddress || !newKntAddress || !rootReferrer) {
    throw new Error("Missing old KNT, old LP, new KNT, or root referrer address");
  }

  const treeRows = readJson(treePath, []);
  const tokenHolders = readHolderCsv(tokenCsvPath);
  const lpHolders = readHolderCsv(lpCsvPath);
  const accounts = new Map();
  for (const row of Array.isArray(treeRows) ? treeRows : []) {
    const account = normalize(row.user || row.account || row.address);
    if (!account) continue;
    accounts.set(account, { account, parent: normalize(row.parent || row.referrer), source: ["tree"] });
  }
  for (const [account, balance] of tokenHolders) {
    const entry = accounts.get(account) || { account, parent: "", source: [] };
    entry.oldKntCsvBalance = balance.toString();
    entry.source.push("tokenCsv");
    accounts.set(account, entry);
  }
  for (const [account, balance] of lpHolders) {
    const entry = accounts.get(account) || { account, parent: "", source: [] };
    entry.oldLpCsvBalance = balance.toString();
    entry.source.push("lpCsv");
    accounts.set(account, entry);
  }

  const excluded = new Set([
    ZERO.toLowerCase(),
    DEAD.toLowerCase(),
    oldKntAddress.toLowerCase(),
    oldLpAddress.toLowerCase(),
    newKntAddress.toLowerCase(),
    ...(process.env.MIGRATION_EXCLUDED_ADDRESSES || "")
      .split(",")
      .map((item) => normalize(item).toLowerCase())
      .filter(Boolean),
  ]);
  const accountList = [...accounts.keys()].filter((account) => !excluded.has(account.toLowerCase()));
  const selectedAccounts = limit > 0 ? accountList.slice(0, limit) : accountList;

  const provider = new ethers.JsonRpcProvider(rpcUrl, 56, { staticNetwork: true });
  const oldKnt = new ethers.Contract(oldKntAddress, OLD_KNT_ABI, provider);
  const oldLp = new ethers.Contract(oldLpAddress, ERC20_ABI, provider);
  const blockNumber = await provider.getBlockNumber();

  const chainSummary = await Promise.all([
    oldKnt.totalSupply(),
    oldKnt.totalLpNumber(),
    oldKnt.totalLpU(),
    oldKnt.totalLpPower(),
    oldKnt.totalLpUPower(),
    oldKnt.totalNodes(),
    oldKnt.queueLen(),
    oldKnt.effectiveLpCount(),
    oldLp.totalSupply(),
  ]);

  const rows = await withConcurrency(selectedAccounts, 8, async (account) => {
    const entry = accounts.get(account);
    const [user, pending, balance, chainReferrer] = await Promise.all([
      safeCall(() => oldKnt.users(account), null),
      safeCall(() => oldKnt.pending2(account), null),
      tokenHolders.has(account) ? Promise.resolve(BigInt(tokenHolders.get(account))) : safeCall(() => oldKnt.balanceOf(account), 0n),
      safeCall(() => oldKnt.referee(account), ZERO),
    ]);
    const data = pending || user;
    const parent = normalize(chainReferrer) && normalize(chainReferrer) !== ZERO ? normalize(chainReferrer) : entry.parent;
    const referrer = parent && !excluded.has(parent.toLowerCase()) ? parent : rootReferrer;
    return {
      account,
      referrer,
      sources: [...new Set(entry.source)],
      oldKntBalance: balance.toString(),
      oldLpCsvBalance: entry.oldLpCsvBalance || "",
      lpValueUsdt: data ? (data.lpU ?? data[0] ?? 0n).toString() : "0",
      lpAmount: data ? (data.lpNumber ?? data[1] ?? 0n).toString() : "0",
      legacyPower: data ? (data.lpPower ?? data[2] ?? 0n).toString() : "0",
      legacyUsdtPower: data ? (data.lpUPower ?? data[3] ?? 0n).toString() : "0",
      pendingStatic: data ? (data.pendingLP ?? data[6] ?? 0n).toString() : "0",
      pendingNode: data ? (data.pendingNode ?? data[7] ?? 0n).toString() : "0",
      directLpValueUsdt: data ? (data.refLpU ?? data[8] ?? 0n).toString() : "0",
      directCount: data ? (data.directCount ?? data[9] ?? 0n).toString() : "0",
      isNode: Boolean(data ? (data.isNode ?? data[16]) : false),
    };
  });

  const lpRows = rows.filter((row) => BigInt(row.lpValueUsdt) > 0n && BigInt(row.lpAmount) > 0n);
  const powerRows = lpRows.filter((row) => BigInt(row.legacyPower) > 0n);
  const kntRows = rows.filter((row) => BigInt(row.oldKntBalance) > 0n);
  const pendingRows = rows.filter((row) => BigInt(row.pendingStatic) > 0n || BigInt(row.pendingNode) > 0n);
  const networkOnlyRows = rows.filter((row) => BigInt(row.lpValueUsdt) === 0n && BigInt(row.oldKntBalance) === 0n);

  const state = {
    generatedAt: new Date().toISOString(),
    blockNumber,
    partial: tokenHolders.size === 0 || lpHolders.size === 0 || limit > 0,
    inputs: {
      treePath,
      tokenCsvPath: tokenCsvPath || null,
      lpCsvPath: lpCsvPath || null,
      limit,
    },
    contracts: {
      oldKnt: oldKntAddress,
      oldLp: oldLpAddress,
      newKnt: newKntAddress,
      rootReferrer,
    },
    chainSummary: {
      oldKntTotalSupply: chainSummary[0].toString(),
      oldTotalLpAmount: chainSummary[1].toString(),
      oldTotalLpValueUsdt: chainSummary[2].toString(),
      oldTotalLpPower: chainSummary[3].toString(),
      oldTotalLpUsdtPower: chainSummary[4].toString(),
      oldTotalNodes: chainSummary[5].toString(),
      oldQueueLength: chainSummary[6].toString(),
      oldEffectiveLpCount: chainSummary[7].toString(),
      oldLpTotalSupply: chainSummary[8].toString(),
    },
    summary: {
      sourceAccounts: accountList.length,
      scannedAccounts: selectedAccounts.length,
      tokenCsvHolders: tokenHolders.size,
      lpCsvHolders: lpHolders.size,
      lpImportRows: lpRows.length,
      powerImportRows: powerRows.length,
      migrationKntRows: kntRows.length,
      pendingRewardRows: pendingRows.length,
      networkOnlyRows: networkOnlyRows.length,
      lpImportValueUsdt: format(lpRows.reduce((sum, row) => sum + BigInt(row.lpValueUsdt), 0n)),
      lpImportAmount: format(lpRows.reduce((sum, row) => sum + BigInt(row.lpAmount), 0n)),
      legacyPower: format(powerRows.reduce((sum, row) => sum + BigInt(row.legacyPower), 0n)),
      migrationKntAmount: format(kntRows.reduce((sum, row) => sum + BigInt(row.oldKntBalance), 0n)),
      pendingStaticAmount: format(pendingRows.reduce((sum, row) => sum + BigInt(row.pendingStatic), 0n)),
      pendingNodeAmount: format(pendingRows.reduce((sum, row) => sum + BigInt(row.pendingNode), 0n)),
    },
    rows,
    batches: {
      lpImports: lpRows.map((row) => ({
        account: row.account,
        amount: row.lpAmount,
        lpValueUsdt: row.lpValueUsdt,
        power: row.legacyPower,
        referrer: row.referrer,
      })),
      legacyPowers: powerRows.map((row) => ({
        account: row.account,
        power: row.legacyPower,
      })),
      networkOnly: networkOnlyRows.map((row) => ({
        account: row.account,
        referrer: row.referrer,
      })),
      migrationMints: kntRows.map((row) => ({
        account: row.account,
        amount: row.oldKntBalance,
      })),
      pendingRewards: pendingRows.map((row) => ({
        account: row.account,
        pendingStatic: row.pendingStatic,
        pendingNode: row.pendingNode,
      })),
    },
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ ok: true, outputPath, partial: state.partial, summary: state.summary }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }, null, 2));
  process.exitCode = 1;
});
