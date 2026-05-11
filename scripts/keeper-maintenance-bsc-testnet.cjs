const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const DAY_SECONDS = 24 * 60 * 60;
const TEN_18 = 10n ** 18n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const PAIR_ABI = [
  "function token0() view returns(address)",
  "function token1() view returns(address)",
  "function getReserves() view returns(uint112,uint112,uint32)",
];

const ERC20_ABI = [
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
];

const KNT_ABI = [
  "function keeperUpdateGlobalLpValue(uint256)",
  "function keeperUpdateKntPrices(uint256,uint256)",
  "function adminUpdatePool()",
  "function processBurnQueue(uint256) returns(uint256)",
  "function currentDay() view returns(uint256)",
  "function dailyEmissionForDay(uint256) view returns(uint256)",
  "function globalLpValueUsdt() view returns(uint256)",
  "function latestKntPriceUsdt() view returns(uint256)",
  "function price24hAgoUsdt() view returns(uint256)",
  "function burnQueueLength() view returns(uint256)",
  "function nextPayoutIndex() view returns(uint256)",
  "function rewardPool() view returns(uint256)",
  "event QueuePaid(address indexed user,uint256 indexed index,uint256 rewardAmount)",
];

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function readJson(filePath, fallback = {}) {
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

function normalize(address) {
  return (address || "").toLowerCase();
}

function scaleTo18(amount, decimals) {
  const normalizedDecimals = Number(decimals);
  if (normalizedDecimals === 18) return amount;
  if (normalizedDecimals > 18) return amount / (10n ** BigInt(normalizedDecimals - 18));
  return amount * (10n ** BigInt(18 - normalizedDecimals));
}

function fmt(value) {
  return hre.ethers.formatEther(value);
}

async function tokenMeta(tokenAddress, cache) {
  const key = normalize(tokenAddress);
  if (cache[key]) return cache[key];

  const token = new hre.ethers.Contract(tokenAddress, ERC20_ABI, hre.ethers.provider);
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

async function pairReserves(pairAddress) {
  const pair = new hre.ethers.Contract(pairAddress, PAIR_ABI, hre.ethers.provider);
  const [token0, token1, reserves] = await Promise.all([pair.token0(), pair.token1(), pair.getReserves()]);
  return {
    address: pairAddress,
    token0,
    token1,
    token0Lower: normalize(token0),
    token1Lower: normalize(token1),
    reserve0: reserves[0],
    reserve1: reserves[1],
    blockTimestampLast: reserves[2],
  };
}

function reserveOf(pair, token) {
  const normalized = normalize(token);
  if (pair.token0Lower === normalized) return pair.reserve0;
  if (pair.token1Lower === normalized) return pair.reserve1;
  return 0n;
}

function isConfiguredAddress(address) {
  return Boolean(address) && normalize(address) !== normalize(ZERO_ADDRESS);
}

function trackedPairs(deployment) {
  const pairs = [];
  if (isConfiguredAddress(deployment.labubuUsdtPair)) {
    pairs.push({
      key: "LABUBU_USDT",
      label: "LABUBU/USDT",
      address: deployment.labubuUsdtPair,
      valuation: "USDT reserve x 2",
    });
  } else {
    pairs.push({
      key: "LABUBU_WBNB",
      label: "LABUBU/WBNB",
      address: deployment.labubuWbnbPair,
      valuation: "WBNB reserve x derived WBNB price x 2",
    });
    pairs.push({
      key: "WBNB_USDT",
      label: "WBNB/USDT",
      address: deployment.wbnbUsdtPair,
      valuation: "USDT reserve x 2 (price reference only)",
      countsTowardTotal: false,
    });
  }
  pairs.push({
    key: "LABUBU_KNT",
    label: "LABUBU/KNT",
    address: deployment.labubuPair || deployment.pair,
    valuation: "KNT reserve x derived KNT price x 2",
  });
  return pairs;
}

function configuredLabubuBaseToken(deployment) {
  return deployment.labubuSwapIntermediateToken || deployment.WBNB || deployment.wbnbToken || deployment.WBNB_TOKEN || "";
}

async function computeLabubuPriceUsdt(deployment, metaCache) {
  if (!(deployment.labubuPair || deployment.pair)) throw new Error("Missing LABUBU/KNT pair in deployment");

  const [labubuMeta, usdtMeta] = await Promise.all([
    tokenMeta(deployment.LABUBU, metaCache),
    tokenMeta(deployment.USDT, metaCache),
  ]);

  if (isConfiguredAddress(deployment.labubuUsdtPair)) {
    const labubuUsdtPair = await pairReserves(deployment.labubuUsdtPair);
    const labubuUsdtLabubuReserve = scaleTo18(reserveOf(labubuUsdtPair, deployment.LABUBU), labubuMeta.decimals);
    const labubuUsdtUsdtReserve = scaleTo18(reserveOf(labubuUsdtPair, deployment.USDT), usdtMeta.decimals);
    if (labubuUsdtLabubuReserve === 0n || labubuUsdtUsdtReserve === 0n) {
      throw new Error("LABUBU/USDT pair has empty reserves");
    }
    return {
      labubuPriceUsdt: (labubuUsdtUsdtReserve * TEN_18) / labubuUsdtLabubuReserve,
      labubuPricingRoute: "LABUBU/USDT",
      baseToken: "",
      baseTokenPriceUsdt: 0n,
    };
  }

  const baseToken = configuredLabubuBaseToken(deployment);
  if (!isConfiguredAddress(baseToken) || !isConfiguredAddress(deployment.labubuWbnbPair) || !isConfiguredAddress(deployment.wbnbUsdtPair)) {
    throw new Error("Missing LABUBU/USDT or LABUBU/WBNB + WBNB/USDT route in deployment");
  }

  const [labubuBasePair, baseUsdtPair, baseMeta] = await Promise.all([
    pairReserves(deployment.labubuWbnbPair),
    pairReserves(deployment.wbnbUsdtPair),
    tokenMeta(baseToken, metaCache),
  ]);
  const labubuReserve = scaleTo18(reserveOf(labubuBasePair, deployment.LABUBU), labubuMeta.decimals);
  const baseReserveInLabubuPair = scaleTo18(reserveOf(labubuBasePair, baseToken), baseMeta.decimals);
  const baseReserveInUsdtPair = scaleTo18(reserveOf(baseUsdtPair, baseToken), baseMeta.decimals);
  const usdtReserveInBasePair = scaleTo18(reserveOf(baseUsdtPair, deployment.USDT), usdtMeta.decimals);
  if (
    labubuReserve === 0n ||
    baseReserveInLabubuPair === 0n ||
    baseReserveInUsdtPair === 0n ||
    usdtReserveInBasePair === 0n
  ) {
    throw new Error("LABUBU/WBNB or WBNB/USDT pair has empty reserves");
  }

  const labubuPriceBase = (baseReserveInLabubuPair * TEN_18) / labubuReserve;
  const baseTokenPriceUsdt = (usdtReserveInBasePair * TEN_18) / baseReserveInUsdtPair;
  return {
    labubuPriceUsdt: (labubuPriceBase * baseTokenPriceUsdt) / TEN_18,
    labubuPricingRoute: "LABUBU/WBNB/WBNB/USDT",
    baseToken,
    baseTokenPriceUsdt,
  };
}

async function computeMarketPrices(deployment, metaCache) {
  const labubuPricing = await computeLabubuPriceUsdt(deployment, metaCache);
  const [labubuKntPair, labubuMeta, kntMeta] = await Promise.all([
    pairReserves(deployment.labubuPair || deployment.pair),
    tokenMeta(deployment.LABUBU, metaCache),
    tokenMeta(deployment.KNTAllInOne, metaCache),
  ]);
  const labubuKntLabubuReserve = scaleTo18(reserveOf(labubuKntPair, deployment.LABUBU), labubuMeta.decimals);
  const labubuKntKntReserve = scaleTo18(reserveOf(labubuKntPair, deployment.KNTAllInOne), kntMeta.decimals);
  if (labubuKntLabubuReserve === 0n || labubuKntKntReserve === 0n) {
    throw new Error("LABUBU/KNT pair has empty reserves");
  }

  const kntPriceLabubu = (labubuKntLabubuReserve * TEN_18) / labubuKntKntReserve;
  return {
    ...labubuPricing,
    kntPriceUsdt: (kntPriceLabubu * labubuPricing.labubuPriceUsdt) / TEN_18,
  };
}

async function lpValueForPair(definition, deployment, prices, metaCache) {
  if (!definition.address) {
    return {
      ...definition,
      status: "missing",
      value: "0.0",
      valueRaw: "0",
    };
  }

  const pair = await pairReserves(definition.address);
  const token0Meta = await tokenMeta(pair.token0, metaCache);
  const token1Meta = await tokenMeta(pair.token1, metaCache);
  const usdtReserve = reserveOf(pair, deployment.USDT);
  const kntReserve = reserveOf(pair, deployment.KNTAllInOne);
  const labubuReserve = reserveOf(pair, deployment.LABUBU);
  const baseToken = configuredLabubuBaseToken(deployment);
  const baseTokenReserve = baseToken ? reserveOf(pair, baseToken) : 0n;
  const kntPriceUsdt = typeof prices === "bigint" ? prices : prices.kntPriceUsdt;
  const labubuPriceUsdt = typeof prices === "bigint" ? 0n : prices.labubuPriceUsdt;
  const baseTokenPriceUsdt = typeof prices === "bigint" ? 0n : prices.baseTokenPriceUsdt;
  let value = 0n;
  let basis = "unsupported";

  if (usdtReserve > 0n) {
    const usdtMeta = normalize(pair.token0) === normalize(deployment.USDT) ? token0Meta : token1Meta;
    value = scaleTo18(usdtReserve, usdtMeta.decimals) * 2n;
    basis = "usdtReserve";
  } else if (kntReserve > 0n) {
    const kntMeta = normalize(pair.token0) === normalize(deployment.KNTAllInOne) ? token0Meta : token1Meta;
    value = ((scaleTo18(kntReserve, kntMeta.decimals) * kntPriceUsdt) / TEN_18) * 2n;
    basis = "kntReserve";
  } else if (baseTokenReserve > 0n && baseTokenPriceUsdt > 0n) {
    const baseMeta = normalize(pair.token0) === normalize(baseToken) ? token0Meta : token1Meta;
    value = ((scaleTo18(baseTokenReserve, baseMeta.decimals) * baseTokenPriceUsdt) / TEN_18) * 2n;
    basis = "baseTokenReserve";
  } else if (labubuReserve > 0n && labubuPriceUsdt > 0n) {
    const labubuMeta = normalize(pair.token0) === normalize(deployment.LABUBU) ? token0Meta : token1Meta;
    value = ((scaleTo18(labubuReserve, labubuMeta.decimals) * labubuPriceUsdt) / TEN_18) * 2n;
    basis = "labubuReserve";
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
    basis,
    value: fmt(value),
    valueRaw: value.toString(),
  };
}

function totalCountedPairValue(pairs) {
  return pairs.reduce((sum, item) => {
    if (item.countsTowardTotal === false) return sum;
    return sum + BigInt(item.valueRaw || "0");
  }, 0n);
}

function select24hPriceSnapshot(adminLog, nowSeconds, priceNow) {
  const snapshots = (adminLog.priceSnapshots || [])
    .filter((item) => item && item.timestamp && item.priceNowRaw)
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const targetTimestamp = nowSeconds - DAY_SECONDS;
  let selected = null;

  for (const snapshot of snapshots) {
    if (Number(snapshot.timestamp) <= targetTimestamp) {
      selected = snapshot;
    }
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

function appendPriceSnapshot(adminLog, nowSeconds, priceNow) {
  const snapshots = adminLog.priceSnapshots || [];
  snapshots.push({
    at: new Date(nowSeconds * 1000).toISOString(),
    timestamp: nowSeconds,
    priceNow: fmt(priceNow),
    priceNowRaw: priceNow.toString(),
  });
  adminLog.priceSnapshots = snapshots.filter((item) => Number(item.timestamp || 0) >= nowSeconds - 8 * DAY_SECONDS);
}

function parseQueuePaidEvents(knt, receipt) {
  const paid = [];
  for (const log of receipt.logs || []) {
    try {
      const parsed = knt.interface.parseLog(log);
      if (parsed && parsed.name === "QueuePaid") {
        paid.push({
          user: parsed.args.user,
          index: parsed.args.index.toString(),
          rewardAmount: fmt(parsed.args.rewardAmount),
          rewardAmountRaw: parsed.args.rewardAmount.toString(),
        });
      }
    } catch (_error) {
      // Ignore logs emitted by other contracts in the same receipt.
    }
  }
  return paid;
}

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required for keeper maintenance");
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "bscTestnet", "knt-pancake-test-pool.json");
  const deployment = readJson(deploymentPath);
  if (!deployment.KNTAllInOne || !deployment.USDT || !deployment.LABUBU) {
    throw new Error(`Missing KNTAllInOne, USDT, or LABUBU in ${deploymentPath}`);
  }

  const logPath = path.join(__dirname, "..", "deployments", "bscTestnet", "admin-keeper-log.json");
  const provider = hre.ethers.provider;
  const [keeper] = await hre.ethers.getSigners();
  const keeperAddress = await keeper.getAddress();
  const network = await provider.getNetwork();
  const adminLog = readJson(logPath, {
    runs: [],
    deposits: [],
    maintenance: [],
    priceSnapshots: [],
  });
  const metaCache = {};
  const knt = new hre.ethers.Contract(deployment.KNTAllInOne, KNT_ABI, keeper);

  adminLog.network = hre.network.name;
  adminLog.chainId = Number(network.chainId);
  adminLog.contract = deployment.KNTAllInOne;
  adminLog.usdt = deployment.USDT;
  adminLog.labubu = deployment.LABUBU;

  const startedAt = new Date();
  const nowSeconds = Math.floor(startedAt.getTime() / 1000);
  const marketPrices = await computeMarketPrices(deployment, metaCache);
  const priceNow = marketPrices.kntPriceUsdt;
  const snapshot = select24hPriceSnapshot(adminLog, nowSeconds, priceNow);
  const pairValues = await Promise.all(
    trackedPairs(deployment).map((definition) => lpValueForPair(definition, deployment, marketPrices, metaCache))
  );
  const totalLpValue = totalCountedPairValue(pairValues);
  const previousGlobalLp = await knt.globalLpValueUsdt();
  const lpStepSize = hre.ethers.parseEther("10000");
  const previousEmissionSteps = previousGlobalLp / lpStepSize;
  const currentEmissionSteps = totalLpValue / lpStepSize;
  const currentDay = await knt.currentDay();
  const maxBurnQueue = Number(process.env.KEEPER_BURN_QUEUE_MAX || 20);

  const entry = {
    startedAt: startedAt.toISOString(),
    keeper: keeperAddress,
    contract: deployment.KNTAllInOne,
    priceNow: fmt(priceNow),
    priceNowRaw: priceNow.toString(),
    labubuPriceUsdt: fmt(marketPrices.labubuPriceUsdt),
    labubuPriceUsdtRaw: marketPrices.labubuPriceUsdt.toString(),
    labubuPricingRoute: marketPrices.labubuPricingRoute,
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
    txs: {},
  };

  try {
    entry.txs.updatePrice = (await wait(knt.keeperUpdateKntPrices(priceNow, snapshot.price24hAgo))).hash;
    entry.txs.updateLp = (await wait(knt.keeperUpdateGlobalLpValue(totalLpValue))).hash;
    entry.txs.updatePool = (await wait(knt.adminUpdatePool())).hash;

    let expectedQueuePaid = 0n;
    try {
      expectedQueuePaid = await knt.processBurnQueue.staticCall(maxBurnQueue);
    } catch (error) {
      entry.processBurnQueueStaticError = error.shortMessage || error.message;
    }

    const burnQueueReceipt = await wait(knt.processBurnQueue(maxBurnQueue));
    entry.txs.processBurnQueue = burnQueueReceipt.hash;
    entry.burnQueue = {
      maxCount: maxBurnQueue,
      expectedPaidCount: expectedQueuePaid.toString(),
      paid: parseQueuePaidEvents(knt, burnQueueReceipt),
      nextPayoutIndex: (await knt.nextPayoutIndex()).toString(),
      length: (await knt.burnQueueLength()).toString(),
      rewardPool: fmt(await knt.rewardPool()),
    };

    const emissionAfter = await knt.dailyEmissionForDay(currentDay);
    entry.dailyEmissionAfterUpdate = fmt(emissionAfter);
    entry.dailyEmissionAfterUpdateRaw = emissionAfter.toString();
    entry.onChain = {
      globalLpValue: fmt(await knt.globalLpValueUsdt()),
      latestKntPrice: fmt(await knt.latestKntPriceUsdt()),
      price24hAgo: fmt(await knt.price24hAgoUsdt()),
    };
    entry.status = "processed";
    appendPriceSnapshot(adminLog, nowSeconds, priceNow);
  } catch (error) {
    entry.status = "failed";
    entry.error = error.shortMessage || error.message;
  }

  entry.finishedAt = new Date().toISOString();
  adminLog.maintenance = adminLog.maintenance || [];
  adminLog.maintenance.push(entry);
  writeJson(logPath, adminLog);
  console.log(JSON.stringify(entry, jsonReplacer, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
