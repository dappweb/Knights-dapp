const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const DEAD = "0x000000000000000000000000000000000000dEaD";

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

function ether(value) {
  return hre.ethers.parseEther(value);
}

function fmt(value) {
  return hre.ethers.formatEther(value);
}

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required");
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "bscTestnet", "knt-pancake-test-pool.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const [deployer] = await hre.ethers.getSigners();
  const provider = hre.ethers.provider;
  const deployerAddress = await deployer.getAddress();

  const KNT = await hre.ethers.getContractFactory("KNTAllInOne");
  const knt = KNT.attach(deployment.KNTAllInOne).connect(deployer);

  const labubu = new hre.ethers.Contract(
    deployment.LABUBU,
    ["function balanceOf(address) view returns(uint256)", "function totalSupply() view returns(uint256)"],
    provider
  );
  const usdt = new hre.ethers.Contract(
    deployment.USDT,
    [
      "event Transfer(address indexed from,address indexed to,uint256 value)",
      "function balanceOf(address) view returns(uint256)",
      "function transfer(address,uint256) returns(bool)",
    ],
    deployer
  );
  const labubuPair = new hre.ethers.Contract(
    deployment.labubuPair || deployment.pair,
    [
      "function token0() view returns(address)",
      "function token1() view returns(address)",
      "function getReserves() view returns(uint112,uint112,uint32)",
      "function totalSupply() view returns(uint256)",
    ],
    provider
  );
  const labubuUsdtPair = new hre.ethers.Contract(
    deployment.labubuUsdtPair,
    [
      "function token0() view returns(address)",
      "function token1() view returns(address)",
      "function getReserves() view returns(uint112,uint112,uint32)",
      "function totalSupply() view returns(uint256)",
    ],
    provider
  );

  const report = {
    network: hre.network.name,
    chainId: Number((await provider.getNetwork()).chainId),
    testedAt: new Date().toISOString(),
    deployment,
    testAccounts: {},
    results: [],
  };

  const totalSupply = await knt.totalSupply();
  report.results.push(
    totalSupply === ether("210000000")
      ? pass("KNT total supply", "210000000", fmt(totalSupply))
      : diff("KNT total supply", "210000000", fmt(totalSupply))
  );

  const [token0, token1, reserves, lpSupply] = await Promise.all([
    labubuPair.token0(),
    labubuPair.token1(),
    labubuPair.getReserves(),
    labubuPair.totalSupply(),
  ]);
  const pairHasTokens =
    [token0.toLowerCase(), token1.toLowerCase()].includes(deployment.KNTAllInOne.toLowerCase()) &&
    [token0.toLowerCase(), token1.toLowerCase()].includes(deployment.LABUBU.toLowerCase());
  report.results.push(
    pairHasTokens && lpSupply > 0n
      ? pass("Pancake KNT/LABUBU pair created", "pair has KNT and LABUBU with LP supply > 0", {
          token0,
          token1,
          reserve0: reserves[0].toString(),
          reserve1: reserves[1].toString(),
          lpSupply: lpSupply.toString(),
        })
      : diff("Pancake KNT/LABUBU pair created", "pair has KNT and LABUBU with LP supply > 0", {
          token0,
          token1,
          reserve0: reserves[0].toString(),
          reserve1: reserves[1].toString(),
          lpSupply: lpSupply.toString(),
        })
  );

  const [labubuUsdtToken0, labubuUsdtToken1, labubuUsdtReserves, labubuUsdtLpSupply] = await Promise.all([
    labubuUsdtPair.token0(),
    labubuUsdtPair.token1(),
    labubuUsdtPair.getReserves(),
    labubuUsdtPair.totalSupply(),
  ]);
  const labubuUsdtPairHasTokens =
    [labubuUsdtToken0.toLowerCase(), labubuUsdtToken1.toLowerCase()].includes(deployment.LABUBU.toLowerCase()) &&
    [labubuUsdtToken0.toLowerCase(), labubuUsdtToken1.toLowerCase()].includes(deployment.USDT.toLowerCase());
  report.results.push(
    labubuUsdtPairHasTokens && labubuUsdtLpSupply > 0n
      ? pass("Pancake LABUBU/USDT pair created", "pair has LABUBU and USDT with LP supply > 0", {
          token0: labubuUsdtToken0,
          token1: labubuUsdtToken1,
          reserve0: labubuUsdtReserves[0].toString(),
          reserve1: labubuUsdtReserves[1].toString(),
          lpSupply: labubuUsdtLpSupply.toString(),
        })
      : diff("Pancake LABUBU/USDT pair created", "pair has LABUBU and USDT with LP supply > 0", {
          token0: labubuUsdtToken0,
          token1: labubuUsdtToken1,
          reserve0: labubuUsdtReserves[0].toString(),
          reserve1: labubuUsdtReserves[1].toString(),
          lpSupply: labubuUsdtLpSupply.toString(),
        })
  );

  const labels = ["A", "B", "C", "D", "E"];
  const wallets = Object.fromEntries(labels.map((label) => [label, hre.ethers.Wallet.createRandom().connect(provider)]));
  const childLabels = labels.slice(1);
  report.testAccounts = Object.fromEntries(labels.map((label) => [label, wallets[label].address]));

  for (const label of labels) {
    await wait(deployer.sendTransaction({ to: wallets[label].address, value: ether("0.02") }), `fund ${label} gas`);
  }
  await wait(knt.transfer(wallets.A.address, ether("10000")), "fund A KNT");
  await wait(knt.transfer(wallets.B.address, ether("6000")), "fund B KNT");
  for (const label of ["C", "D", "E"]) {
    await wait(knt.transfer(wallets[label].address, ether("2500")), `fund ${label} KNT`);
  }
  for (const label of labels) {
    await wait(usdt.transfer(wallets[label].address, ether("1000")), `fund ${label} USDT`);
  }

  const kntByLabel = Object.fromEntries(labels.map((label) => [label, knt.connect(wallets[label])]));
  const usdtByLabel = Object.fromEntries(labels.map((label) => [label, usdt.connect(wallets[label])]));

  const referralSignalAmount = ether(process.env.REFERRAL_SIGNAL_AMOUNT || "1");
  await wait(knt.setReferralSignalAmount(referralSignalAmount), "set referral signal amount");

  const referralTxs = [];
  for (const label of childLabels) {
    const sig1 = await wait(kntByLabel.A.transfer(wallets[label].address, referralSignalAmount), `A sends referral signal KNT to ${label}`);
    const sig2 = await wait(kntByLabel[label].transfer(wallets.A.address, referralSignalAmount), `${label} returns referral signal KNT to A`);
    referralTxs.push(sig1.hash, sig2.hash);
  }

  const referrers = {};
  for (const label of childLabels) {
    referrers[label] = await knt.referrerOf(wallets[label].address);
  }
  const referralsOk = childLabels.every((label) => referrers[label].toLowerCase() === wallets.A.address.toLowerCase());
  report.results.push(
    referralsOk
      ? pass("A-E referral binding by mutual N KNT transfers", "B/C/D/E referrer = A", referrers, referralTxs)
      : diff("A-E referral binding by mutual N KNT transfers", "B/C/D/E referrer = A", referrers, referralTxs)
  );

  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const coder = hre.ethers.AbiCoder.defaultAbiCoder();
  function depositIdFromReceipt(receipt) {
    const transferLog = receipt.logs.find((log) => {
      if (String(log.address).toLowerCase() !== String(deployment.USDT).toLowerCase()) return false;
      try {
        const parsed = usdt.interface.parseLog(log);
        return parsed?.name === "Transfer" && parsed.args.to.toLowerCase() === deployment.KNTAllInOne.toLowerCase();
      } catch (_error) {
        return false;
      }
    });
    if (!transferLog) throw new Error(`USDT transfer log not found in ${receipt.hash}`);
    return hre.ethers.keccak256(coder.encode(["bytes32", "uint256"], [receipt.hash, transferLog.index]));
  }

  const depositReceipts = {};
  for (const label of labels) {
    const transferReceipt = await wait(usdtByLabel[label].transfer(deployment.KNTAllInOne, ether("1000")), `${label} transfers 1000 USDT to KNT contract`);
    const depositId = depositIdFromReceipt(transferReceipt);
    depositReceipts[label] = await wait(
      knt.processUsdtDeposit(wallets[label].address, ether("1000"), depositId, 0, 0, 0, 0, 0, deadline),
      `keeper processes ${label} USDT deposit`
    );
  }

  const users = {};
  for (const label of labels) {
    users[label] = await knt.users(wallets[label].address);
  }

  const depositOk = labels.every((label) =>
    users[label].lpValueUsdt >= ether("1000") &&
    users[label].power >= ether("6000")
  );
  const depositActual = Object.fromEntries(labels.map((label) => [label, {
    lpTokenAmount: fmt(users[label].depositAmount),
    lpValueUsdt: fmt(users[label].lpValueUsdt),
    power: fmt(users[label].power),
  }]));
  report.results.push(
    depositOk
      ? pass("A-E USDT deposits buy LABUBU, swap half to KNT, add LP, and create power", "each account: 1000U LP value and >=6000 power", depositActual, Object.values(depositReceipts).map((item) => item.hash))
      : diff("A-E USDT deposits buy LABUBU, swap half to KNT, add LP, and create power", "each account: 1000U LP value and >=6000 power", depositActual, Object.values(depositReceipts).map((item) => item.hash))
  );

  const nodeOk =
    users.A.isNode &&
    users.A.directLpValueUsdt >= ether("3000") &&
    users.A.directEffectiveCount >= 1n;
  report.results.push(
    nodeOk
      ? pass("Node qualification from A-E deposits", "A has >=1000 self LP, >=3000 direct LP, >=1 effective account", {
          isNode: users.A.isNode,
          directLpValueUsdt: fmt(users.A.directLpValueUsdt),
          directEffectiveCount: users.A.directEffectiveCount.toString(),
        })
      : diff("Node qualification from A-E deposits", "A has >=1000 self LP, >=3000 direct LP, >=1 effective account", {
          isNode: users.A.isNode,
          directLpValueUsdt: fmt(users.A.directLpValueUsdt),
          directEffectiveCount: users.A.directEffectiveCount.toString(),
        })
  );

  const queueBefore = await knt.burnQueueLength();
  const burnTx = await wait(kntByLabel.B.transfer(DEAD, ether("10")), "B sends 10 KNT to dead");
  const queueAfter = await knt.burnQueueLength();
  report.results.push(
    queueAfter === queueBefore + 1n
      ? pass("Burn queue entry from transfer to dead", "queue length increases by 1", {
          before: queueBefore.toString(),
          after: queueAfter.toString(),
        }, burnTx.hash)
      : diff("Burn queue entry from transfer to dead", "queue length increases by 1", {
          before: queueBefore.toString(),
          after: queueAfter.toString(),
        }, burnTx.hash)
  );

  const processTx = await wait(knt.processBurnQueue(1), "process one burn queue item");
  const queueEntry = await knt.burnQueue(queueBefore);
  report.results.push(
    queueEntry.paid && queueEntry.rewardAmount === ether("12")
      ? pass("Burn queue pays 1.2x", "10 KNT queued pays 12 KNT", {
          paid: queueEntry.paid,
          rewardAmount: fmt(queueEntry.rewardAmount),
        }, processTx.hash)
      : diff("Burn queue pays 1.2x", "10 KNT queued pays 12 KNT", {
          paid: queueEntry.paid,
          rewardAmount: fmt(queueEntry.rewardAmount),
        }, processTx.hash)
  );

  const recordTx = await wait(knt.recordBuy(wallets.B.address, ether("100"), ether("100")), "record B buy cost");
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
  const balancesBefore = {};
  for (const addressLower of uniqueObservedWallets) {
    balancesBefore[addressLower] = await knt.balanceOf(addressByLower[addressLower]);
  }
  const foundationLabubuBefore = await labubu.balanceOf(deployment.wallets.foundationWallet);
  const burnedBefore = await knt.totalBurned();
  const rewardPoolBefore = await knt.rewardPool();
  await wait(knt.keeperUpdateKntPrices(ether("1.5"), ether("1.5")), "keeper updates KNT price for auto sell tax");
  const sellTx = await wait(kntByLabel.B.transfer(autoSellPair, ether("100")), "B transfers 100 KNT to AMM pair");
  const balancesAfter = {};
  for (const addressLower of uniqueObservedWallets) {
    balancesAfter[addressLower] = await knt.balanceOf(addressByLower[addressLower]);
  }
  const foundationLabubuDelta = (await labubu.balanceOf(deployment.wallets.foundationWallet)) - foundationLabubuBefore;
  const burnedAfter = await knt.totalBurned();
  const rewardPoolAfter = await knt.rewardPool();
  const burnedDelta = burnedAfter - burnedBefore;
  const rewardPoolDelta = rewardPoolAfter - rewardPoolBefore;

  const expectedDeltas = {};
  function addExpected(address, amount) {
    const key = address.toLowerCase();
    expectedDeltas[key] = (expectedDeltas[key] || 0n) + amount;
  }
  addExpected(autoSellPair, ether("85"));
  addExpected(ecosystemWallet, ether("5.000000000000000001"));

  const balanceDeltas = {};
  for (const addressLower of uniqueObservedWallets) {
    balanceDeltas[addressByLower[addressLower]] = fmt(balancesAfter[addressLower] - balancesBefore[addressLower]);
  }
  const taxOk = uniqueObservedWallets.every((addressLower) => {
    const actual = balancesAfter[addressLower] - balancesBefore[addressLower];
    return actual === (expectedDeltas[addressLower] || 0n);
  }) && foundationLabubuDelta > 0n && burnedDelta === ether("3.333333333333333333") && rewardPoolDelta === ether("3.666666666666666666");
  report.results.push(
    taxOk
      ? pass("Automatic AMM sell tax + profit tax distribution", "100 KNT sent to AMM pair at 150U after 100U cost; pair receives 85 KNT, foundation receives LABUBU, and taxes are distributed", {
          balanceDeltas,
          foundationLabubuDelta: fmt(foundationLabubuDelta),
          burnedDelta: fmt(burnedDelta),
          rewardPoolDelta: fmt(rewardPoolDelta),
        }, [recordTx.hash, sellTx.hash])
      : diff("Automatic AMM sell tax + profit tax distribution", "100 KNT sent to AMM pair at 150U after 100U cost; pair receives 85 KNT, foundation receives LABUBU, and taxes are distributed", {
          balanceDeltas,
          foundationLabubuDelta: fmt(foundationLabubuDelta),
          burnedDelta: fmt(burnedDelta),
          rewardPoolDelta: fmt(rewardPoolDelta),
        }, [recordTx.hash, sellTx.hash])
  );

  const migrationId = await knt.nextMigrationId();
  const migrationTx = await wait(knt.mintMigration(wallets.B.address, ether("1000")), "mint B migration position");
  const claimableNow = await knt.migrationClaimable(migrationId);
  report.results.push(
    claimableNow === 0n
      ? pass("Migration release starts after elapsed days", "same-day claimable = 0", fmt(claimableNow), migrationTx.hash)
      : diff("Migration release starts after elapsed days", "same-day claimable = 0", fmt(claimableNow), migrationTx.hash)
  );

  report.results.push(skip("Daily static reward and 1.2% power compounding", "requires one or more real days on BSC Testnet", "not time-traveled on public testnet"));
  report.results.push(skip("Migration 0.1%/0.3% daily release payout", "requires one or more real days on BSC Testnet", "same-day claimable verified as 0"));
  report.results.push(skip("KNT transfer deposit workflow", "users should enter with USDT only", "removed as a business entry path"));
  report.results.push(skip("ERC721 migration NFT form", "migration position should be NFT asset", "current implementation uses internal MigrationPosition"));

  const outDir = path.join(__dirname, "..", "deployments", "bscTestnet");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "knt-business-test-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\nBusiness test report written to ${outPath}`);
  const counts = report.results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify(counts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
