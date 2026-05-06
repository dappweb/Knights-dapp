import { ethers } from "ethers";

const TEN_18 = 10n ** 18n;
const DAY_SECONDS = 24 * 60 * 60;
const MAX_LOG_ENTRIES = 500;
const AUTH_NONCE_TTL_SECONDS = 300;
const KEEPER_ACTIONS = new Set([
  "/api/keeper/observer",
  "/api/keeper/process-usdt",
  "/api/keeper/sync-lp",
  "/api/keeper/maintenance",
  "/api/keeper/reduce-lp",
  "/api/keeper/burn-user-knt",
  "/api/keeper/run-all",
  "/api/keeper/settings",
]);

const ERC20_ABI = [
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "function balanceOf(address) view returns(uint256)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
];

const PAIR_ABI = [
  "function token0() view returns(address)",
  "function token1() view returns(address)",
  "function getReserves() view returns(uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
  "function totalSupply() view returns(uint256)",
];

const KNT_ABI = [
  "function owner() view returns(address)",
  "function roleOf(address) view returns(bool isOwnerRole,bool isAdminRole,bool isManagerRole,bool isKeeperRole,bool isTaxRecorderRole)",
  "function processedUsdtDeposits(bytes32) view returns(bool)",
  "function processedKeeperActions(bytes32) view returns(bool)",
  "function processUsdtDeposit(address,uint256,bytes32,uint256,uint256,uint256,uint256,uint256,uint256) returns(uint256)",
  "function keeperReduceUserLp(address,uint256,uint256)",
  "function keeperReduceUserLpFromSource(address,uint256,uint256,bytes32,uint256)",
  "function keeperReduceUserLpAmountFromSource(address,uint256,bytes32,uint256)",
  "function keeperBurnFrom(address,uint256)",
  "function keeperBurnFromSource(address,uint256,bytes32,uint256)",
  "function keeperUpdateGlobalLpValue(uint256)",
  "function keeperUpdateKntPrices(uint256,uint256)",
  "function adminUpdatePool()",
  "function processBurnQueue(uint256) returns(uint256)",
  "function globalLpValueUsdt() view returns(uint256)",
  "function latestKntPriceUsdt() view returns(uint256)",
  "function price24hAgoUsdt() view returns(uint256)",
  "function latestPriceUpdatedAt() view returns(uint256)",
  "function rewardPool() view returns(uint256)",
  "function totalLpValueUsdt() view returns(uint256)",
  "function totalPower() view returns(uint256)",
  "function nodeCount() view returns(uint256)",
  "function burnQueueLength() view returns(uint256)",
  "function nextPayoutIndex() view returns(uint256)",
  "function currentDay() view returns(uint256)",
  "function rewardPeriodSeconds() view returns(uint256)",
  "function dailyEmissionForDay(uint256) view returns(uint256)",
  "function foundationWallet() view returns(address)",
  "function dexSettlementWallet() view returns(address)",
  "function projectSinkWallet() view returns(address)",
  "function ecosystemWallet() view returns(address)",
  "function pancakeRouter() view returns(address)",
  "function usdtToken() view returns(address)",
  "function labubuToken() view returns(address)",
  "function labubuKntPair() view returns(address)",
  "function burnQueueRewardBP() view returns(uint256)",
  "function referralSignalAmount() view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
  "function users(address) view returns(bool registered,address referrer,uint256 depositAmount,uint256 lpValueUsdt,uint256 power,uint256 lastPowerUpdateDay,uint256 rewardDebt,uint256 pendingKnt,uint256 directLpValueUsdt,uint256 directEffectiveCount,bool isNode,uint256 nodeRewardDebt,uint256 totalStaticReward,uint256 totalDynamicReward,uint256 totalNodeReward)",
  "function costBasisOf(address) view returns(uint256 boughtKnt,uint256 spentUsdt)",
  "function directReferralsOf(address) view returns(address[])",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
  "event ReferralSignal(address indexed from,address indexed to,uint256 amount)",
  "event ReferrerBound(address indexed user,address indexed referrer)",
  "event Deposited(address indexed user,uint256 amount,uint256 lpValueUsdt,uint256 addedPower)",
  "event UsdtDeposited(address indexed user,uint256 usdtAmount,uint256 kntUsed,uint256 labubuUsed,uint256 lpAmount,uint256 lpValueUsdt)",
  "event RewardsFunded(address indexed from,uint256 amount)",
  "event PoolUpdated(uint256 indexed dayKey,uint256 emission,uint256 staticAmount,uint256 dynamicAmount,uint256 nodeAmount)",
  "event LiquidityKntBurned(address indexed account,uint256 amount)",
  "event UserLpCredited(address indexed account,uint256 lpAmount,uint256 lpValueUsdt)",
  "event KeeperLpReduced(address indexed account,address indexed operator,uint256 lpAmount,uint256 lpValueUsdt)",
  "event KeeperBurned(address indexed account,address indexed operator,uint256 amount)",
  "event KeeperActionProcessed(bytes32 indexed actionId,bytes32 indexed sourceTxHash,uint256 indexed sourceLogIndex,address account,bytes32 actionType)",
  "event RewardDistributed(address indexed user,address indexed operator,uint256 amount)",
  "event StaticRewardAccrued(address indexed user,uint256 amount)",
  "event DynamicRewardAccrued(address indexed source,address indexed receiver,uint256 indexed level,uint256 amount)",
  "event NodeStatusUpdated(address indexed user,bool isNode)",
  "event BurnQueued(address indexed user,uint256 indexed index,uint256 burnedAmount,uint256 rewardAmount)",
  "event QueuePaid(address indexed user,uint256 indexed index,uint256 rewardAmount)",
  "event BuyRecorded(address indexed account,uint256 kntAmount,uint256 usdtSpent)",
  "event SellSettled(address indexed account,uint256 grossAmount,uint256 netAmount,uint256 sellTax,uint256 profitTax,uint256 dumpTax)",
  "event DynamicSunk(address indexed source,uint256 amount)",
  "event MigrationMinted(address indexed account,uint256 indexed id,uint256 amount)",
  "event MigrationClaimed(address indexed account,uint256 indexed id,uint256 amount)",
  "event UsdtDepositProcessed(bytes32 indexed depositId,address indexed account,address indexed operator,uint256 amount)",
  "event ManagerUpdated(address indexed manager,bool enabled)",
  "event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)",
];

function normalize(address) {
  return String(address || "").toLowerCase();
}

function isZeroAddress(address) {
  return !address || normalize(address) === ethers.ZeroAddress.toLowerCase();
}

function envNumber(env, key, fallback) {
  const value = Number(env[key] || fallback);
  return Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function nonNegativeDecimal(value, fallback = "0") {
  const text = String(value ?? "").trim();
  return /^\d+(\.\d+)?$/.test(text) ? text : fallback;
}

function defaultKeeperSettings(env) {
  const confirmations = envNumber(env, "KEEPER_CONFIRMATIONS", 3);
  const scanMaxBlocks = envNumber(env, "KEEPER_SCAN_MAX_BLOCKS", 100);
  return {
    observer: {
      enabled: true,
      intervalMinutes: 10,
      confirmations,
      scanMaxBlocks,
    },
    market: {
      enabled: true,
      intervalMinutes: 10,
      priceDeviationBP: 0,
      lpDeviationBP: 0,
    },
    reward: {
      enabled: true,
      intervalMinutes: 10,
      burnQueueMax: envNumber(env, "KEEPER_BURN_QUEUE_MAX", 20),
      minRewardPoolKnt: "0",
    },
    deposit: {
      enabled: true,
      intervalMinutes: 10,
      confirmations,
      scanMaxBlocks,
      deadlineSeconds: envNumber(env, "KEEPER_DEADLINE_SECONDS", 1200),
      minDepositUsdt: "0",
      maxDepositUsdt: "0",
    },
    lpSync: {
      enabled: true,
      intervalMinutes: 10,
      confirmations,
      scanMaxBlocks,
      maxActions: envNumber(env, "KEEPER_LP_SYNC_MAX_ACTIONS", 20),
    },
  };
}

function normalizeKeeperSettings(env, input = {}) {
  const defaults = defaultKeeperSettings(env);
  return {
    observer: {
      enabled: Boolean(input.observer?.enabled ?? defaults.observer.enabled),
      intervalMinutes: boundedNumber(input.observer?.intervalMinutes, defaults.observer.intervalMinutes, 1, 1440),
      confirmations: boundedNumber(input.observer?.confirmations, defaults.observer.confirmations, 0, 100),
      scanMaxBlocks: boundedNumber(input.observer?.scanMaxBlocks, defaults.observer.scanMaxBlocks, 1, 10000),
    },
    market: {
      enabled: Boolean(input.market?.enabled ?? defaults.market.enabled),
      intervalMinutes: boundedNumber(input.market?.intervalMinutes, defaults.market.intervalMinutes, 1, 1440),
      priceDeviationBP: boundedNumber(input.market?.priceDeviationBP, defaults.market.priceDeviationBP, 0, 10000),
      lpDeviationBP: boundedNumber(input.market?.lpDeviationBP, defaults.market.lpDeviationBP, 0, 10000),
    },
    reward: {
      enabled: Boolean(input.reward?.enabled ?? defaults.reward.enabled),
      intervalMinutes: boundedNumber(input.reward?.intervalMinutes, defaults.reward.intervalMinutes, 1, 1440),
      burnQueueMax: boundedNumber(input.reward?.burnQueueMax, defaults.reward.burnQueueMax, 0, 500),
      minRewardPoolKnt: nonNegativeDecimal(input.reward?.minRewardPoolKnt, defaults.reward.minRewardPoolKnt),
    },
    deposit: {
      enabled: Boolean(input.deposit?.enabled ?? defaults.deposit.enabled),
      intervalMinutes: boundedNumber(input.deposit?.intervalMinutes, defaults.deposit.intervalMinutes, 1, 1440),
      confirmations: boundedNumber(input.deposit?.confirmations, defaults.deposit.confirmations, 0, 100),
      scanMaxBlocks: boundedNumber(input.deposit?.scanMaxBlocks, defaults.deposit.scanMaxBlocks, 1, 10000),
      deadlineSeconds: boundedNumber(input.deposit?.deadlineSeconds, defaults.deposit.deadlineSeconds, 60, 7200),
      minDepositUsdt: nonNegativeDecimal(input.deposit?.minDepositUsdt, defaults.deposit.minDepositUsdt),
      maxDepositUsdt: nonNegativeDecimal(input.deposit?.maxDepositUsdt, defaults.deposit.maxDepositUsdt),
    },
    lpSync: {
      enabled: Boolean(input.lpSync?.enabled ?? defaults.lpSync.enabled),
      intervalMinutes: boundedNumber(input.lpSync?.intervalMinutes, defaults.lpSync.intervalMinutes, 1, 1440),
      confirmations: boundedNumber(input.lpSync?.confirmations, defaults.lpSync.confirmations, 0, 100),
      scanMaxBlocks: boundedNumber(input.lpSync?.scanMaxBlocks, defaults.lpSync.scanMaxBlocks, 1, 10000),
      maxActions: boundedNumber(input.lpSync?.maxActions, defaults.lpSync.maxActions, 0, 500),
    },
  };
}

function deviationBasisPoints(current, previous) {
  const currentValue = BigInt(current || 0);
  const previousValue = BigInt(previous || 0);
  if (previousValue === 0n) return currentValue === 0n ? 0 : 10000;
  const diff = currentValue > previousValue ? currentValue - previousValue : previousValue - currentValue;
  const bp = (diff * 10000n) / previousValue;
  return Number(bp > 1000000n ? 1000000n : bp);
}

function shouldRunKeeper(state, settings, type, nowMs) {
  const config = settings[type];
  if (!config?.enabled) return false;
  const lastTriggeredAt = state.keeperTriggers?.[type]?.lastTriggeredAt;
  if (!lastTriggeredAt) return true;
  const elapsedMs = nowMs - Date.parse(lastTriggeredAt);
  return !Number.isFinite(elapsedMs) || elapsedMs >= config.intervalMinutes * 60 * 1000;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    },
  });
}

function errorJson(message, status = 500, details = undefined) {
  return json({ ok: false, error: message, details }, status);
}

