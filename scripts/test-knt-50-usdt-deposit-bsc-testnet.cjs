const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const DEAD = "0x000000000000000000000000000000000000dEaD";
const BASIS_POINTS = 10_000n;

function ether(value) {
  return hre.ethers.parseEther(value);
}

function fmt(value) {
  return hre.ethers.formatEther(value);
}

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function pass(name, expected, actual, tx) {
  return { name, status: "PASS", expected, actual, tx: tx || null };
}

function diff(name, expected, actual, tx) {
  return { name, status: "DIFF", expected, actual, tx: tx || null };
}

function skip(name, expected, actual) {
  return { name, status: "SKIP", expected, actual, tx: null };
}

async function wait(txPromise, label) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label}: ${receipt.hash}`);
  return receipt;
}

function addExpectedDelta(map, address, amount) {
  const key = address.toLowerCase();
  map[key] = (map[key] || 0n) + amount;
}

function depositIdFromReceipt(usdt, receipt, kntAddress) {
  const transferLog = receipt.logs.find((log) => {
    if (String(log.address).toLowerCase() !== String(usdt.target).toLowerCase()) return false;
    try {
      const parsed = usdt.interface.parseLog(log);
      return parsed?.name === "Transfer" && parsed.args.to.toLowerCase() === kntAddress.toLowerCase();
    } catch (_error) {
      return false;
    }
  });
  if (!transferLog) throw new Error(`USDT transfer log not found in ${receipt.hash}`);

  const coder = hre.ethers.AbiCoder.defaultAbiCoder();
  return hre.ethers.keccak256(coder.encode(["bytes32", "uint256"], [receipt.hash, transferLog.index]));
}

function parseKntEvents(knt, receipt) {
  const events = [];
  for (const log of receipt.logs || []) {
    try {
      const parsed = knt.interface.parseLog(log);
      if (!parsed) continue;
      events.push(parsed);
    } catch (_error) {
      // Ignore non-KNT logs.
    }
  }
  return events;
}

function parseUsdtDepositEvent(knt, receipt) {
  const event = parseKntEvents(knt, receipt).find((item) => item.name === "UsdtDeposited");
  if (!event) return null;
  return {
    usdtAmount: fmt(event.args.usdtAmount),
    kntUsed: fmt(event.args.kntUsed),
    labubuUsed: fmt(event.args.labubuUsed),
    lpAmount: fmt(event.args.lpAmount),
    lpValueUsdt: fmt(event.args.lpValueUsdt),
    raw: {
      usdtAmount: event.args.usdtAmount.toString(),
      kntUsed: event.args.kntUsed.toString(),
      labubuUsed: event.args.labubuUsed.toString(),
      lpAmount: event.args.lpAmount.toString(),
      lpValueUsdt: event.args.lpValueUsdt.toString(),
    },
  };
}

function parseMigrationMintedId(knt, receipt) {
  const event = parseKntEvents(knt, receipt).find((item) => item.name === "MigrationMinted");
  return event ? event.args.id : null;
}

function readConfiguredWallets(provider) {
  const labels = ["A", "B", "C", "D", "E"];
  const keys = String(process.env.TEST_ACCOUNT_PRIVATE_KEYS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return {
      wallets: Object.fromEntries(labels.map((label) => [label, hre.ethers.Wallet.createRandom().connect(provider)])),
      source: "generated",
    };
  }

  if (keys.length !== labels.length) {
    throw new Error("TEST_ACCOUNT_PRIVATE_KEYS must contain exactly five comma-separated private keys for A,B,C,D,E");
  }

  return {
    wallets: Object.fromEntries(labels.map((label, index) => [label, new hre.ethers.Wallet(keys[index], provider)])),
    source: "env",
  };
}

function depositsPerLabel(labels, depositCount) {
  const counts = Object.fromEntries(labels.map((label) => [label, 0]));
  for (let i = 0; i < depositCount; i++) {
    counts[labels[i % labels.length]] += 1;
  }
  return counts;
}

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required");
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "bscTestnet", "knt-pancake-test-pool.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (!deployment.KNTAllInOne || !deployment.USDT || !deployment.LABUBU || !deployment.labubuPair) {
    throw new Error(`Missing latest pool deployment fields in ${deploymentPath}`);
  }

  const [operator] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;
  const operatorAddress = await operator.getAddress();
  const chain = await provider.getNetwork();
  if (chain.chainId !== 97n) {
    throw new Error(`Expected BSC Testnet chainId 97, got ${chain.chainId.toString()}`);
  }

  const labels = ["A", "B", "C", "D", "E"];
  const childLabels = labels.slice(1);
  const depositCount = Number(process.env.TEST_DEPOSIT_COUNT || "50");
  if (!Number.isInteger(depositCount) || depositCount <= 0) {
    throw new Error("TEST_DEPOSIT_COUNT must be a positive integer");
  }
  const depositAmount = ether(process.env.TEST_DEPOSIT_AMOUNT || "100");
  const gasFund = ether(process.env.TEST_GAS_FUND || "0.03");
  const referralSignalAmount = ether(process.env.REFERRAL_SIGNAL_AMOUNT || "1");
  const burnAmount = ether(process.env.TEST_BURN_AMOUNT || "10");
  const sellAmount = ether(process.env.TEST_SELL_AMOUNT || "100");
  const migrationAmount = ether(process.env.TEST_MIGRATION_AMOUNT || "1000");
  const exitLpValueUsdt = ether(process.env.TEST_EXIT_LP_VALUE_USDT || process.env.TEST_WITHDRAW_LP_VALUE_USDT || "100");
  const deadlineSeconds = Number(process.env.TEST_DEADLINE_SECONDS || "1200");

  const KNT = await hre.ethers.getContractFactory("KNTAllInOne");
  const knt = KNT.attach(deployment.KNTAllInOne).connect(operator);
  const usdt = new hre.ethers.Contract(
    deployment.USDT,
    [
      "event Transfer(address indexed from,address indexed to,uint256 value)",
      "function balanceOf(address) view returns(uint256)",
      "function transfer(address,uint256) returns(bool)",
      "function symbol() view returns(string)",
      "function decimals() view returns(uint8)",
    ],
    operator
  );
  const labubu = new hre.ethers.Contract(
    deployment.LABUBU,
    ["function balanceOf(address) view returns(uint256)", "function symbol() view returns(string)"],
    provider
  );
  const pair = new hre.ethers.Contract(
    deployment.labubuPair,
    [
      "function token0() view returns(address)",
      "function token1() view returns(address)",
      "function getReserves() view returns(uint112,uint112,uint32)",
      "function totalSupply() view returns(uint256)",
    ],
    provider
  );

  const { wallets, source: testAccountSource } = readConfiguredWallets(provider);
  const kntByLabel = Object.fromEntries(labels.map((label) => [label, knt.connect(wallets[label])]));
  const usdtByLabel = Object.fromEntries(labels.map((label) => [label, usdt.connect(wallets[label])]));
  const depositCounts = depositsPerLabel(labels, depositCount);
  const totalDepositAmount = depositAmount * BigInt(depositCount);
  const requiredUsdtByLabel = Object.fromEntries(
    labels.map((label) => [label, depositAmount * BigInt(depositCounts[label])])
  );
  const kntFunding = {
    A: ether("100"),
    B: ether("250"),
    C: ether("25"),
    D: ether("25"),
    E: ether("25"),
  };
  const totalKntFunding = Object.values(kntFunding).reduce((sum, value) => sum + value, 0n);

  const [beforeTotalLp, beforeTotalPower, beforeRewardPool, beforeBurned, beforeDay, beforeLastRewardDay] =
    await Promise.all([
      knt.totalLpValueUsdt(),
      knt.totalPower(),
      knt.rewardPool(),
      knt.totalBurned(),
      knt.currentDay(),
      knt.lastRewardDay(),
    ]);
  const [operatorBnb, operatorUsdt, operatorKnt, token0, token1, reserves, lpSupply] = await Promise.all([
    provider.getBalance(operatorAddress),
    usdt.balanceOf(operatorAddress),
    knt.balanceOf(operatorAddress),
    pair.token0(),
    pair.token1(),
    pair.getReserves(),
    pair.totalSupply(),
  ]);

  const report = {
    network: hre.network.name,
    chainId: Number(chain.chainId),
    testedAt: new Date().toISOString(),
    deployment,
    operator: operatorAddress,
    testAccountSource,
    testAccounts: Object.fromEntries(labels.map((label) => [label, wallets[label].address])),
    parameters: {
      depositCount,
      depositAmount: fmt(depositAmount),
      totalDepositAmount: fmt(totalDepositAmount),
      depositCounts,
      gasFund: fmt(gasFund),
      referralSignalAmount: fmt(referralSignalAmount),
      burnAmount: fmt(burnAmount),
      sellAmount: fmt(sellAmount),
      migrationAmount: fmt(migrationAmount),
      exitLpValueUsdt: fmt(exitLpValueUsdt),
    },
    preflight: {
      operatorBnb: fmt(operatorBnb),
      operatorUsdt: fmt(operatorUsdt),
      operatorKnt: fmt(operatorKnt),
      requiredUsdt: fmt(totalDepositAmount),
      requiredKntFunding: fmt(totalKntFunding),
      beforeTotalLpValueUsdt: fmt(beforeTotalLp),
      beforeTotalPower: fmt(beforeTotalPower),
      beforeRewardPool: fmt(beforeRewardPool),
      beforeTotalBurned: fmt(beforeBurned),
      beforeCurrentDay: beforeDay.toString(),
      beforeLastRewardDay: beforeLastRewardDay.toString(),
    },
    results: [],
    txs: {},
    deposits: [],
  };

  if (operatorUsdt < totalDepositAmount) {
    throw new Error(`Operator has insufficient USDT. Need ${fmt(totalDepositAmount)}, have ${fmt(operatorUsdt)}`);
  }
  if (operatorKnt < totalKntFunding + sellAmount + burnAmount) {
    throw new Error(`Operator has insufficient KNT. Need at least ${fmt(totalKntFunding + sellAmount + burnAmount)}, have ${fmt(operatorKnt)}`);
  }

  const pairHasTokens =
    [token0.toLowerCase(), token1.toLowerCase()].includes(deployment.KNTAllInOne.toLowerCase()) &&
    [token0.toLowerCase(), token1.toLowerCase()].includes(deployment.LABUBU.toLowerCase());
  report.results.push(
    pairHasTokens && lpSupply > 0n
      ? pass("Latest KNT/LABUBU pair is usable", "pair has KNT/LABUBU reserves and LP supply", {
          pair: deployment.labubuPair,
          token0,
          token1,
          reserve0: reserves[0].toString(),
          reserve1: reserves[1].toString(),
          lpSupply: lpSupply.toString(),
        })
      : diff("Latest KNT/LABUBU pair is usable", "pair has KNT/LABUBU reserves and LP supply", {
          pair: deployment.labubuPair,
          token0,
          token1,
          reserve0: reserves[0].toString(),
          reserve1: reserves[1].toString(),
          lpSupply: lpSupply.toString(),
        })
  );

  for (const label of labels) {
    report.txs[`fundGas${label}`] = (await wait(
      operator.sendTransaction({ to: wallets[label].address, value: gasFund }),
      `fund ${label} gas`
    )).hash;
  }

  for (const label of labels) {
    report.txs[`fundKnt${label}`] = (await wait(
      knt.transfer(wallets[label].address, kntFunding[label]),
      `fund ${label} KNT`
    )).hash;
  }

  for (const label of labels) {
    report.txs[`fundUsdt${label}`] = (await wait(
      usdt.transfer(wallets[label].address, requiredUsdtByLabel[label]),
      `fund ${label} USDT ${fmt(requiredUsdtByLabel[label])}`
    )).hash;
  }

  if ((await knt.referralSignalAmount()) !== referralSignalAmount) {
    report.txs.setReferralSignalAmount = (await wait(
      knt.setReferralSignalAmount(referralSignalAmount),
      "set referral signal amount"
    )).hash;
  }

  const referralTxs = [];
  for (const label of childLabels) {
    const currentReferrer = await knt.referrerOf(wallets[label].address);
    if (currentReferrer !== hre.ethers.ZeroAddress) continue;
    const sig1 = await wait(kntByLabel.A.transfer(wallets[label].address, referralSignalAmount), `A sends referral signal to ${label}`);
    const sig2 = await wait(kntByLabel[label].transfer(wallets.A.address, referralSignalAmount), `${label} returns referral signal to A`);
    referralTxs.push(sig1.hash, sig2.hash);
  }

  const referrers = {};
  for (const label of childLabels) {
    referrers[label] = await knt.referrerOf(wallets[label].address);
  }
  const referralsOk = childLabels.every((label) => referrers[label].toLowerCase() === wallets.A.address.toLowerCase());
  report.results.push(
    referralsOk
      ? pass("A-E referral binding", "B/C/D/E referrer = A", referrers, referralTxs)
      : diff("A-E referral binding", "B/C/D/E referrer = A", referrers, referralTxs)
  );

  for (let i = 0; i < depositCount; i++) {
    const label = labels[i % labels.length];
    const transferReceipt = await wait(
      usdtByLabel[label].transfer(deployment.KNTAllInOne, depositAmount),
      `deposit #${i + 1}/${depositCount}: ${label} transfers ${fmt(depositAmount)} USDT`
    );
    const depositId = depositIdFromReceipt(usdt, transferReceipt, deployment.KNTAllInOne);
    const processedBefore = await knt.processedUsdtDeposits(depositId);
    const deadline = Math.floor(Date.now() / 1000) + deadlineSeconds;
    const processReceipt = await wait(
      knt.processUsdtDeposit(wallets[label].address, depositAmount, depositId, 0, 0, 0, 0, 0, deadline),
      `deposit #${i + 1}/${depositCount}: keeper processes ${label}`
    );
    const processedAfter = await knt.processedUsdtDeposits(depositId, { blockTag: processReceipt.blockNumber });
    report.deposits.push({
      index: i + 1,
      label,
      account: wallets[label].address,
      amount: fmt(depositAmount),
      depositId,
      transferTx: transferReceipt.hash,
      processTx: processReceipt.hash,
      processedBefore,
      processedAfter,
      event: parseUsdtDepositEvent(knt, processReceipt),
    });
  }

  const usersAfterDeposits = {};
  for (const label of labels) {
    const user = await knt.users(wallets[label].address);
    usersAfterDeposits[label] = {
      depositAmount: user.depositAmount,
      lpValueUsdt: user.lpValueUsdt,
      power: user.power,
      directLpValueUsdt: user.directLpValueUsdt,
      directEffectiveCount: user.directEffectiveCount,
      isNode: user.isNode,
    };
  }

  const expectedPowerByLabel = Object.fromEntries(
    labels.map((label) => [label, requiredUsdtByLabel[label] * 6n])
  );
  const depositsOk = labels.every((label) =>
    usersAfterDeposits[label].lpValueUsdt === requiredUsdtByLabel[label] &&
    usersAfterDeposits[label].power >= expectedPowerByLabel[label]
  );
  const depositActual = Object.fromEntries(labels.map((label) => [label, {
    depositCount: depositCounts[label],
    lpTokenAmount: fmt(usersAfterDeposits[label].depositAmount),
    lpValueUsdt: fmt(usersAfterDeposits[label].lpValueUsdt),
    expectedLpValueUsdt: fmt(requiredUsdtByLabel[label]),
    power: fmt(usersAfterDeposits[label].power),
    expectedMinPower: fmt(expectedPowerByLabel[label]),
  }]));
  report.results.push(
    depositsOk
      ? pass("50 USDT deposits create LP value and power", "ABCDE round-robin deposits are all processed", depositActual)
      : diff("50 USDT deposits create LP value and power", "ABCDE round-robin deposits are all processed", depositActual)
  );

  const aUser = usersAfterDeposits.A;
  const expectedADirectLp = childLabels.reduce((sum, label) => sum + requiredUsdtByLabel[label], 0n);
  const nodeOk =
    aUser.lpValueUsdt >= ether("1000") &&
    aUser.directLpValueUsdt === expectedADirectLp &&
    aUser.directEffectiveCount === BigInt(childLabels.length) &&
    aUser.isNode;
  report.results.push(
    nodeOk
      ? pass("Node qualification from 50 deposits", "A self LP >=1000U, direct LP >=3000U, effective directs = 4", {
          selfLpValueUsdt: fmt(aUser.lpValueUsdt),
          directLpValueUsdt: fmt(aUser.directLpValueUsdt),
          directEffectiveCount: aUser.directEffectiveCount.toString(),
          inferredDynamicLevelsUnlocked: "8",
          isNode: aUser.isNode,
        })
      : diff("Node qualification from 50 deposits", "A self LP >=1000U, direct LP >=3000U, effective directs = 4", {
          selfLpValueUsdt: fmt(aUser.lpValueUsdt),
          directLpValueUsdt: fmt(aUser.directLpValueUsdt),
          directEffectiveCount: aUser.directEffectiveCount.toString(),
          inferredDynamicLevelsUnlocked: "8",
          isNode: aUser.isNode,
        })
  );

  const [afterDepositTotalLp, afterDepositTotalPower] = await Promise.all([
    knt.totalLpValueUsdt(),
    knt.totalPower(),
  ]);
  const aggregateOk =
    afterDepositTotalLp - beforeTotalLp === totalDepositAmount &&
    afterDepositTotalPower >= totalDepositAmount * 6n;
  report.results.push(
    aggregateOk
      ? pass("Aggregate deposit totals", "total LP +5000U and total power at least +30000", {
          totalLpValueUsdtBefore: fmt(beforeTotalLp),
          totalLpValueUsdtAfterDeposits: fmt(afterDepositTotalLp),
          totalLpValueUsdtDelta: fmt(afterDepositTotalLp - beforeTotalLp),
          totalPowerBefore: fmt(beforeTotalPower),
          totalPowerAfterDeposits: fmt(afterDepositTotalPower),
          totalPowerDelta: fmt(afterDepositTotalPower - beforeTotalPower),
        })
      : diff("Aggregate deposit totals", "total LP +5000U and total power at least +30000", {
          totalLpValueUsdtBefore: fmt(beforeTotalLp),
          totalLpValueUsdtAfterDeposits: fmt(afterDepositTotalLp),
          totalLpValueUsdtDelta: fmt(afterDepositTotalLp - beforeTotalLp),
          totalPowerBefore: fmt(beforeTotalPower),
          totalPowerAfterDeposits: fmt(afterDepositTotalPower),
          totalPowerDelta: fmt(afterDepositTotalPower - beforeTotalPower),
        })
  );

  report.txs.updatePriceForSellTax = (await wait(
    knt.keeperUpdateKntPrices(ether("1.5"), ether("1.5")),
    "keeper updates KNT price for sell tax"
  )).hash;
  report.txs.updateGlobalLpValue = (await wait(
    knt.keeperUpdateGlobalLpValue(afterDepositTotalLp),
    "keeper updates global LP value"
  )).hash;
  report.txs.adminUpdatePool = (await wait(knt.adminUpdatePool(), "admin updates pool")).hash;
  const keeperDistributeReceipt = await wait(
    knt.keeperDistributeRewards(labels.map((label) => wallets[label].address)),
    "keeper distributes pending rewards for A-E"
  );
  report.txs.keeperDistributeRewards = keeperDistributeReceipt.hash;

  const rewardEvents = parseKntEvents(knt, keeperDistributeReceipt).filter((event) => event.name === "RewardDistributed");
  report.results.push(pass("Keeper maintenance calls", "price, global LP, pool update, and reward distribution calls do not revert", {
    updatePriceTx: report.txs.updatePriceForSellTax,
    updateGlobalLpValueTx: report.txs.updateGlobalLpValue,
    adminUpdatePoolTx: report.txs.adminUpdatePool,
    keeperDistributeRewardsTx: report.txs.keeperDistributeRewards,
    rewardEventCount: rewardEvents.length,
  }));

  const queueBefore = await knt.burnQueueLength();
  const bBalanceBeforeBurn = await knt.balanceOf(wallets.B.address);
  const burnReceipt = await wait(kntByLabel.B.transfer(DEAD, burnAmount), "B burns KNT into burn queue");
  const queueAfterBurn = await knt.burnQueueLength();
  const processQueueReceipt = await wait(knt.processBurnQueue(1), "process one burn queue item");
  const queueEntry = await knt.burnQueue(queueBefore);
  const bBalanceAfterBurnQueue = await knt.balanceOf(wallets.B.address);
  const burnQueueOk =
    queueAfterBurn === queueBefore + 1n &&
    queueEntry.paid &&
    queueEntry.rewardAmount === (burnAmount * 12_000n) / BASIS_POINTS &&
    bBalanceAfterBurnQueue - bBalanceBeforeBurn === queueEntry.rewardAmount - burnAmount;
  report.results.push(
    burnQueueOk
      ? pass("Burn queue payout", "B burns 10 KNT and queue pays 12 KNT", {
          queueIndex: queueBefore.toString(),
          paid: queueEntry.paid,
          burnedAmount: fmt(queueEntry.burnedAmount),
          rewardAmount: fmt(queueEntry.rewardAmount),
          bBalanceDelta: fmt(bBalanceAfterBurnQueue - bBalanceBeforeBurn),
        }, [burnReceipt.hash, processQueueReceipt.hash])
      : diff("Burn queue payout", "B burns 10 KNT and queue pays 12 KNT", {
          queueIndex: queueBefore.toString(),
          paid: queueEntry.paid,
          burnedAmount: fmt(queueEntry.burnedAmount),
          rewardAmount: fmt(queueEntry.rewardAmount),
          bBalanceDelta: fmt(bBalanceAfterBurnQueue - bBalanceBeforeBurn),
        }, [burnReceipt.hash, processQueueReceipt.hash])
  );

  const ecosystemWallet = deployment.wallets.ecosystemWallet || deployment.wallets.foundationWallet;
  const autoSellPair = deployment.labubuPair || deployment.pair;
  const observedWallets = [
    autoSellPair,
    deployment.wallets.foundationWallet,
    deployment.wallets.dexSettlementWallet,
    ecosystemWallet,
  ];
  const uniqueObservedWallets = [...new Set(observedWallets.map((item) => item.toLowerCase()))];
  const addressByLower = Object.fromEntries(observedWallets.map((item) => [item.toLowerCase(), item]));
  const balancesBeforeSell = {};
  for (const addressLower of uniqueObservedWallets) {
    balancesBeforeSell[addressLower] = await knt.balanceOf(addressByLower[addressLower]);
  }
  const foundationLabubuBeforeSell = await labubu.balanceOf(deployment.wallets.foundationWallet);
  const burnedBeforeSell = await knt.totalBurned();
  const rewardPoolBeforeSell = await knt.rewardPool();
  const recordBuyReceipt = await wait(knt.recordBuy(wallets.B.address, sellAmount, ether("100")), "record B buy cost basis");
  const sellReceipt = await wait(kntByLabel.B.transfer(autoSellPair, sellAmount), "B transfers KNT to AMM pair");
  const balancesAfterSell = {};
  for (const addressLower of uniqueObservedWallets) {
    balancesAfterSell[addressLower] = await knt.balanceOf(addressByLower[addressLower]);
  }
  const foundationLabubuDeltaSell = (await labubu.balanceOf(deployment.wallets.foundationWallet)) - foundationLabubuBeforeSell;
  const burnedDeltaSell = (await knt.totalBurned()) - burnedBeforeSell;
  const rewardPoolDeltaSell = (await knt.rewardPool()) - rewardPoolBeforeSell;
  const expectedDeltas = {};
  addExpectedDelta(expectedDeltas, autoSellPair, ether("85"));
  addExpectedDelta(expectedDeltas, ecosystemWallet, ether("5.000000000000000001"));
  const taxOk =
    uniqueObservedWallets.every((addressLower) => balancesAfterSell[addressLower] - balancesBeforeSell[addressLower] === (expectedDeltas[addressLower] || 0n)) &&
    foundationLabubuDeltaSell > 0n &&
    burnedDeltaSell === ether("3.333333333333333333") &&
    rewardPoolDeltaSell === ether("3.666666666666666666");
  const balanceDeltas = {};
  for (const addressLower of uniqueObservedWallets) {
    balanceDeltas[addressByLower[addressLower]] = fmt(balancesAfterSell[addressLower] - balancesBeforeSell[addressLower]);
  }
  report.results.push(
    taxOk
      ? pass("Automatic AMM sell tax", "100 KNT sell sends 85 KNT to pair, swaps foundation tax to LABUBU, and distributes taxes", {
          balanceDeltas,
          foundationLabubuDelta: fmt(foundationLabubuDeltaSell),
          burnedDelta: fmt(burnedDeltaSell),
          rewardPoolDelta: fmt(rewardPoolDeltaSell),
        }, [recordBuyReceipt.hash, sellReceipt.hash])
      : diff("Automatic AMM sell tax", "100 KNT sell sends 85 KNT to pair, swaps foundation tax to LABUBU, and distributes taxes", {
          balanceDeltas,
          foundationLabubuDelta: fmt(foundationLabubuDeltaSell),
          burnedDelta: fmt(burnedDeltaSell),
          rewardPoolDelta: fmt(rewardPoolDeltaSell),
        }, [recordBuyReceipt.hash, sellReceipt.hash])
  );

  const boostedMigrationReceipt = await wait(knt.mintMigration(wallets.A.address, migrationAmount), "mint boosted migration position for A");
  const boostedMigrationId = parseMigrationMintedId(knt, boostedMigrationReceipt);
  if (boostedMigrationId === null) throw new Error("MigrationMinted event not found for boosted migration");
  const baseMigrationReceipt = await wait(knt.mintMigration(wallets.B.address, migrationAmount), "mint base migration position for B");
  const baseMigrationId = parseMigrationMintedId(knt, baseMigrationReceipt);
  if (baseMigrationId === null) throw new Error("MigrationMinted event not found for base migration");
  const boostedClaimable = await knt.migrationClaimable(boostedMigrationId);
  const baseClaimable = await knt.migrationClaimable(baseMigrationId);
  report.results.push(
    boostedClaimable === 0n && baseClaimable === 0n
      ? pass("Migration same-day release guard", "new migration positions are not claimable on the same day", {
          boostedMigrationId: boostedMigrationId.toString(),
          boostedClaimable: fmt(boostedClaimable),
          baseMigrationId: baseMigrationId.toString(),
          baseClaimable: fmt(baseClaimable),
        }, [boostedMigrationReceipt.hash, baseMigrationReceipt.hash])
      : diff("Migration same-day release guard", "new migration positions are not claimable on the same day", {
          boostedMigrationId: boostedMigrationId.toString(),
          boostedClaimable: fmt(boostedClaimable),
          baseMigrationId: baseMigrationId.toString(),
          baseClaimable: fmt(baseClaimable),
        }, [boostedMigrationReceipt.hash, baseMigrationReceipt.hash])
  );

  const eUserBeforeKeeperExit = await knt.users(wallets.E.address);
  const eLabubuBeforeKeeperExit = await labubu.balanceOf(wallets.E.address);
  const totalLpBeforeKeeperExit = await knt.totalLpValueUsdt();
  const totalPowerBeforeKeeperExit = await knt.totalPower();
  const keeperExitLpAmount = (eUserBeforeKeeperExit.depositAmount * exitLpValueUsdt) / eUserBeforeKeeperExit.lpValueUsdt;
  const keeperExitReceipt = await wait(
    knt.keeperReduceUserLp(wallets.E.address, keeperExitLpAmount, exitLpValueUsdt),
    "Keeper reduces E LP accounting after LP exit"
  );
  const eUserAfterKeeperExit = await knt.users(wallets.E.address);
  const eLabubuAfterKeeperExit = await labubu.balanceOf(wallets.E.address);
  const totalLpAfterKeeperExit = await knt.totalLpValueUsdt();
  const totalPowerAfterKeeperExit = await knt.totalPower();
  const keeperExitOk =
    eUserBeforeKeeperExit.lpValueUsdt - eUserAfterKeeperExit.lpValueUsdt === exitLpValueUsdt &&
    totalLpBeforeKeeperExit - totalLpAfterKeeperExit === exitLpValueUsdt &&
    eLabubuAfterKeeperExit === eLabubuBeforeKeeperExit;
  report.results.push(
    keeperExitOk
      ? pass("Keeper-synced LP accounting exit", "keeper removes 100U LP value from KNT accounting after a user Pancake LP exit", {
          lpAmountReduced: fmt(keeperExitLpAmount),
          eLpValueBefore: fmt(eUserBeforeKeeperExit.lpValueUsdt),
          eLpValueAfter: fmt(eUserAfterKeeperExit.lpValueUsdt),
          totalLpDelta: fmt(totalLpBeforeKeeperExit - totalLpAfterKeeperExit),
          totalPowerDelta: fmt(totalPowerBeforeKeeperExit - totalPowerAfterKeeperExit),
          eLabubuDelta: fmt(eLabubuAfterKeeperExit - eLabubuBeforeKeeperExit),
        }, keeperExitReceipt.hash)
      : diff("Keeper-synced LP accounting exit", "keeper removes 100U LP value from KNT accounting after a user Pancake LP exit", {
          lpAmountReduced: fmt(keeperExitLpAmount),
          eLpValueBefore: fmt(eUserBeforeKeeperExit.lpValueUsdt),
          eLpValueAfter: fmt(eUserAfterKeeperExit.lpValueUsdt),
          totalLpDelta: fmt(totalLpBeforeKeeperExit - totalLpAfterKeeperExit),
          totalPowerDelta: fmt(totalPowerBeforeKeeperExit - totalPowerAfterKeeperExit),
          eLabubuDelta: fmt(eLabubuAfterKeeperExit - eLabubuBeforeKeeperExit),
        }, keeperExitReceipt.hash)
  );

  const currentDayAfter = await knt.currentDay();
  const lastRewardDayAfter = await knt.lastRewardDay();
  const hasElapsedRewardDay = currentDayAfter > beforeDay;
  if (!hasElapsedRewardDay) {
    report.results.push(skip(
      "Static/dynamic reward accrual after elapsed day",
      "requires BSC Testnet currentDay to advance by at least one day",
      {
        currentDayBefore: beforeDay.toString(),
        currentDayAfter: currentDayAfter.toString(),
        lastRewardDayAfter: lastRewardDayAfter.toString(),
        note: "Run npm run test:local for the time-travel coverage of static reward, dynamic reward, node reward, and migration release payout.",
      }
    ));
  }

  const [finalTotalLp, finalTotalPower, finalRewardPool, finalBurned] = await Promise.all([
    knt.totalLpValueUsdt(),
    knt.totalPower(),
    knt.rewardPool(),
    knt.totalBurned(),
  ]);
  report.after = {
    totalLpValueUsdt: fmt(finalTotalLp),
    totalPower: fmt(finalTotalPower),
    rewardPool: fmt(finalRewardPool),
    totalBurned: fmt(finalBurned),
    currentDay: currentDayAfter.toString(),
    lastRewardDay: lastRewardDayAfter.toString(),
  };

  const outDir = path.join(__dirname, "..", "deployments", "bscTestnet");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "knt-50-deposit-full-business-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, jsonReplacer, 2));

  const counts = report.results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`\nFull 50-deposit business report written to ${outPath}`);
  console.log(JSON.stringify(counts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
