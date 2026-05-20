const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_STATE = path.join(ROOT, "deployments", "bscMainnet", "migration", "knt-mainnet-migration-state.json");
const DEFAULT_LOG = path.join(ROOT, "deployments", "bscMainnet", "migration", "knt-mainnet-import-log.json");

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const direct = process.argv.find((item) => item.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function packLegacyAmount(lpAmount, power) {
  const lp = BigInt(lpAmount);
  const legacyPower = BigInt(power || 0);
  if (legacyPower === 0n) return lpAmount;
  return ((legacyPower << 128n) | lp).toString();
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function saveJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2));
  fs.renameSync(tempPath, filePath);
}

function loadLog(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      createdAt: new Date().toISOString(),
      completed: {},
      pending: {},
    };
  }
  const log = loadJson(filePath);
  log.completed ||= {};
  log.pending ||= {};
  return log;
}

function assertSameRun(log, logPath, runMeta) {
  if (!log.runMeta) {
    log.runMeta = runMeta;
    saveJson(logPath, log);
    return;
  }
  const hasProgress = Object.keys(log.completed || {}).length > 0 || Object.keys(log.pending || {}).length > 0;
  const checkedKeys = hasProgress
    ? ["chainId", "contractAddress", "statePath", "batchSize"]
    : ["chainId", "contractAddress", "statePath"];
  for (const key of checkedKeys) {
    if (String(log.runMeta[key]) !== String(runMeta[key])) {
      throw new Error(`Import log ${key} mismatch. log=${log.runMeta[key]}, current=${runMeta[key]}`);
    }
  }
  if (!hasProgress && String(log.runMeta.batchSize) !== String(runMeta.batchSize)) {
    log.runMeta.batchSize = runMeta.batchSize;
    saveJson(logPath, log);
  }
}

function importKey(kind, parts) {
  return [kind, ...parts].map((part) => String(part).toLowerCase()).join(":");
}

async function runLoggedTx({ log, logPath, key, label, provider, send }) {
  if (log.completed[key]) {
    console.log(JSON.stringify({ label: `skip ${label}`, reason: "already-completed", ...log.completed[key] }));
    return log.completed[key];
  }

  const pending = log.pending[key];
  if (pending?.tx) {
    const receipt = await provider.getTransactionReceipt(pending.tx);
    if (receipt) {
      log.completed[key] = { tx: receipt.hash, blockNumber: receipt.blockNumber };
      delete log.pending[key];
      saveJson(logPath, log);
      console.log(JSON.stringify({ label: `resume ${label}`, tx: receipt.hash, blockNumber: receipt.blockNumber }));
      return log.completed[key];
    }
    console.log(JSON.stringify({ label: `wait pending ${label}`, tx: pending.tx }));
    const waited = await provider.waitForTransaction(pending.tx);
    if (!waited) throw new Error(`Pending transaction did not confirm: ${pending.tx}`);
    log.completed[key] = { tx: waited.hash, blockNumber: waited.blockNumber };
    delete log.pending[key];
    saveJson(logPath, log);
    console.log(JSON.stringify({ label: `confirmed pending ${label}`, tx: waited.hash, blockNumber: waited.blockNumber }));
    return log.completed[key];
  }

  const tx = await send();
  log.pending[key] = { label, tx: tx.hash, submittedAt: new Date().toISOString() };
  saveJson(logPath, log);
  const receipt = await tx.wait();
  log.completed[key] = { tx: receipt.hash, blockNumber: receipt.blockNumber };
  delete log.pending[key];
  saveJson(logPath, log);
  console.log(JSON.stringify({ label, tx: receipt.hash, blockNumber: receipt.blockNumber }));
  return log.completed[key];
}