function getDeployment(env) {
  return {
    network: env.NETWORK_NAME || "bscTestnet",
    chainId: envNumber(env, "BSC_CHAIN_ID", 97),
    rpcUrl: env.BSC_RPC_URL || env.PUBLIC_BSC_RPC_URL || "",
    explorerBaseUrl: env.EXPLORER_BASE_URL || "https://testnet.bscscan.com",
    contract: env.KNT_CONTRACT_ADDRESS || "",
    usdt: env.USDT_TOKEN_ADDRESS || "",
    labubu: env.LABUBU_TOKEN_ADDRESS || "",
    router: env.PANCAKE_V2_ROUTER || "",
    labubuPair: env.KNT_LABUBU_PAIR || "",
    kntUsdtPair: env.KNT_USDT_PAIR || "",
    labubuUsdtPair: env.LABUBU_USDT_PAIR || "",
  };
}

function requireDeployment(env) {
  const deployment = getDeployment(env);
  if (!deployment.rpcUrl) throw new Error("BSC_RPC_URL is not configured");
  if (!ethers.isAddress(deployment.contract)) throw new Error("KNT_CONTRACT_ADDRESS is not configured");
  if (!ethers.isAddress(deployment.usdt)) throw new Error("USDT_TOKEN_ADDRESS is not configured");
  return deployment;
}

function providerFor(env) {
  const deployment = requireDeployment(env);
  const provider = new ethers.JsonRpcProvider(deployment.rpcUrl, deployment.chainId);
  provider.pollingInterval = envNumber(env, "KEEPER_POLLING_INTERVAL_MS", 3000);
  return provider;
}

function signerFor(env) {
  const rawKey = String(env.KEEPER_PRIVATE_KEY || "").trim();
  if (!rawKey) throw new Error("KEEPER_PRIVATE_KEY secret is not configured");
  const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  return new ethers.Wallet(privateKey, providerFor(env));
}

function kntContract(env, runner) {
  const deployment = requireDeployment(env);
  return new ethers.Contract(deployment.contract, KNT_ABI, runner);
}

function scaleTo18(value, decimals) {
  const decimalCount = Number(decimals);
  if (decimalCount === 18) return BigInt(value);
  if (decimalCount < 18) return BigInt(value) * 10n ** BigInt(18 - decimalCount);
  return BigInt(value) / 10n ** BigInt(decimalCount - 18);
}

function fmt(value) {
  return ethers.formatEther(BigInt(value || 0));
}

function toRpcQuantity(value) {
  return `0x${BigInt(value).toString(16)}`;
}

async function rpcCall(deployment, method, params) {
  const response = await fetch(deployment.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `RPC ${method} failed`);
  }
  return data.result;
}

async function tokenMeta(tokenAddress, provider, cache) {
  const key = normalize(tokenAddress);
  if (cache[key]) return cache[key];
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  let decimals = 18;
  let symbol = tokenAddress;
  try {
    decimals = Number(await token.decimals());
  } catch (_error) {
    decimals = 18;
  }
  try {
    symbol = await token.symbol();
  } catch (_error) {
    symbol = tokenAddress;
  }
  cache[key] = { address: tokenAddress, decimals, symbol };
  return cache[key];
}

async function pairReserves(pairAddress, provider) {
  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const [token0, token1, reserves, totalSupply] = await Promise.all([
    pair.token0(),
    pair.token1(),
    pair.getReserves(),
    pair.totalSupply(),
  ]);
  return {
    address: pairAddress,
    token0,
    token1,
    token0Lower: normalize(token0),
    token1Lower: normalize(token1),
    reserve0: reserves[0],
    reserve1: reserves[1],
    totalSupply,
    blockTimestampLast: reserves[2],
  };
}

function reserveOf(pair, token) {
  const normalized = normalize(token);
  if (pair.token0Lower === normalized) return pair.reserve0;
  if (pair.token1Lower === normalized) return pair.reserve1;
  return 0n;
}

function trackedPairs(deployment) {
  return [
    {
      key: "LABUBU_USDT",
      label: "LABUBU/USDT",
      address: deployment.labubuUsdtPair,
      valuation: "USDT reserve x 2",
    },
    {
      key: "LABUBU_KNT",
      label: "LABUBU/KNT",
      address: deployment.labubuPair,
      valuation: "KNT reserve x derived KNT price x 2",
    },
  ];
}

async function computeKntPrice(deployment, provider, metaCache) {
  if (!ethers.isAddress(deployment.labubuUsdtPair)) throw new Error("LABUBU_USDT_PAIR is not configured");
  if (!ethers.isAddress(deployment.labubuPair)) throw new Error("KNT_LABUBU_PAIR is not configured");
  const [labubuUsdtPair, labubuKntPair, labubuMeta, usdtMeta, kntMeta] = await Promise.all([
    pairReserves(deployment.labubuUsdtPair, provider),
    pairReserves(deployment.labubuPair, provider),
    tokenMeta(deployment.labubu, provider, metaCache),
    tokenMeta(deployment.usdt, provider, metaCache),
    tokenMeta(deployment.contract, provider, metaCache),
  ]);
  const labubuUsdtLabubuReserve = scaleTo18(reserveOf(labubuUsdtPair, deployment.labubu), labubuMeta.decimals);
  const labubuUsdtUsdtReserve = scaleTo18(reserveOf(labubuUsdtPair, deployment.usdt), usdtMeta.decimals);
  const labubuKntLabubuReserve = scaleTo18(reserveOf(labubuKntPair, deployment.labubu), labubuMeta.decimals);
  const labubuKntKntReserve = scaleTo18(reserveOf(labubuKntPair, deployment.contract), kntMeta.decimals);
  if (
    labubuUsdtLabubuReserve === 0n ||
    labubuUsdtUsdtReserve === 0n ||
    labubuKntLabubuReserve === 0n ||
    labubuKntKntReserve === 0n
  ) {
    throw new Error("LABUBU/USDT or LABUBU/KNT pair has empty reserves");
  }
  const labubuPriceUsdt = (labubuUsdtUsdtReserve * TEN_18) / labubuUsdtLabubuReserve;
  const kntPriceLabubu = (labubuKntLabubuReserve * TEN_18) / labubuKntKntReserve;
  return (kntPriceLabubu * labubuPriceUsdt) / TEN_18;
}

async function lpValueForPair(definition, deployment, provider, priceNow, metaCache) {
  if (!ethers.isAddress(definition.address || "")) {
    return { ...definition, status: "missing", value: "0.0", valueRaw: "0" };
  }

  const pair = await pairReserves(definition.address, provider);
  const [token0Meta, token1Meta] = await Promise.all([
    tokenMeta(pair.token0, provider, metaCache),
    tokenMeta(pair.token1, provider, metaCache),
  ]);
  const usdtReserve = reserveOf(pair, deployment.usdt);
  const kntReserve = reserveOf(pair, deployment.contract);
  let value = 0n;
  let basis = "unsupported";

  if (usdtReserve > 0n) {
    const usdtMeta = pair.token0Lower === normalize(deployment.usdt) ? token0Meta : token1Meta;
    value = scaleTo18(usdtReserve, usdtMeta.decimals) * 2n;
    basis = "usdtReserve";
  } else if (kntReserve > 0n) {
    const kntMeta = pair.token0Lower === normalize(deployment.contract) ? token0Meta : token1Meta;
    value = ((scaleTo18(kntReserve, kntMeta.decimals) * priceNow) / TEN_18) * 2n;
    basis = "kntReserve";
  }

  return {
    ...definition,
    status: value > 0n ? "valued" : "zero",
    token0: {
      address: pair.token0,
      symbol: token0Meta.symbol,
      reserveRaw: pair.reserve0.toString(),
      reserve: fmt(scaleTo18(pair.reserve0, token0Meta.decimals)),
    },
    token1: {
      address: pair.token1,
      symbol: token1Meta.symbol,
      reserveRaw: pair.reserve1.toString(),
      reserve: fmt(scaleTo18(pair.reserve1, token1Meta.decimals)),
    },
    totalSupply: fmt(pair.totalSupply),
    basis,
    value: fmt(value),
    valueRaw: value.toString(),
  };
}

async function kvRead(env, key, fallback) {
  if (!env.KNT_ADMIN_STATE) return fallback;
  const value = await env.KNT_ADMIN_STATE.get(key, "json");
  return value || fallback;
}

async function kvWrite(env, key, value) {
  if (!env.KNT_ADMIN_STATE) return;
  await env.KNT_ADMIN_STATE.put(key, JSON.stringify(value));
}

async function withKeeperLock(env, name, fn, ttlSeconds = 180) {
  if (!env.KNT_ADMIN_STATE) return fn();
  const deployment = requireDeployment(env);
  const key = `keeper-lock:${normalize(deployment.contract)}:${name}`;
  const existing = await env.KNT_ADMIN_STATE.get(key);
  if (existing) {
    return {
      status: "skipped",
      reason: "keeper lock active",
      lock: name,
    };
  }
  const token = crypto.randomUUID();
  await env.KNT_ADMIN_STATE.put(key, token, { expirationTtl: ttlSeconds });
  try {
    return await fn();
  } finally {
    const current = await env.KNT_ADMIN_STATE.get(key);
    if (current === token) await env.KNT_ADMIN_STATE.delete(key);
  }
}

function adminStateKey(env) {
  const deployment = requireDeployment(env);
  return `admin-state:${normalize(deployment.contract)}`;
}

async function readAdminState(env) {
  const deployment = requireDeployment(env);
  const state = await kvRead(env, adminStateKey(env), {
    contract: deployment.contract,
    lastScannedBlock: Number(env.KEEPER_START_BLOCK || 0),
    observerLastScannedBlock: Number(env.KEEPER_START_BLOCK || 0),
    lpSyncLastScannedBlock: Number(env.KEEPER_START_BLOCK || 0),
    runs: [],
    observerRuns: [],
    lpSyncRuns: [],
    lpSyncActions: [],
    deposits: [],
    observedDeposits: [],
    maintenance: [],
    priceSnapshots: [],
    keeperSettings: defaultKeeperSettings(env),
    keeperTriggers: {},
  });
  state.keeperSettings = normalizeKeeperSettings(env, state.keeperSettings);
  state.keeperTriggers = state.keeperTriggers || {};
  state.lastScannedBlock = Number(state.lastScannedBlock || env.KEEPER_START_BLOCK || 0);
  state.observerLastScannedBlock = Number(state.observerLastScannedBlock || env.KEEPER_START_BLOCK || 0);
  state.lpSyncLastScannedBlock = Number(state.lpSyncLastScannedBlock || env.KEEPER_START_BLOCK || 0);
  state.observerRuns = state.observerRuns || [];
  state.lpSyncRuns = state.lpSyncRuns || [];
  state.lpSyncActions = state.lpSyncActions || [];
  state.observedDeposits = state.observedDeposits || [];
  return state;
}

async function writeAdminState(env, state) {
  const deployment = requireDeployment(env);
  state.contract = deployment.contract;
  state.keeperSettings = normalizeKeeperSettings(env, state.keeperSettings);
  state.keeperTriggers = state.keeperTriggers || {};
  state.runs = (state.runs || []).slice(-MAX_LOG_ENTRIES);
  state.observerRuns = (state.observerRuns || []).slice(-MAX_LOG_ENTRIES);
  state.lpSyncRuns = (state.lpSyncRuns || []).slice(-MAX_LOG_ENTRIES);
  state.lpSyncActions = (state.lpSyncActions || []).slice(-MAX_LOG_ENTRIES);
  state.deposits = (state.deposits || []).slice(-MAX_LOG_ENTRIES);
  state.observedDeposits = (state.observedDeposits || []).slice(-MAX_LOG_ENTRIES);
  state.maintenance = (state.maintenance || []).slice(-MAX_LOG_ENTRIES);
  state.priceSnapshots = (state.priceSnapshots || []).slice(-8 * 24);
  await kvWrite(env, adminStateKey(env), state);
}

async function recordKeeperTrigger(env, type, status, details = {}) {
  const state = await readAdminState(env);
  state.keeperTriggers = state.keeperTriggers || {};
  state.keeperTriggers[type] = {
    lastTriggeredAt: new Date().toISOString(),
    lastStatus: status,
    ...details,
  };
  await writeAdminState(env, state);
}

function select24hPriceSnapshot(state, nowSeconds, priceNow) {
  const snapshots = (state.priceSnapshots || [])
    .filter((item) => item && item.timestamp && item.priceNowRaw)
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const targetTimestamp = nowSeconds - DAY_SECONDS;
  let selected = null;
  for (const snapshot of snapshots) {
    if (Number(snapshot.timestamp) <= targetTimestamp) selected = snapshot;
  }
  return selected
    ? {
        price24hAgo: BigInt(selected.priceNowRaw),
        source: "snapshot",
        snapshotAt: selected.at,
        snapshotTimestamp: selected.timestamp,
      }
    : {
        price24hAgo: priceNow,
        source: "current-no-24h-snapshot",
        snapshotAt: null,
        snapshotTimestamp: null,
      };
}

function appendPriceSnapshot(state, nowSeconds, priceNow) {
  const snapshots = state.priceSnapshots || [];
  snapshots.push({
    at: new Date(nowSeconds * 1000).toISOString(),
    timestamp: nowSeconds,
    priceNow: fmt(priceNow),
    priceNowRaw: priceNow.toString(),
  });
  state.priceSnapshots = snapshots.filter((item) => Number(item.timestamp || 0) >= nowSeconds - 8 * DAY_SECONDS);
}

function parseKntReceipt(receipt) {
  const iface = new ethers.Interface(KNT_ABI);
  const details = {
    liquidityKntBurned: "0.0",
    liquidityKntBurnedRaw: "0",
    rewardsDistributed: [],
    queuePaid: [],
  };

  for (const log of receipt.logs || []) {
    try {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      if (parsed.name === "UsdtDeposited") {
        details.kntUsed = fmt(parsed.args.kntUsed);
        details.kntUsedRaw = parsed.args.kntUsed.toString();
        details.labubuUsed = fmt(parsed.args.labubuUsed);
        details.labubuUsedRaw = parsed.args.labubuUsed.toString();
        details.lpAmount = fmt(parsed.args.lpAmount);
        details.lpAmountRaw = parsed.args.lpAmount.toString();
        details.lpValueUsdt = fmt(parsed.args.lpValueUsdt);
        details.lpValueUsdtRaw = parsed.args.lpValueUsdt.toString();
      }
      if (parsed.name === "LiquidityKntBurned") {
        const next = BigInt(details.liquidityKntBurnedRaw || "0") + parsed.args.amount;
        details.liquidityKntBurned = fmt(next);
        details.liquidityKntBurnedRaw = next.toString();
      }
      if (parsed.name === "RewardDistributed") {
        details.rewardsDistributed.push({
          user: parsed.args.user,
          operator: parsed.args.operator,
          amount: fmt(parsed.args.amount),
          rawAmount: parsed.args.amount.toString(),
        });
      }
      if (parsed.name === "QueuePaid") {
        details.queuePaid.push({
          user: parsed.args.user,
          index: parsed.args.index.toString(),
          rewardAmount: fmt(parsed.args.rewardAmount),
          rewardAmountRaw: parsed.args.rewardAmount.toString(),
        });
      }
      if (parsed.name === "KeeperActionProcessed") {
        details.keeperActionId = parsed.args.actionId;
        details.keeperSourceTxHash = parsed.args.sourceTxHash;
        details.keeperSourceLogIndex = parsed.args.sourceLogIndex.toString();
        details.keeperActionType = parsed.args.actionType;
      }
    } catch (_error) {
      // Logs from other contracts in the same receipt are ignored.
    }
  }

  return details;
}

function queryNumber(searchParams, key, fallback) {
  const raw = searchParams.get(key);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function checksumAddress(address) {
  if (!ethers.isAddress(address || "")) return null;
  return ethers.getAddress(address);
}

function logBlockNumber(log) {
  return Number(BigInt(log.blockNumber ?? "0x0"));
}

function logIndexNumber(log) {
  return Number(BigInt(log.logIndex ?? log.index ?? "0x0"));
}

function addRawAmount(raw, key, amount) {
  raw[key] = (BigInt(raw[key] || "0") + BigInt(amount || 0)).toString();
}

function formatRawAmounts(raw) {
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, fmt(value)]));
}

function bumpCounter(target, key, by = 1) {
  target[key] = Number(target[key] || 0) + by;
}

function emptyAccountingAccount(account) {
  return {
    account,
    raw: {},
    eventCounts: {
      deposits: 0,
      rewards: 0,
      staticRewards: 0,
      dynamicRewards: 0,
      referrals: 0,
      burns: 0,
      taxes: 0,
      ledger: 0,
      managers: 0,
    },
    referrer: null,
    directReferralEventCount: 0,
    referralSignalsSent: 0,
    referralSignalsReceived: 0,
    firstActivityBlock: null,
    lastActivityBlock: null,
  };
}

function ensureAccountingAccount(accounts, address) {
  const account = checksumAddress(address);
  if (!account || isZeroAddress(account)) return null;
  const key = normalize(account);
  if (!accounts.has(key)) accounts.set(key, emptyAccountingAccount(account));
  return accounts.get(key);
}

function touchAccountingAccount(account, blockNumber) {
  if (!account) return;
  account.firstActivityBlock = account.firstActivityBlock === null ? blockNumber : Math.min(account.firstActivityBlock, blockNumber);
  account.lastActivityBlock = account.lastActivityBlock === null ? blockNumber : Math.max(account.lastActivityBlock, blockNumber);
}

function addAccountAmount(accounts, address, key, amount, blockNumber) {
  const account = ensureAccountingAccount(accounts, address);
  if (!account) return null;
  addRawAmount(account.raw, key, amount);
  touchAccountingAccount(account, blockNumber);
  return account;
}

function pushAccountingRecord(records, bucket, log, type, fields = {}) {
  records[bucket].push({
    type,
    blockNumber: logBlockNumber(log),
    logIndex: logIndexNumber(log),
    txHash: log.transactionHash,
    ...fields,
  });
}

function taxTotal(...amounts) {
  return amounts.reduce((sum, amount) => sum + BigInt(amount || 0), 0n);
}

function bodyAddress(body, keys, label) {
  for (const key of keys) {
    if (ethers.isAddress(body?.[key] || "")) return ethers.getAddress(body[key]);
  }
  throw new Error(`${label} is required`);
}

function bodyAmount(body, rawKey, decimalKey, label) {
  const rawValue = body?.[rawKey];
  if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== "") {
    const amount = BigInt(String(rawValue));
    if (amount <= 0n) throw new Error(`${label} must be positive`);
    return amount;
  }
  const decimalValue = body?.[decimalKey];
  if (decimalValue === undefined || decimalValue === null || String(decimalValue).trim() === "") {
    throw new Error(`${label} is required`);
  }
  const amount = ethers.parseEther(String(decimalValue));
  if (amount <= 0n) throw new Error(`${label} must be positive`);
  return amount;
}

function keeperActionId(actionTypeText, sourceTxHash, sourceLogIndex, account) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(coder.encode(
    ["bytes32", "bytes32", "uint256", "address"],
    [ethers.id(actionTypeText), sourceTxHash, BigInt(sourceLogIndex), ethers.getAddress(account)]
  ));
}

async function scanContractLogs(deployment, fromBlock, toBlock, chunkSize) {
  const logs = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(toBlock, start + chunkSize - 1);
    const chunk = await rpcCall(deployment, "eth_getLogs", [{
      address: deployment.contract,
      fromBlock: toRpcQuantity(start),
      toBlock: toRpcQuantity(end),
    }]);
    logs.push(...chunk);
  }
  return logs.sort((a, b) => {
    const blockDelta = logBlockNumber(a) - logBlockNumber(b);
    return blockDelta || logIndexNumber(a) - logIndexNumber(b);
  });
}