async function main() {
  const statePath = argValue("--state", process.env.KNT_MIGRATION_STATE || DEFAULT_STATE);
  const logPath = argValue("--log", process.env.KNT_MIGRATION_LOG || DEFAULT_LOG);
  const batchSize = Number(argValue("--batch-size", process.env.KNT_MIGRATION_BATCH_SIZE || "80"));
  const mintBatchSize = Number(argValue("--mint-batch-size", process.env.KNT_MIGRATION_MINT_BATCH_SIZE || "1"));
  const networkStartIndex = Number(argValue("--network-start-index", process.env.KNT_MIGRATION_NETWORK_START_INDEX || "0"));
  const execute = process.env.EXECUTE_KNT_MIGRATION === "YES";
  const skipMints = process.env.SKIP_MIGRATION_MINTS === "YES";
  const state = loadJson(statePath);
  const deployment = loadJson(path.join(ROOT, "deployments", "bscMainnet", "knt-upgradeable-mainnet.json"));
  const contractAddress = hre.ethers.getAddress(process.env.KNT_CONTRACT_ADDRESS || state.contracts?.newKnt || deployment.KNTAllInOne);
  const [operator] = await hre.ethers.getSigners();
  const operatorAddress = await operator.getAddress();
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 56n) throw new Error(`Expected BSC Mainnet chainId 56, got ${network.chainId}`);

  const KNT = await hre.ethers.getContractFactory("KNTAllInOneUpgradeable");
  const knt = KNT.attach(contractAddress).connect(operator);
  const [owner, role] = await Promise.all([knt.owner(), knt.roleOf(operatorAddress).catch(() => null)]);
  const authorized = owner.toLowerCase() === operatorAddress.toLowerCase() || Boolean(role?.isAdminRole ?? role?.[1]);
  if (!authorized && execute) throw new Error(`Operator ${operatorAddress} is not owner/admin for ${contractAddress}`);

  const code = await hre.ethers.provider.getCode(contractAddress);
  if (code === "0x") throw new Error(`No contract code at ${contractAddress}`);
  const log = loadLog(logPath);
  const runMeta = {
    chainId: network.chainId.toString(),
    contractAddress,
    statePath: path.resolve(statePath),
    batchSize,
  };
  assertSameRun(log, logPath, runMeta);

  const plan = {
    execute,
    statePath,
    logPath,
    contractAddress,
    operator: operatorAddress,
    owner,
    authorized,
    partialState: Boolean(state.partial),
    batchSize,
    mintBatchSize,
    networkStartIndex,
    counts: {
      lpImports: state.batches?.lpImports?.length || 0,
      legacyPowers: state.batches?.legacyPowers?.length || 0,
      networkOnly: state.batches?.networkOnly?.length || 0,
      migrationMints: state.batches?.migrationMints?.length || 0,
      pendingRewards: state.batches?.pendingRewards?.length || 0,
    },
  };
  console.log(JSON.stringify({ ok: true, plan }, null, 2));
  if (!execute) {
    console.log("Dry-run only. Set EXECUTE_KNT_MIGRATION=YES to submit transactions.");
    return;
  }
  if (state.partial && process.env.ALLOW_PARTIAL_KNT_MIGRATION !== "YES") {
    throw new Error("State is partial. Provide holder CSV files or set ALLOW_PARTIAL_KNT_MIGRATION=YES for an intentional partial import.");
  }

  for (const [index, rows] of chunk(state.batches.lpImports || [], batchSize).entries()) {
    const batchKey = importKey("lp", [
      index,
      rows.length,
      rows[0]?.account || "",
      rows.at(-1)?.account || "",
    ]);
    await runLoggedTx({
      log,
      logPath,
      key: batchKey,
      label: `adminImportDeposits batch ${index + 1}`,
      provider: hre.ethers.provider,
      send: () => knt.adminImportDeposits(
        rows.map((row) => row.account),
        rows.map((row) => packLegacyAmount(row.amount, row.power)),
        rows.map((row) => row.lpValueUsdt),
        rows.map((row) => row.referrer)
      ),
    });
  }

  for (const row of (state.batches.networkOnly || []).slice(networkStartIndex)) {
    const user = await knt.users(row.account);
    const currentReferrer = user.referrer ?? user[1];
    const registered = Boolean(user.registered ?? user[0]);
    if (registered || currentReferrer !== hre.ethers.ZeroAddress) {
      console.log(JSON.stringify({
        label: `skip adminSetReferrer ${row.account}`,
        registered,
        currentReferrer,
      }));
      continue;
    }
    const referrerKey = importKey("referrer", [row.account, row.referrer]);
    await runLoggedTx({
      log,
      logPath,
      key: referrerKey,
      label: `adminSetReferrer ${row.account}`,
      provider: hre.ethers.provider,
      send: () => knt.adminSetReferrer(row.account, row.referrer),
    });
  }

  for (const row of (state.rows || [])) {
    if (!row.referrer || row.referrer === hre.ethers.ZeroAddress) continue;
    const user = await knt.users(row.account);
    const currentReferrer = user.referrer ?? user[1];
    const registered = Boolean(user.registered ?? user[0]);
    if (registered || currentReferrer !== hre.ethers.ZeroAddress) {
      continue;
    }
    const referrerKey = importKey("referrer", [row.account, row.referrer]);
    await runLoggedTx({
      log,
      logPath,
      key: referrerKey,
      label: `adminSetReferrer ${row.account}`,
      provider: hre.ethers.provider,
      send: () => knt.adminSetReferrer(row.account, row.referrer),
    });
  }

  if (!skipMints) {
    if (mintBatchSize !== 1) {
      throw new Error("Current contract only supports one mintMigration per transaction; keep --mint-batch-size 1.");
    }
    for (const [index, row] of (state.batches.migrationMints || []).entries()) {
      const mintKey = importKey("mint", [row.account, row.amount]);
      await runLoggedTx({
        log,
        logPath,
        key: mintKey,
        label: `mintMigration ${index + 1} ${row.account}`,
        provider: hre.ethers.provider,
        send: () => knt.mintMigration(row.account, row.amount),
      });
    }
  }

  console.log(JSON.stringify({ ok: true, completed: true }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }, null, 2));
  process.exitCode = 1;
});