function applyAccountingLog(log, iface, accounts, totalsRaw, counters, records) {
  let parsed;
  try {
    parsed = iface.parseLog({ topics: log.topics, data: log.data });
  } catch (_error) {
    return;
  }
  if (!parsed) return;

  const blockNumber = logBlockNumber(log);
  const args = parsed.args;
  bumpCounter(counters, "contractEvents");

  if (parsed.name === "Transfer") {
    const from = ensureAccountingAccount(accounts, args.from);
    const to = ensureAccountingAccount(accounts, args.to);
    if (from) {
      addRawAmount(from.raw, "tokenSent", args.value);
      touchAccountingAccount(from, blockNumber);
      bumpCounter(from.eventCounts, "ledger");
    }
    if (to) {
      addRawAmount(to.raw, "tokenReceived", args.value);
      touchAccountingAccount(to, blockNumber);
      bumpCounter(to.eventCounts, "ledger");
    }
    addRawAmount(totalsRaw, "tokenTransferred", args.value);
    bumpCounter(counters, "transferRecords");
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "ledger", log, "Transfer", {
      user: !isZeroAddress(args.to) ? args.to : args.from,
      from: args.from,
      to: args.to,
      amount: fmt(args.value),
      amountRaw: args.value.toString(),
    });
    return;
  }

  if (parsed.name === "UsdtDeposited") {
    const account = addAccountAmount(accounts, args.user, "usdtDeposited", args.usdtAmount, blockNumber);
    addAccountAmount(accounts, args.user, "kntUsed", args.kntUsed, blockNumber);
    addAccountAmount(accounts, args.user, "labubuUsed", args.labubuUsed, blockNumber);
    addAccountAmount(accounts, args.user, "lpAmount", args.lpAmount, blockNumber);
    addAccountAmount(accounts, args.user, "lpValueUsdt", args.lpValueUsdt, blockNumber);
    if (account) bumpCounter(account.eventCounts, "deposits");
    addRawAmount(totalsRaw, "usdtDeposited", args.usdtAmount);
    addRawAmount(totalsRaw, "kntUsed", args.kntUsed);
    addRawAmount(totalsRaw, "labubuUsed", args.labubuUsed);
    addRawAmount(totalsRaw, "lpAmount", args.lpAmount);
    addRawAmount(totalsRaw, "lpValueUsdt", args.lpValueUsdt);
    bumpCounter(counters, "depositRecords");
    pushAccountingRecord(records, "deposits", log, "UsdtDeposited", {
      user: args.user,
      usdtAmount: fmt(args.usdtAmount),
      usdtAmountRaw: args.usdtAmount.toString(),
      kntUsed: fmt(args.kntUsed),
      kntUsedRaw: args.kntUsed.toString(),
      labubuUsed: fmt(args.labubuUsed),
      labubuUsedRaw: args.labubuUsed.toString(),
      lpAmount: fmt(args.lpAmount),
      lpAmountRaw: args.lpAmount.toString(),
      lpValueUsdt: fmt(args.lpValueUsdt),
      lpValueUsdtRaw: args.lpValueUsdt.toString(),
    });
    return;
  }

  if (parsed.name === "Deposited") {
    const account = addAccountAmount(accounts, args.user, "depositAmount", args.amount, blockNumber);
    addAccountAmount(accounts, args.user, "depositLpValueUsdt", args.lpValueUsdt, blockNumber);
    addAccountAmount(accounts, args.user, "addedPower", args.addedPower, blockNumber);
    if (account) bumpCounter(account.eventCounts, "deposits");
    addRawAmount(totalsRaw, "depositAmount", args.amount);
    addRawAmount(totalsRaw, "depositLpValueUsdt", args.lpValueUsdt);
    addRawAmount(totalsRaw, "addedPower", args.addedPower);
    bumpCounter(counters, "depositRecords");
    pushAccountingRecord(records, "deposits", log, "Deposited", {
      user: args.user,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
      lpValueUsdt: fmt(args.lpValueUsdt),
      lpValueUsdtRaw: args.lpValueUsdt.toString(),
      addedPower: fmt(args.addedPower),
      addedPowerRaw: args.addedPower.toString(),
    });
    return;
  }

  if (parsed.name === "UserLpCredited") {
    const account = addAccountAmount(accounts, args.account, "userLpCredited", args.lpAmount, blockNumber);
    addAccountAmount(accounts, args.account, "userLpCreditedValueUsdt", args.lpValueUsdt, blockNumber);
    if (account) bumpCounter(account.eventCounts, "deposits");
    addRawAmount(totalsRaw, "userLpCredited", args.lpAmount);
    addRawAmount(totalsRaw, "userLpCreditedValueUsdt", args.lpValueUsdt);
    bumpCounter(counters, "depositRecords");
    pushAccountingRecord(records, "deposits", log, "UserLpCredited", {
      user: args.account,
      lpAmount: fmt(args.lpAmount),
      lpAmountRaw: args.lpAmount.toString(),
      lpValueUsdt: fmt(args.lpValueUsdt),
      lpValueUsdtRaw: args.lpValueUsdt.toString(),
    });
    return;
  }

  if (parsed.name === "UsdtDepositProcessed") {
    const account = ensureAccountingAccount(accounts, args.account);
    touchAccountingAccount(account, blockNumber);
    if (account) bumpCounter(account.eventCounts, "deposits");
    bumpCounter(counters, "depositProcessRecords");
    pushAccountingRecord(records, "deposits", log, "UsdtDepositProcessed", {
      depositId: args.depositId,
      user: args.account,
      operator: args.operator,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    return;
  }

  if (parsed.name === "KeeperLpReduced") {
    const account = addAccountAmount(accounts, args.account, "keeperLpReduced", args.lpAmount, blockNumber);
    addAccountAmount(accounts, args.account, "keeperLpReducedValueUsdt", args.lpValueUsdt, blockNumber);
    ensureAccountingAccount(accounts, args.operator);
    if (account) bumpCounter(account.eventCounts, "ledger");
    addRawAmount(totalsRaw, "keeperLpReduced", args.lpAmount);
    addRawAmount(totalsRaw, "keeperLpReducedValueUsdt", args.lpValueUsdt);
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "ledger", log, "KeeperLpReduced", {
      user: args.account,
      operator: args.operator,
      lpAmount: fmt(args.lpAmount),
      lpAmountRaw: args.lpAmount.toString(),
      lpValueUsdt: fmt(args.lpValueUsdt),
      lpValueUsdtRaw: args.lpValueUsdt.toString(),
    });
    return;
  }

  if (parsed.name === "RewardDistributed") {
    const account = addAccountAmount(accounts, args.user, "rewardsReceived", args.amount, blockNumber);
    ensureAccountingAccount(accounts, args.operator);
    if (account) bumpCounter(account.eventCounts, "rewards");
    addRawAmount(totalsRaw, "rewardsReceived", args.amount);
    bumpCounter(counters, "rewardRecords");
    pushAccountingRecord(records, "rewards", log, "RewardDistributed", {
      user: args.user,
      operator: args.operator,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    return;
  }

  if (parsed.name === "StaticRewardAccrued") {
    const account = addAccountAmount(accounts, args.user, "staticRewardsAccrued", args.amount, blockNumber);
    if (account) {
      bumpCounter(account.eventCounts, "rewards");
      bumpCounter(account.eventCounts, "staticRewards");
    }
    addRawAmount(totalsRaw, "staticRewardsAccrued", args.amount);
    bumpCounter(counters, "staticRewardRecords");
    bumpCounter(counters, "rewardAccrualRecords");
    pushAccountingRecord(records, "staticRewards", log, "StaticRewardAccrued", {
      user: args.user,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    return;
  }

  if (parsed.name === "DynamicRewardAccrued") {
    const receiver = addAccountAmount(accounts, args.receiver, "dynamicRewardsAccrued", args.amount, blockNumber);
    const source = ensureAccountingAccount(accounts, args.source);
    touchAccountingAccount(source, blockNumber);
    if (receiver) {
      bumpCounter(receiver.eventCounts, "rewards");
      bumpCounter(receiver.eventCounts, "dynamicRewards");
    }
    addRawAmount(totalsRaw, "dynamicRewardsAccrued", args.amount);
    bumpCounter(counters, "dynamicRewardRecords");
    bumpCounter(counters, "rewardAccrualRecords");
    pushAccountingRecord(records, "dynamicRewards", log, "DynamicRewardAccrued", {
      user: args.receiver,
      source: args.source,
      receiver: args.receiver,
      level: args.level.toString(),
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    return;
  }

  if (parsed.name === "QueuePaid") {
    const account = addAccountAmount(accounts, args.user, "queueRewardsReceived", args.rewardAmount, blockNumber);
    if (account) bumpCounter(account.eventCounts, "rewards");
    if (account) bumpCounter(account.eventCounts, "burns");
    addRawAmount(totalsRaw, "queueRewardsReceived", args.rewardAmount);
    bumpCounter(counters, "rewardRecords");
    bumpCounter(counters, "burnRecords");
    pushAccountingRecord(records, "rewards", log, "QueuePaid", {
      user: args.user,
      index: args.index.toString(),
      amount: fmt(args.rewardAmount),
      amountRaw: args.rewardAmount.toString(),
    });
    pushAccountingRecord(records, "burns", log, "QueuePaid", {
      user: args.user,
      index: args.index.toString(),
      rewardAmount: fmt(args.rewardAmount),
      rewardAmountRaw: args.rewardAmount.toString(),
    });
    return;
  }

  if (parsed.name === "ReferrerBound") {
    const account = ensureAccountingAccount(accounts, args.user);
    const referrer = ensureAccountingAccount(accounts, args.referrer);
    touchAccountingAccount(account, blockNumber);
    touchAccountingAccount(referrer, blockNumber);
    if (account) {
      account.referrer = checksumAddress(args.referrer);
      bumpCounter(account.eventCounts, "referrals");
    }
    if (referrer) referrer.directReferralEventCount += 1;
    bumpCounter(counters, "referralRecords");
    pushAccountingRecord(records, "referrals", log, "ReferrerBound", {
      user: args.user,
      referrer: args.referrer,
    });
    return;
  }

  if (parsed.name === "ReferralSignal") {
    const from = ensureAccountingAccount(accounts, args.from);
    const to = ensureAccountingAccount(accounts, args.to);
    touchAccountingAccount(from, blockNumber);
    touchAccountingAccount(to, blockNumber);
    if (from) from.referralSignalsSent += 1;
    if (to) to.referralSignalsReceived += 1;
    addRawAmount(totalsRaw, "referralSignalAmount", args.amount);
    bumpCounter(counters, "referralRecords");
    pushAccountingRecord(records, "referrals", log, "ReferralSignal", {
      from: args.from,
      to: args.to,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    return;
  }

  if (parsed.name === "BurnQueued") {
    const account = addAccountAmount(accounts, args.user, "burnQueuedAmount", args.burnedAmount, blockNumber);
    addAccountAmount(accounts, args.user, "burnQueuedReward", args.rewardAmount, blockNumber);
    if (account) {
      bumpCounter(account.eventCounts, "burns");
      bumpCounter(account.eventCounts, "ledger");
    }
    addRawAmount(totalsRaw, "burnQueuedAmount", args.burnedAmount);
    addRawAmount(totalsRaw, "burnQueuedReward", args.rewardAmount);
    bumpCounter(counters, "burnRecords");
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "burns", log, "BurnQueued", {
      user: args.user,
      index: args.index.toString(),
      burnedAmount: fmt(args.burnedAmount),
      burnedAmountRaw: args.burnedAmount.toString(),
      rewardAmount: fmt(args.rewardAmount),
      rewardAmountRaw: args.rewardAmount.toString(),
    });
    pushAccountingRecord(records, "ledger", log, "BurnQueued", {
      user: args.user,
      index: args.index.toString(),
      burnedAmount: fmt(args.burnedAmount),
      burnedAmountRaw: args.burnedAmount.toString(),
      rewardAmount: fmt(args.rewardAmount),
      rewardAmountRaw: args.rewardAmount.toString(),
    });
    return;
  }

  if (parsed.name === "BuyRecorded") {
    const account = addAccountAmount(accounts, args.account, "buyKnt", args.kntAmount, blockNumber);
    addAccountAmount(accounts, args.account, "buyUsdtSpent", args.usdtSpent, blockNumber);
    if (account) bumpCounter(account.eventCounts, "ledger");
    addRawAmount(totalsRaw, "buyKnt", args.kntAmount);
    addRawAmount(totalsRaw, "buyUsdtSpent", args.usdtSpent);
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "ledger", log, "BuyRecorded", {
      user: args.account,
      kntAmount: fmt(args.kntAmount),
      kntAmountRaw: args.kntAmount.toString(),
      usdtSpent: fmt(args.usdtSpent),
      usdtSpentRaw: args.usdtSpent.toString(),
    });
    return;
  }

  if (parsed.name === "SellSettled") {
    const account = addAccountAmount(accounts, args.account, "sellGross", args.grossAmount, blockNumber);
    addAccountAmount(accounts, args.account, "sellNet", args.netAmount, blockNumber);
    addAccountAmount(accounts, args.account, "sellTax", args.sellTax, blockNumber);
    addAccountAmount(accounts, args.account, "profitTax", args.profitTax, blockNumber);
    addAccountAmount(accounts, args.account, "dumpTax", args.dumpTax, blockNumber);
    if (account) {
      bumpCounter(account.eventCounts, "ledger");
      bumpCounter(account.eventCounts, "taxes");
    }
    addRawAmount(totalsRaw, "sellGross", args.grossAmount);
    addRawAmount(totalsRaw, "sellNet", args.netAmount);
    addRawAmount(totalsRaw, "sellTax", args.sellTax);
    addRawAmount(totalsRaw, "profitTax", args.profitTax);
    addRawAmount(totalsRaw, "dumpTax", args.dumpTax);
    bumpCounter(counters, "taxRecords");
    pushAccountingRecord(records, "taxes", log, "SellTaxSettled", {
      user: args.account,
      grossAmount: fmt(args.grossAmount),
      grossAmountRaw: args.grossAmount.toString(),
      netAmount: fmt(args.netAmount),
      netAmountRaw: args.netAmount.toString(),
      transactionTax: fmt(args.sellTax),
      transactionTaxRaw: args.sellTax.toString(),
      valueAddedTax: fmt(args.profitTax),
      valueAddedTaxRaw: args.profitTax.toString(),
      dumpTax: fmt(args.dumpTax),
      dumpTaxRaw: args.dumpTax.toString(),
      totalTax: fmt(taxTotal(args.sellTax, args.profitTax, args.dumpTax)),
      totalTaxRaw: taxTotal(args.sellTax, args.profitTax, args.dumpTax).toString(),
    });
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "ledger", log, "SellSettled", {
      user: args.account,
      grossAmount: fmt(args.grossAmount),
      grossAmountRaw: args.grossAmount.toString(),
      netAmount: fmt(args.netAmount),
      netAmountRaw: args.netAmount.toString(),
      sellTax: fmt(args.sellTax),
      sellTaxRaw: args.sellTax.toString(),
      profitTax: fmt(args.profitTax),
      profitTaxRaw: args.profitTax.toString(),
      dumpTax: fmt(args.dumpTax),
      dumpTaxRaw: args.dumpTax.toString(),
    });
    return;
  }

  if (parsed.name === "LiquidityKntBurned") {
    const account = addAccountAmount(accounts, args.account, "liquidityKntBurned", args.amount, blockNumber);
    if (account) {
      bumpCounter(account.eventCounts, "burns");
      bumpCounter(account.eventCounts, "ledger");
    }
    addRawAmount(totalsRaw, "liquidityKntBurned", args.amount);
    bumpCounter(counters, "burnRecords");
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "burns", log, "LiquidityKntBurned", {
      user: args.account,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    pushAccountingRecord(records, "ledger", log, "LiquidityKntBurned", {
      user: args.account,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    return;
  }

  if (parsed.name === "KeeperBurned") {
    const account = addAccountAmount(accounts, args.account, "keeperBurned", args.amount, blockNumber);
    ensureAccountingAccount(accounts, args.operator);
    if (account) {
      bumpCounter(account.eventCounts, "burns");
      bumpCounter(account.eventCounts, "ledger");
    }
    addRawAmount(totalsRaw, "keeperBurned", args.amount);
    bumpCounter(counters, "burnRecords");
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "burns", log, "KeeperBurned", {
      user: args.account,
      operator: args.operator,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    pushAccountingRecord(records, "ledger", log, "KeeperBurned", {
      user: args.account,
      operator: args.operator,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    return;
  }

  if (parsed.name === "KeeperActionProcessed") {
    const account = ensureAccountingAccount(accounts, args.account);
    if (account) bumpCounter(account.eventCounts, "ledger");
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "ledger", log, "KeeperActionProcessed", {
      user: args.account,
      actionId: args.actionId,
      sourceTxHash: args.sourceTxHash,
      sourceLogIndex: args.sourceLogIndex.toString(),
      actionType: args.actionType,
    });
    return;
  }

  if (parsed.name === "RewardsFunded") {
    const account = addAccountAmount(accounts, args.from, "rewardsFunded", args.amount, blockNumber);
    if (account) bumpCounter(account.eventCounts, "ledger");
    addRawAmount(totalsRaw, "rewardsFunded", args.amount);
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "ledger", log, "RewardsFunded", {
      user: args.from,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    return;
  }

  if (parsed.name === "DynamicSunk") {
    const account = addAccountAmount(accounts, args.source, "dynamicSunkFrom", args.amount, blockNumber);
    if (account) bumpCounter(account.eventCounts, "ledger");
    addRawAmount(totalsRaw, "dynamicSunkFrom", args.amount);
    bumpCounter(counters, "dynamicSunkRecords");
    pushAccountingRecord(records, "dynamicRewards", log, "DynamicSunk", {
      user: args.source,
      source: args.source,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
      status: "sunk",
    });
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "ledger", log, "DynamicSunk", {
      user: args.source,
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    return;
  }

  if (parsed.name === "MigrationMinted" || parsed.name === "MigrationClaimed") {
    const key = parsed.name === "MigrationMinted" ? "migrationMinted" : "migrationClaimed";
    const account = addAccountAmount(accounts, args.account, key, args.amount, blockNumber);
    if (account) bumpCounter(account.eventCounts, "ledger");
    addRawAmount(totalsRaw, key, args.amount);
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "ledger", log, parsed.name, {
      user: args.account,
      id: args.id.toString(),
      amount: fmt(args.amount),
      amountRaw: args.amount.toString(),
    });
    return;
  }

  if (parsed.name === "OwnershipTransferred") {
    const previousOwner = ensureAccountingAccount(accounts, args.previousOwner);
    const newOwner = ensureAccountingAccount(accounts, args.newOwner);
    touchAccountingAccount(previousOwner, blockNumber);
    touchAccountingAccount(newOwner, blockNumber);
    if (previousOwner) bumpCounter(previousOwner.eventCounts, "ownerTransfers");
    if (newOwner) bumpCounter(newOwner.eventCounts, "ownerTransfers");
    bumpCounter(counters, "ownerTransferRecords");
    pushAccountingRecord(records, "ownerTransfers", log, "OwnershipTransferred", {
      user: args.newOwner,
      previousOwner: args.previousOwner,
      newOwner: args.newOwner,
    });
    return;
  }

  if (parsed.name === "ManagerUpdated") {
    const account = ensureAccountingAccount(accounts, args.manager);
    touchAccountingAccount(account, blockNumber);
    if (account) {
      account.managerEnabledFromLastEvent = Boolean(args.enabled);
      bumpCounter(account.eventCounts, "managers");
    }
    bumpCounter(counters, "managerRecords");
    pushAccountingRecord(records, "managers", log, "ManagerUpdated", {
      user: args.manager,
      manager: args.manager,
      enabled: Boolean(args.enabled),
    });
    return;
  }

  if (parsed.name === "NodeStatusUpdated") {
    const account = ensureAccountingAccount(accounts, args.user);
    touchAccountingAccount(account, blockNumber);
    if (account) {
      account.isNodeFromLastEvent = Boolean(args.isNode);
      bumpCounter(account.eventCounts, "ledger");
    }
    bumpCounter(counters, "ledgerRecords");
    pushAccountingRecord(records, "ledger", log, "NodeStatusUpdated", {
      user: args.user,
      isNode: Boolean(args.isNode),
    });
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function formatUserInfo(info) {
  return {
    registered: Boolean(info.registered ?? info[0]),
    referrer: checksumAddress(info.referrer ?? info[1]) || ethers.ZeroAddress,
    depositAmount: fmt(info.depositAmount ?? info[2]),
    depositAmountRaw: (info.depositAmount ?? info[2] ?? 0n).toString(),
    lpValueUsdt: fmt(info.lpValueUsdt ?? info[3]),
    lpValueUsdtRaw: (info.lpValueUsdt ?? info[3] ?? 0n).toString(),
    power: fmt(info.power ?? info[4]),
    powerRaw: (info.power ?? info[4] ?? 0n).toString(),
    lastPowerUpdateDay: (info.lastPowerUpdateDay ?? info[5] ?? 0n).toString(),
    rewardDebt: fmt(info.rewardDebt ?? info[6]),
    rewardDebtRaw: (info.rewardDebt ?? info[6] ?? 0n).toString(),
    pendingKnt: fmt(info.pendingKnt ?? info[7]),
    pendingKntRaw: (info.pendingKnt ?? info[7] ?? 0n).toString(),
    directLpValueUsdt: fmt(info.directLpValueUsdt ?? info[8]),
    directLpValueUsdtRaw: (info.directLpValueUsdt ?? info[8] ?? 0n).toString(),
    directEffectiveCount: (info.directEffectiveCount ?? info[9] ?? 0n).toString(),
    isNode: Boolean(info.isNode ?? info[10]),
    nodeRewardDebt: fmt(info.nodeRewardDebt ?? info[11]),
    nodeRewardDebtRaw: (info.nodeRewardDebt ?? info[11] ?? 0n).toString(),
    totalStaticReward: fmt(info.totalStaticReward ?? info[12]),
    totalStaticRewardRaw: (info.totalStaticReward ?? info[12] ?? 0n).toString(),
    totalDynamicReward: fmt(info.totalDynamicReward ?? info[13]),
    totalDynamicRewardRaw: (info.totalDynamicReward ?? info[13] ?? 0n).toString(),
    totalNodeReward: fmt(info.totalNodeReward ?? info[14]),
    totalNodeRewardRaw: (info.totalNodeReward ?? info[14] ?? 0n).toString(),
  };
}

function formatCostBasis(info) {
  return {
    boughtKnt: fmt(info.boughtKnt ?? info[0]),
    boughtKntRaw: (info.boughtKnt ?? info[0] ?? 0n).toString(),
    spentUsdt: fmt(info.spentUsdt ?? info[1]),
    spentUsdtRaw: (info.spentUsdt ?? info[1] ?? 0n).toString(),
  };
}

async function loadOnChainAccount(knt, account) {
  try {
    const [info, costBasis, balance, directReferrals] = await Promise.all([
      knt.users(account),
      knt.costBasisOf(account),
      knt.balanceOf(account),
      knt.directReferralsOf(account),
    ]);
    const referrals = Array.from(directReferrals || []).map((item) => checksumAddress(item) || item);
    return {
      user: formatUserInfo(info),
      costBasis: formatCostBasis(costBasis),
      balance: fmt(balance),
      balanceRaw: balance.toString(),
      directReferrals: referrals,
      directReferralCount: referrals.length,
    };
  } catch (error) {
    return { error: error.shortMessage || error.message };
  }
}

function sortRecentRecords(items) {
  return items.slice().sort((a, b) => {
    const blockDelta = Number(b.blockNumber || 0) - Number(a.blockNumber || 0);
    return blockDelta || Number(b.logIndex || 0) - Number(a.logIndex || 0);
  });
}

async function loadAccounting(env, searchParams = new URLSearchParams()) {
  const deployment = requireDeployment(env);
  const provider = providerFor(env);
  const knt = kntContract(env, provider);
  const latestBlock = Number(BigInt(await rpcCall(deployment, "eth_blockNumber", [])));
  const fromBlock = Math.max(0, queryNumber(searchParams, "fromBlock", envNumber(env, "ACCOUNTING_START_BLOCK", envNumber(env, "KEEPER_START_BLOCK", 0))));
  const requestedToBlock = queryNumber(searchParams, "toBlock", latestBlock);
  const toBlock = Math.min(latestBlock, Math.max(0, requestedToBlock));
  const chunkSize = Math.max(1, envNumber(env, "ACCOUNTING_LOG_CHUNK_BLOCKS", 2000));
  const userLimit = Math.max(1, Math.min(2000, queryNumber(searchParams, "userLimit", envNumber(env, "ACCOUNTING_USER_LIMIT", 500))));
  const recordLimit = Math.max(10, Math.min(500, queryNumber(searchParams, "limit", envNumber(env, "ACCOUNTING_RECORD_LIMIT", 500))));
  const rewardPool = await knt.rewardPool();

  if (toBlock < fromBlock) {
    return {
      ok: true,
      deployment,
      fromBlock,
      toBlock,
      latestBlock,
      chunkSize,
      users: [],
      totals: {
        userCount: 0,
        loadedUserCount: 0,
        registeredCount: 0,
        raw: {},
      },
      rewardPool: fmt(rewardPool),
      rewardPoolRaw: rewardPool.toString(),
      records: { deposits: [], rewards: [], staticRewards: [], dynamicRewards: [], referrals: [], burns: [], taxes: [], managers: [], ownerTransfers: [], ledger: [] },
      recordTotals: {
        deposits: 0,
        rewards: 0,
        staticRewards: 0,
        dynamicRewards: 0,
        referrals: 0,
        burns: 0,
        taxes: 0,
        managers: 0,
        ownerTransfers: 0,
        ledger: 0,
      },
    };
  }

  const logs = await scanContractLogs(deployment, fromBlock, toBlock, chunkSize);
  const iface = new ethers.Interface(KNT_ABI);
  const accounts = new Map();
  const totalsRaw = {};
  const counters = {};
  const records = {
    deposits: [],
    rewards: [],
    staticRewards: [],
    dynamicRewards: [],
    referrals: [],
    burns: [],
    taxes: [],
    managers: [],
    ownerTransfers: [],
    ledger: [],
  };

  for (const log of logs) {
    applyAccountingLog(log, iface, accounts, totalsRaw, counters, records);
  }

  const accountEntries = Array.from(accounts.values()).sort((a, b) => {
    const blockDelta = Number(b.lastActivityBlock || 0) - Number(a.lastActivityBlock || 0);
    return blockDelta || a.account.localeCompare(b.account);
  });
  const loadedEntries = accountEntries.slice(0, userLimit);
  const onChainAccounts = await mapWithConcurrency(
    loadedEntries,
    envNumber(env, "ACCOUNTING_USER_RPC_CONCURRENCY", 6),
    async (entry) => loadOnChainAccount(knt, entry.account)
  );

  const users = loadedEntries.map((entry, index) => {
    const current = onChainAccounts[index] || {};
    const referrerFromChain = current.user?.referrer && !isZeroAddress(current.user.referrer) ? current.user.referrer : null;
    const referrer = referrerFromChain || entry.referrer || null;
    return {
      account: entry.account,
      referrer,
      firstActivityBlock: entry.firstActivityBlock,
      lastActivityBlock: entry.lastActivityBlock,
      eventCounts: entry.eventCounts,
      referralSignalsSent: entry.referralSignalsSent,
      referralSignalsReceived: entry.referralSignalsReceived,
      directReferralEventCount: entry.directReferralEventCount,
      eventTotals: formatRawAmounts(entry.raw),
      eventTotalsRaw: entry.raw,
      current,
    };
  });

  const registeredCount = users.filter((item) => item.current?.user?.registered).length;
  const sortedRecords = {
    deposits: sortRecentRecords(records.deposits),
    rewards: sortRecentRecords(records.rewards),
    staticRewards: sortRecentRecords(records.staticRewards),
    dynamicRewards: sortRecentRecords(records.dynamicRewards),
    referrals: sortRecentRecords(records.referrals),
    burns: sortRecentRecords(records.burns),
    taxes: sortRecentRecords(records.taxes),
    managers: sortRecentRecords(records.managers),
    ownerTransfers: sortRecentRecords(records.ownerTransfers),
    ledger: sortRecentRecords(records.ledger),
  };

  return {
    ok: true,
    deployment,
    fromBlock,
    toBlock,
    latestBlock,
    chunkSize,
    logCount: logs.length,
    truncatedUsers: accountEntries.length > loadedEntries.length,
    totals: {
      ...counters,
      userCount: accountEntries.length,
      loadedUserCount: users.length,
      registeredCount,
      ...formatRawAmounts(totalsRaw),
      raw: totalsRaw,
    },
    users,
    rewardPool: fmt(rewardPool),
    rewardPoolRaw: rewardPool.toString(),
    records: {
      deposits: sortedRecords.deposits.slice(0, recordLimit),
      rewards: sortedRecords.rewards.slice(0, recordLimit),
      staticRewards: sortedRecords.staticRewards.slice(0, recordLimit),
      dynamicRewards: sortedRecords.dynamicRewards.slice(0, recordLimit),
      referrals: sortedRecords.referrals.slice(0, recordLimit),
      burns: sortedRecords.burns.slice(0, recordLimit),
      taxes: sortedRecords.taxes.slice(0, recordLimit),
      managers: sortedRecords.managers.slice(0, recordLimit),
      ownerTransfers: sortedRecords.ownerTransfers.slice(0, recordLimit),
      ledger: sortedRecords.ledger.slice(0, recordLimit),
    },
    recordTotals: {
      deposits: records.deposits.length,
      rewards: records.rewards.length,
      staticRewards: records.staticRewards.length,
      dynamicRewards: records.dynamicRewards.length,
      referrals: records.referrals.length,
      burns: records.burns.length,
      taxes: records.taxes.length,
      managers: records.managers.length,
      ownerTransfers: records.ownerTransfers.length,
      ledger: records.ledger.length,
    },
  };
}

async function runObserverScan(env) {
  const deployment = requireDeployment(env);
  const state = await readAdminState(env);
  const settings = state.keeperSettings.observer;
  const provider = providerFor(env);
  const knt = kntContract(env, provider);
  const usdt = new ethers.Interface(ERC20_ABI);
  const latestBlock = Number(BigInt(await rpcCall(deployment, "eth_blockNumber", [])));
  const fromBlock = Number(state.observerLastScannedBlock || env.KEEPER_START_BLOCK || 0);
  const confirmedToBlock = Math.max(0, latestBlock - settings.confirmations);
  const toBlock = Math.min(confirmedToBlock, fromBlock + settings.scanMaxBlocks - 1);

  const run = {
    startedAt: new Date().toISOString(),
    type: "observer",
    fromBlock,
    toBlock,
    discovered: 0,
    processedOnChain: 0,
    pendingOnChain: 0,
  };

  if (toBlock < fromBlock) {
    run.status = "skipped";
    run.reason = "no confirmed blocks";
    run.finishedAt = new Date().toISOString();
    state.observerRuns.push(run);
    await writeAdminState(env, state);
    return run;
  }

  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const toTopic = ethers.zeroPadValue(deployment.contract, 32);
  const logs = await rpcCall(deployment, "eth_getLogs", [{
    address: deployment.usdt,
    fromBlock: toRpcQuantity(fromBlock),
    toBlock: toRpcQuantity(toBlock),
    topics: [transferTopic, null, toTopic],
  }]);
  run.discovered = logs.length;

  const coder = ethers.AbiCoder.defaultAbiCoder();
  for (const log of logs) {
    const parsed = usdt.parseLog(log);
    const logIndex = Number(BigInt(log.logIndex ?? log.index ?? "0x0"));
    const depositId = ethers.keccak256(coder.encode(["bytes32", "uint256"], [log.transactionHash, logIndex]));
    const processed = await knt.processedUsdtDeposits(depositId);
    if (processed) run.processedOnChain += 1;
    else run.pendingOnChain += 1;
    state.observedDeposits.push({
      detectedAt: new Date().toISOString(),
      status: processed ? "processed-on-chain" : "pending",
      depositId,
      user: parsed.args.from,
      amount: fmt(parsed.args.value),
      rawAmount: parsed.args.value.toString(),
      txHash: log.transactionHash,
      blockNumber: Number(BigInt(log.blockNumber ?? "0x0")),
      logIndex,
    });
  }

  state.observerLastScannedBlock = toBlock + 1;
  run.status = "processed";
  run.finishedAt = new Date().toISOString();
  state.observerRuns.push(run);
  await writeAdminState(env, state);
  return run;
}

async function runProcessUsdtDeposits(env) {
  const deployment = requireDeployment(env);
  const state = await readAdminState(env);
  const settings = state.keeperSettings.deposit;
  const signer = signerFor(env);
  const usdt = new ethers.Interface(ERC20_ABI);
  const knt = kntContract(env, signer);
  const latestBlock = Number(BigInt(await rpcCall(deployment, "eth_blockNumber", [])));
  const confirmations = settings.confirmations;
  const fromBlock = Number(state.lastScannedBlock || env.KEEPER_START_BLOCK || 0);
  const confirmedToBlock = Math.max(0, latestBlock - confirmations);
  const maxScanBlocks = settings.scanMaxBlocks;
  const toBlock = maxScanBlocks > 0 ? Math.min(confirmedToBlock, fromBlock + maxScanBlocks - 1) : confirmedToBlock;

  const run = {
    startedAt: new Date().toISOString(),
    keeper: await signer.getAddress(),
    fromBlock,
    toBlock,
    discovered: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
  };

  if (toBlock < fromBlock) {
    run.status = "skipped";
    run.reason = "no confirmed blocks";
    run.finishedAt = new Date().toISOString();
    state.runs.push(run);
    await writeAdminState(env, state);
    return run;
  }

  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const toTopic = ethers.zeroPadValue(deployment.contract, 32);
  const logs = await rpcCall(deployment, "eth_getLogs", [{
    address: deployment.usdt,
    fromBlock: toRpcQuantity(fromBlock),
    toBlock: toRpcQuantity(toBlock),
    topics: [transferTopic, null, toTopic],
  }]);
  run.discovered = logs.length;

  const coder = ethers.AbiCoder.defaultAbiCoder();
  const deadlineSeconds = settings.deadlineSeconds;
  const minDeposit = ethers.parseEther(settings.minDepositUsdt || "0");
  const maxDeposit = ethers.parseEther(settings.maxDepositUsdt || "0");
  for (const log of logs) {
    const parsed = usdt.parseLog(log);
    const logIndex = Number(BigInt(log.logIndex ?? log.index ?? "0x0"));
    const blockNumber = Number(BigInt(log.blockNumber ?? "0x0"));
    const account = parsed.args.from;
    const amount = parsed.args.value;
    const depositId = ethers.keccak256(coder.encode(["bytes32", "uint256"], [log.transactionHash, logIndex]));
    const entry = {
      detectedAt: new Date().toISOString(),
      status: "detected",
      depositId,
      user: account,
      amount: fmt(amount),
      rawAmount: amount.toString(),
      txHash: log.transactionHash,
      blockNumber,
      logIndex,
    };

    try {
      if (await knt.processedUsdtDeposits(depositId)) {
        entry.status = "skipped";
        entry.reason = "already processed on-chain";
        run.skipped += 1;
      } else if (amount < minDeposit) {
        entry.status = "skipped";
        entry.reason = "below min deposit";
        run.skipped += 1;
      } else if (maxDeposit > 0n && amount > maxDeposit) {
        entry.status = "skipped";
        entry.reason = "above max deposit";
        run.skipped += 1;
      } else {
        const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
        const tx = await knt.processUsdtDeposit(account, amount, depositId, 0, 0, 0, 0, 0, deadline);
        const receipt = await tx.wait(1);
        entry.status = "processed";
        entry.processedAt = new Date().toISOString();
        entry.processTx = receipt.hash;
        Object.assign(entry, parseKntReceipt(receipt));
        run.processed += 1;
      }
    } catch (error) {
      entry.status = "failed";
      entry.error = error.shortMessage || error.message;
      run.failed += 1;
    }

    state.deposits.push(entry);
    await writeAdminState(env, state);
  }

  state.lastScannedBlock = toBlock + 1;
  run.status = run.failed > 0 ? "failed" : "processed";
  run.finishedAt = new Date().toISOString();
  state.runs.push(run);
  await writeAdminState(env, state);
  return run;
}

async function runLpExitSync(env, options = {}) {
  return withKeeperLock(env, "lp-sync", async () => {
    const deployment = requireDeployment(env);
    if (!ethers.isAddress(deployment.labubuPair || "")) throw new Error("KNT_LABUBU_PAIR is not configured");

    const state = await readAdminState(env);
    const settings = state.keeperSettings.lpSync;
    const signer = signerFor(env);
    const knt = kntContract(env, signer);
    const lpIface = new ethers.Interface(ERC20_ABI);
    const kntIface = new ethers.Interface(ERC20_ABI);
    const latestBlock = Number(BigInt(await rpcCall(deployment, "eth_blockNumber", [])));
    const confirmations = settings.confirmations;
    const fromBlock = Number(state.lpSyncLastScannedBlock || env.KEEPER_START_BLOCK || 0);
    const confirmedToBlock = Math.max(0, latestBlock - confirmations);
    const toBlock = Math.min(confirmedToBlock, fromBlock + settings.scanMaxBlocks - 1);
    const maxActions = Number(options.maxActions ?? settings.maxActions ?? 20);

    const run = {
      startedAt: new Date().toISOString(),
      keeper: await signer.getAddress(),
      type: "lpSync",
      fromBlock,
      toBlock,
      discovered: 0,
      reduced: 0,
      burned: 0,
      skipped: 0,
      manualReview: 0,
      failed: 0,
      actions: [],
    };

    if (toBlock < fromBlock) {
      run.status = "skipped";
      run.reason = "no confirmed blocks";
      run.finishedAt = new Date().toISOString();
      state.lpSyncRuns.push(run);
      await writeAdminState(env, state);
      return run;
    }

    const transferTopic = ethers.id("Transfer(address,address,uint256)");
    const logs = await rpcCall(deployment, "eth_getLogs", [{
      address: deployment.labubuPair,
      fromBlock: toRpcQuantity(fromBlock),
      toBlock: toRpcQuantity(toBlock),
      topics: [transferTopic],
    }]);
    run.discovered = logs.length;

    for (const log of logs) {
      if (maxActions > 0 && run.reduced + run.burned >= maxActions) {
        run.skipped += 1;
        continue;
      }

      const parsed = lpIface.parseLog(log);
      const from = ethers.getAddress(parsed.args.from);
      const to = ethers.getAddress(parsed.args.to);
      const amount = parsed.args.value;
      const logIndex = Number(BigInt(log.logIndex ?? log.index ?? "0x0"));
      const blockNumber = Number(BigInt(log.blockNumber ?? "0x0"));
      const entry = {
        detectedAt: new Date().toISOString(),
        status: "detected",
        kind: "lp-transfer-out",
        user: from,
        to,
        lpAmount: fmt(amount),
        lpAmountRaw: amount.toString(),
        txHash: log.transactionHash,
        blockNumber,
        logIndex,
      };

      try {
        if (
          amount === 0n ||
          isZeroAddress(from) ||
          normalize(from) === normalize(deployment.labubuPair) ||
          normalize(from) === normalize(deployment.contract)
        ) {
          entry.status = "skipped";
          entry.reason = "not a user LP transfer out";
          run.skipped += 1;
        } else {
          const userInfo = await knt.users(from);
          const depositAmount = BigInt(userInfo.depositAmount ?? userInfo[2] ?? 0n);
          if (depositAmount === 0n) {
            entry.status = "skipped";
            entry.reason = "user has no accounted LP";
            run.skipped += 1;
          } else if (amount > depositAmount) {
            entry.status = "manual_review";
            entry.reason = "LP transfer exceeds accounted LP";
            entry.depositAmountRaw = depositAmount.toString();
            entry.depositAmount = fmt(depositAmount);
            run.manualReview += 1;
          } else {
            const actionId = keeperActionId("LP_REDUCE", log.transactionHash, logIndex, from);
            if (await knt.processedKeeperActions(actionId)) {
              entry.status = "skipped";
              entry.reason = "LP reduction already processed on-chain";
              entry.actionId = actionId;
              run.skipped += 1;
            } else {
              const tx = await knt.keeperReduceUserLpAmountFromSource(from, amount, log.transactionHash, logIndex);
              const receipt = await tx.wait(1);
              entry.status = "reduced";
              entry.actionId = actionId;
              entry.reduceTx = receipt.hash;
              Object.assign(entry, parseKntReceipt(receipt));
              run.reduced += 1;
            }

            if (normalize(to) === normalize(deployment.labubuPair)) {
              const receipt = await signer.provider.getTransactionReceipt(log.transactionHash);
              for (const receiptLog of receipt.logs || []) {
                if (normalize(receiptLog.address) !== normalize(deployment.contract)) continue;
                let transfer;
                try {
                  transfer = kntIface.parseLog(receiptLog);
                } catch (_error) {
                  continue;
                }
                if (transfer?.name !== "Transfer") continue;
                if (normalize(transfer.args.from) !== normalize(deployment.labubuPair)) continue;
                const burnRecipient = ethers.getAddress(transfer.args.to);
                if (isZeroAddress(burnRecipient)) continue;
                const burnAmount = transfer.args.value;
                if (burnAmount === 0n) continue;
                const burnLogIndex = Number(receiptLog.index ?? receiptLog.logIndex ?? 0);
                const burnActionId = keeperActionId("KNT_BURN", log.transactionHash, burnLogIndex, burnRecipient);
                if (await knt.processedKeeperActions(burnActionId)) {
                  entry.burnStatus = "skipped";
                  entry.burnReason = "KNT burn already processed on-chain";
                  continue;
                }
                const burnTx = await knt.keeperBurnFromSource(burnRecipient, burnAmount, log.transactionHash, burnLogIndex);
                const burnReceipt = await burnTx.wait(1);
                entry.burnStatus = "burned";
                entry.burnActionId = burnActionId;
                entry.burnTx = burnReceipt.hash;
                entry.kntBurnRecipient = burnRecipient;
                entry.kntBurned = fmt(burnAmount);
                entry.kntBurnedRaw = burnAmount.toString();
                run.burned += 1;
              }
            }
          }
        }
      } catch (error) {
        entry.status = "failed";
        entry.error = error.shortMessage || error.message;
        run.failed += 1;
      }

      run.actions.push(entry);
      state.lpSyncActions.push(entry);
      await writeAdminState(env, state);
    }

    state.lpSyncLastScannedBlock = toBlock + 1;
    run.status = run.failed > 0 ? "failed" : run.manualReview > 0 ? "manual_review" : "processed";
    run.finishedAt = new Date().toISOString();
    state.lpSyncRuns.push(run);
    await writeAdminState(env, state);
    return run;
  });
}

async function runMaintenance(env, options = {}) {
  const deployment = requireDeployment(env);
  let state = await readAdminState(env);
  let settings = state.keeperSettings;
  const runMarket = options.runMarket ?? settings.market.enabled;
  const runReward = options.runReward ?? settings.reward.enabled;
  const force = Boolean(options.force);
  const shouldSyncLp = options.runLpSync ?? runReward;
  let lpSync = null;
  if (shouldSyncLp && settings.lpSync.enabled) {
    lpSync = await runLpExitSync(env);
    state = await readAdminState(env);
    settings = state.keeperSettings;
  }
  const signer = signerFor(env);
  const provider = signer.provider;
  const knt = kntContract(env, signer);
  const metaCache = {};
  const startedAt = new Date();
  const nowSeconds = Math.floor(startedAt.getTime() / 1000);
  const priceNow = await computeKntPrice(deployment, provider, metaCache);
  const snapshot = select24hPriceSnapshot(state, nowSeconds, priceNow);
  const pairValues = await Promise.all(
    trackedPairs(deployment).map((definition) => lpValueForPair(definition, deployment, provider, priceNow, metaCache))
  );
  const totalLpValue = pairValues.reduce((sum, item) => sum + BigInt(item.valueRaw || "0"), 0n);
  const previousGlobalLp = await knt.globalLpValueUsdt();
  const lpStepSize = ethers.parseEther("10000");
  const previousEmissionSteps = previousGlobalLp / lpStepSize;
  const currentEmissionSteps = totalLpValue / lpStepSize;
  const currentDay = await knt.currentDay();
  const [latestPriceBefore, rewardPoolBefore] = await Promise.all([
    knt.latestKntPriceUsdt(),
    knt.rewardPool(),
  ]);
  const priceDeviationBP = deviationBasisPoints(priceNow, latestPriceBefore);
  const lpDeviationBP = deviationBasisPoints(totalLpValue, previousGlobalLp);
  const maxBurnQueue = settings.reward.burnQueueMax;

  const entry = {
    startedAt: startedAt.toISOString(),
    keeper: await signer.getAddress(),
    contract: deployment.contract,
    priceNow: fmt(priceNow),
    priceNowRaw: priceNow.toString(),
    price24hAgo: fmt(snapshot.price24hAgo),
    price24hAgoRaw: snapshot.price24hAgo.toString(),
    price24hSource: snapshot.source,
    price24hSnapshotAt: snapshot.snapshotAt,
    pairs: pairValues,
    totalLpValue: fmt(totalLpValue),
    totalLpValueRaw: totalLpValue.toString(),
    previousGlobalLpValue: fmt(previousGlobalLp),
    previousGlobalLpValueRaw: previousGlobalLp.toString(),
    lpValueDelta: fmt(totalLpValue > previousGlobalLp ? totalLpValue - previousGlobalLp : 0n),
    emissionStepsBefore: previousEmissionSteps.toString(),
    emissionStepsAfter: currentEmissionSteps.toString(),
    emissionStepsAdded:
      currentEmissionSteps > previousEmissionSteps ? (currentEmissionSteps - previousEmissionSteps).toString() : "0",
    currentDay: currentDay.toString(),
    lpSync,
    marketTrigger: {
      enabled: runMarket,
      force,
      priceDeviationBP,
      priceDeviationThresholdBP: settings.market.priceDeviationBP,
      lpDeviationBP,
      lpDeviationThresholdBP: settings.market.lpDeviationBP,
    },
    rewardTrigger: {
      enabled: runReward,
      force,
      burnQueueMax: maxBurnQueue,
      minRewardPoolKnt: settings.reward.minRewardPoolKnt,
      rewardPoolBefore: fmt(rewardPoolBefore),
    },
    txs: {},
  };

  try {
    const marketThresholdMet =
      priceDeviationBP >= settings.market.priceDeviationBP ||
      lpDeviationBP >= settings.market.lpDeviationBP;
    if (runMarket && (force || marketThresholdMet)) {
      entry.txs.updatePrice = (await (await knt.keeperUpdateKntPrices(priceNow, snapshot.price24hAgo)).wait(1)).hash;
      entry.txs.updateLp = (await (await knt.keeperUpdateGlobalLpValue(totalLpValue)).wait(1)).hash;
      entry.marketTrigger.status = "processed";
      appendPriceSnapshot(state, nowSeconds, priceNow);
    } else {
      entry.marketTrigger.status = runMarket ? "skipped-threshold" : "disabled";
    }

    const minRewardPool = ethers.parseEther(settings.reward.minRewardPoolKnt || "0");
    if (runReward && (force || rewardPoolBefore >= minRewardPool)) {
      entry.txs.updatePool = (await (await knt.adminUpdatePool()).wait(1)).hash;
      const burnQueueReceipt = await (await knt.processBurnQueue(maxBurnQueue)).wait(1);
      entry.txs.processBurnQueue = burnQueueReceipt.hash;
      const parsedBurnQueue = parseKntReceipt(burnQueueReceipt);
      entry.burnQueue = {
        maxCount: maxBurnQueue,
        paid: parsedBurnQueue.queuePaid,
        nextPayoutIndex: (await knt.nextPayoutIndex()).toString(),
        length: (await knt.burnQueueLength()).toString(),
        rewardPool: fmt(await knt.rewardPool()),
      };
      entry.rewardTrigger.status = "processed";
    } else {
      entry.rewardTrigger.status = runReward ? "skipped-threshold" : "disabled";
    }

    const emissionAfter = await knt.dailyEmissionForDay(currentDay);
    entry.dailyEmissionAfterUpdate = fmt(emissionAfter);
    entry.dailyEmissionAfterUpdateRaw = emissionAfter.toString();
    entry.onChain = {
      globalLpValue: fmt(await knt.globalLpValueUsdt()),
      latestKntPrice: fmt(await knt.latestKntPriceUsdt()),
      price24hAgo: fmt(await knt.price24hAgoUsdt()),
    };
    entry.status = Object.keys(entry.txs).length > 0 ? "processed" : "skipped";
  } catch (error) {
    entry.status = "failed";
    entry.error = error.shortMessage || error.message;
  }

  entry.finishedAt = new Date().toISOString();
  state.maintenance.push(entry);
  await writeAdminState(env, state);
  return entry;
}

async function loadStatus(env) {
  const deployment = requireDeployment(env);
  const provider = providerFor(env);
  const knt = kntContract(env, provider);
  const state = await readAdminState(env);
  const currentDay = await knt.currentDay();
  const [
    owner,
    rewardPool,
    globalLpValueUsdt,
    totalLpValueUsdt,
    totalPower,
    latestKntPriceUsdt,
    price24hAgoUsdt,
    latestPriceUpdatedAt,
    nodeCount,
    burnQueueLength,
    nextPayoutIndex,
    dailyEmission,
    foundationWallet,
    dexSettlementWallet,
    projectSinkWallet,
    ecosystemWallet,
    pancakeRouter,
    usdtToken,
    labubuToken,
    labubuKntPair,
    burnQueueRewardBP,
    referralSignalAmount,
    rewardPeriodSeconds,
  ] = await Promise.all([
    knt.owner(),
    knt.rewardPool(),
    knt.globalLpValueUsdt(),
    knt.totalLpValueUsdt(),
    knt.totalPower(),
    knt.latestKntPriceUsdt(),
    knt.price24hAgoUsdt(),
    knt.latestPriceUpdatedAt(),
    knt.nodeCount(),
    knt.burnQueueLength(),
    knt.nextPayoutIndex(),
    knt.dailyEmissionForDay(currentDay),
    knt.foundationWallet(),
    knt.dexSettlementWallet(),
    knt.projectSinkWallet(),
    knt.ecosystemWallet(),
    knt.pancakeRouter(),
    knt.usdtToken(),
    knt.labubuToken(),
    knt.labubuKntPair(),
    knt.burnQueueRewardBP(),
    knt.referralSignalAmount(),
    knt.rewardPeriodSeconds(),
  ]);

  let market = { pairs: [], error: null };
  try {
    const metaCache = {};
    const priceNow = await computeKntPrice(deployment, provider, metaCache);
    const pairs = await Promise.all(
      trackedPairs(deployment).map((definition) => lpValueForPair(definition, deployment, provider, priceNow, metaCache))
    );
    market = {
      priceNow: fmt(priceNow),
      priceNowRaw: priceNow.toString(),
      pairs,
      totalLpValue: fmt(pairs.reduce((sum, item) => sum + BigInt(item.valueRaw || "0"), 0n)),
    };
  } catch (error) {
    market = { pairs: [], error: error.shortMessage || error.message };
  }

  return {
    ok: true,
    deployment,
    contract: {
      owner,
      rewardPool: fmt(rewardPool),
      rewardPoolRaw: rewardPool.toString(),
      globalLpValueUsdt: fmt(globalLpValueUsdt),
      globalLpValueUsdtRaw: globalLpValueUsdt.toString(),
      totalLpValueUsdt: fmt(totalLpValueUsdt),
      totalLpValueUsdtRaw: totalLpValueUsdt.toString(),
      totalPower: fmt(totalPower),
      totalPowerRaw: totalPower.toString(),
      latestKntPriceUsdt: fmt(latestKntPriceUsdt),
      latestKntPriceUsdtRaw: latestKntPriceUsdt.toString(),
      price24hAgoUsdt: fmt(price24hAgoUsdt),
      price24hAgoUsdtRaw: price24hAgoUsdt.toString(),
      latestPriceUpdatedAt: latestPriceUpdatedAt.toString(),
      currentDay: currentDay.toString(),
      dailyEmission: fmt(dailyEmission),
      dailyEmissionRaw: dailyEmission.toString(),
      nodeCount: nodeCount.toString(),
      burnQueueLength: burnQueueLength.toString(),
      nextPayoutIndex: nextPayoutIndex.toString(),
      wallets: {
        foundationWallet,
        dexSettlementWallet,
        projectSinkWallet,
        ecosystemWallet,
      },
      liquidity: {
        pancakeRouter,
        usdtToken,
        labubuToken,
        labubuKntPair,
      },
      params: {
        burnQueueRewardBP: burnQueueRewardBP.toString(),
        referralSignalAmount: fmt(referralSignalAmount),
        referralSignalAmountRaw: referralSignalAmount.toString(),
        rewardPeriodSeconds: rewardPeriodSeconds.toString(),
      },
    },
    market,
    keeper: {
      settings: state.keeperSettings,
      triggers: state.keeperTriggers || {},
      observerLastScannedBlock: state.observerLastScannedBlock || 0,
      lastObservedDepositCount: (state.observedDeposits || []).length,
      latestObserverRun: (state.observerRuns || [])[state.observerRuns.length - 1] || null,
    },
    logs: {
      lastScannedBlock: state.lastScannedBlock || 0,
      latestRun: (state.runs || [])[state.runs.length - 1] || null,
      latestMaintenance: (state.maintenance || [])[state.maintenance.length - 1] || null,
      depositCount: (state.deposits || []).length,
    },
  };
}

async function loadRole(env, account) {
  if (!ethers.isAddress(account || "")) throw new Error("Invalid account address");
  const provider = providerFor(env);
  const knt = kntContract(env, provider);
  const role = await knt.roleOf(account);
  return {
    account: ethers.getAddress(account),
    isOwner: role.isOwnerRole,
    isAdmin: role.isAdminRole,
    isManager: role.isManagerRole,
    isKeeper: role.isKeeperRole,
    isTaxRecorder: role.isTaxRecorderRole,
  };
}

function roleCanRunKeeper(role) {
  return Boolean(role?.isOwner || role?.isAdmin || role?.isManager || role?.isKeeper);
}

async function runKeeperReduceUserLp(env, body) {
  const signer = signerFor(env);
  const knt = kntContract(env, signer);
  const target = bodyAddress(body, ["target", "targetAccount", "user"], "Target account");
  const lpAmount = bodyAmount(body, "lpAmountRaw", "lpAmount", "LP amount");
  const lpValueUsdt = bodyAmount(body, "lpValueUsdtRaw", "lpValueUsdt", "LP value USDT");
  const tx = await knt.keeperReduceUserLp(target, lpAmount, lpValueUsdt);
  const receipt = await tx.wait(1);
  return {
    status: "processed",
    keeper: await signer.getAddress(),
    target,
    tx: receipt.hash,
    lpAmount: fmt(lpAmount),
    lpAmountRaw: lpAmount.toString(),
    lpValueUsdt: fmt(lpValueUsdt),
    lpValueUsdtRaw: lpValueUsdt.toString(),
  };
}

async function runKeeperBurnUserKnt(env, body) {
  const signer = signerFor(env);
  const knt = kntContract(env, signer);
  const target = bodyAddress(body, ["target", "targetAccount", "user"], "Target account");
  const amount = bodyAmount(body, "amountRaw", "amount", "KNT amount");
  const tx = await knt.keeperBurnFrom(target, amount);
  const receipt = await tx.wait(1);
  return {
    status: "processed",
    keeper: await signer.getAddress(),
    target,
    tx: receipt.hash,
    amount: fmt(amount),
    amountRaw: amount.toString(),
  };
}

function buildAuthMessage({ origin, action, account, chainId, contract, nonce, issuedAt, expiresAt }) {
  return [
    "KNT Admin Console",
    `Origin: ${origin}`,
    `Action: ${action}`,
    `Account: ${account}`,
    `Chain ID: ${chainId}`,
    `Contract: ${contract}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expires At: ${expiresAt}`,
  ].join("\n");
}

async function createAuthNonce(request, env) {
  if (!env.KNT_ADMIN_STATE) throw new Error("KNT_ADMIN_STATE is not configured");
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  if (!KEEPER_ACTIONS.has(action)) return { ok: false, status: 400, error: "Invalid action" };
  if (!ethers.isAddress(body.account || "")) return { ok: false, status: 400, error: "Invalid account" };

  const deployment = requireDeployment(env);
  const account = ethers.getAddress(body.account);
  const issuedAtMs = Date.now();
  const expiresAtMs = issuedAtMs + AUTH_NONCE_TTL_SECONDS * 1000;
  const nonce = crypto.randomUUID();
  const record = {
    origin: url.origin,
    action,
    account,
    chainId: deployment.chainId,
    contract: deployment.contract,
    nonce,
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
  const message = buildAuthMessage(record);
  await env.KNT_ADMIN_STATE.put(`auth-nonce:${nonce}`, JSON.stringify(record), {
    expirationTtl: AUTH_NONCE_TTL_SECONDS,
  });
  return { ok: true, nonce, message, expiresAt: record.expiresAt };
}

async function requireWalletSignature(request, env, action, bodyOverride = null) {
  if (!env.KNT_ADMIN_STATE) return { ok: false, status: 500, error: "KNT_ADMIN_STATE is not configured" };
  const body = bodyOverride || (await request.json().catch(() => ({})));
  if (!ethers.isAddress(body.account || "")) return { ok: false, status: 401, error: "Invalid account" };
  if (!body.nonce || !body.signature) return { ok: false, status: 401, error: "Missing wallet signature" };

  const account = ethers.getAddress(body.account);
  const nonceKey = `auth-nonce:${body.nonce}`;
  const record = await env.KNT_ADMIN_STATE.get(nonceKey, "json");
  if (!record) return { ok: false, status: 401, error: "Signature nonce expired" };
  await env.KNT_ADMIN_STATE.delete(nonceKey);

  if (record.action !== action) return { ok: false, status: 401, error: "Signature action mismatch" };
  if (ethers.getAddress(record.account) !== account) return { ok: false, status: 401, error: "Signature account mismatch" };
  if (Date.parse(record.expiresAt) < Date.now()) return { ok: false, status: 401, error: "Signature expired" };

  let recovered;
  try {
    recovered = ethers.verifyMessage(buildAuthMessage(record), body.signature);
  } catch (_error) {
    return { ok: false, status: 401, error: "Invalid wallet signature" };
  }
  if (ethers.getAddress(recovered) !== account) return { ok: false, status: 401, error: "Signer mismatch" };

  const role = await loadRole(env, account);
  if (!roleCanRunKeeper(role)) return { ok: false, status: 403, error: "Wallet is not Keeper/Admin/Owner" };
  return { ok: true, account, role };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return json({ ok: true });

  try {
    if (url.pathname === "/api/config" && request.method === "GET") {
      const deployment = getDeployment(env);
      return json({
        ok: true,
        deployment: {
          ...deployment,
          rpcUrl: env.PUBLIC_BSC_RPC_URL || deployment.rpcUrl,
        },
      });
    }

    if (url.pathname === "/api/status" && request.method === "GET") {
      return json(await loadStatus(env));
    }

    if (url.pathname === "/api/logs" && request.method === "GET") {
      const state = await readAdminState(env);
      return json({ ok: true, ...state });
    }

    if (url.pathname === "/api/accounting" && request.method === "GET") {
      return json(await loadAccounting(env, url.searchParams));
    }

    if (url.pathname === "/api/roles" && request.method === "GET") {
      return json({ ok: true, role: await loadRole(env, url.searchParams.get("account")) });
    }

    if (url.pathname === "/api/auth/nonce" && request.method === "POST") {
      const nonce = await createAuthNonce(request, env);
      if (!nonce.ok) return errorJson(nonce.error, nonce.status);
      return json(nonce);
    }

    if (url.pathname === "/api/keeper/settings" && request.method === "GET") {
      const state = await readAdminState(env);
      return json({
        ok: true,
        settings: state.keeperSettings,
        triggers: state.keeperTriggers || {},
      });
    }

    if (url.pathname === "/api/keeper/settings" && (request.method === "POST" || request.method === "PUT")) {
      const body = await request.json().catch(() => ({}));
      const auth = await requireWalletSignature(request, env, url.pathname, body);
      if (!auth.ok) return errorJson(auth.error, auth.status);
      const state = await readAdminState(env);
      state.keeperSettings = normalizeKeeperSettings(env, body.settings || {});
      await writeAdminState(env, state);
      return json({
        ok: true,
        settings: state.keeperSettings,
        triggers: state.keeperTriggers || {},
      });
    }

    if (url.pathname.startsWith("/api/keeper/") && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const auth = await requireWalletSignature(request, env, url.pathname, body);
      if (!auth.ok) return errorJson(auth.error, auth.status);
      if (url.pathname === "/api/keeper/observer") return json({ ok: true, run: await runObserverScan(env) });
      if (url.pathname === "/api/keeper/process-usdt") return json({ ok: true, run: await runProcessUsdtDeposits(env) });
      if (url.pathname === "/api/keeper/sync-lp") return json({ ok: true, run: await runLpExitSync(env) });
      if (url.pathname === "/api/keeper/maintenance") return json({ ok: true, run: await runMaintenance(env, { force: true, runMarket: true, runReward: true }) });
      if (url.pathname === "/api/keeper/reduce-lp") return json({ ok: true, run: await runKeeperReduceUserLp(env, body) });
      if (url.pathname === "/api/keeper/burn-user-knt") return json({ ok: true, run: await runKeeperBurnUserKnt(env, body) });
      if (url.pathname === "/api/keeper/run-all") {
        const observer = await runObserverScan(env);
        const deposits = await runProcessUsdtDeposits(env);
        const lpSync = await runLpExitSync(env);
        const maintenance = await runMaintenance(env, { force: true, runMarket: true, runReward: true, runLpSync: false });
        return json({ ok: true, observer, deposits, lpSync, maintenance });
      }
    }

    return errorJson("Not found", 404);
  } catch (error) {
    return errorJson(error.shortMessage || error.message || "Worker error", 500);
  }
}

async function runScheduled(env) {
  try {
    let state = await readAdminState(env);
    let settings = state.keeperSettings;
    const nowMs = Date.now();
    if (shouldRunKeeper(state, settings, "observer", nowMs)) {
      const observer = await runObserverScan(env);
      await recordKeeperTrigger(env, "observer", observer.status, {
        fromBlock: observer.fromBlock,
        toBlock: observer.toBlock,
        discovered: observer.discovered,
      });
    }
    if (shouldRunKeeper(state, settings, "deposit", nowMs)) {
      const deposits = await runProcessUsdtDeposits(env);
      await recordKeeperTrigger(env, "deposit", deposits.status, {
        fromBlock: deposits.fromBlock,
        toBlock: deposits.toBlock,
        discovered: deposits.discovered,
        processed: deposits.processed,
      });
    }
    state = await readAdminState(env);
    settings = state.keeperSettings;
    if (shouldRunKeeper(state, settings, "lpSync", nowMs)) {
      const lpSync = await runLpExitSync(env);
      await recordKeeperTrigger(env, "lpSync", lpSync.status, {
        fromBlock: lpSync.fromBlock,
        toBlock: lpSync.toBlock,
        discovered: lpSync.discovered,
        reduced: lpSync.reduced,
        burned: lpSync.burned,
        manualReview: lpSync.manualReview,
      });
    }
    state = await readAdminState(env);
    settings = state.keeperSettings;
    const runMarket = shouldRunKeeper(state, settings, "market", nowMs);
    const runReward = shouldRunKeeper(state, settings, "reward", nowMs);
    if (runMarket || runReward) {
      const maintenance = await runMaintenance(env, { runMarket, runReward, runLpSync: false });
      if (runMarket) {
        await recordKeeperTrigger(env, "market", maintenance.marketTrigger?.status || maintenance.status, {
          txs: maintenance.txs || {},
        });
      }
      if (runReward) {
        await recordKeeperTrigger(env, "reward", maintenance.rewardTrigger?.status || maintenance.status, {
          txs: maintenance.txs || {},
        });
      }
    }
  } catch (error) {
    const state = await readAdminState(env);
    state.runs.push({
      status: "failed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      error: error.shortMessage || error.message,
    });
    await writeAdminState(env, state);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return errorJson("Static assets binding is not configured", 500);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  },
};
