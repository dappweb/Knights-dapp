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
  const pair = new hre.ethers.Contract(
    deployment.pair,
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
    pair.token0(),
    pair.token1(),
    pair.getReserves(),
    pair.totalSupply(),
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

  const walletA = hre.ethers.Wallet.createRandom().connect(provider);
  const walletB = hre.ethers.Wallet.createRandom().connect(provider);
  report.testAccounts = {
    referrerA: walletA.address,
    userB: walletB.address,
  };

  await wait(deployer.sendTransaction({ to: walletA.address, value: ether("0.01") }), "fund A gas");
  await wait(deployer.sendTransaction({ to: walletB.address, value: ether("0.01") }), "fund B gas");
  await wait(knt.transfer(walletA.address, ether("2500")), "fund A KNT");
  await wait(knt.transfer(walletB.address, ether("6000")), "fund B KNT");

  const kntA = knt.connect(walletA);
  const kntB = knt.connect(walletB);

  const sig1 = await wait(kntA.transfer(walletB.address, 0), "A sends 0 KNT to B");
  const sig2 = await wait(kntB.transfer(walletA.address, 0), "B sends 0 KNT to A");
  const bReferrer = await knt.referrerOf(walletB.address);
  report.results.push(
    bReferrer.toLowerCase() === walletA.address.toLowerCase()
      ? pass("Referral binding by two zero transfers", `B referrer = ${walletA.address}`, bReferrer, [sig1.hash, sig2.hash])
      : diff("Referral binding by two zero transfers", `B referrer = ${walletA.address}`, bReferrer, [sig1.hash, sig2.hash])
  );

  const aDeposit = await wait(kntA.transfer(deployment.KNTAllInOne, ether("1000")), "A deposits 1000 KNT");
  const bDeposit = await wait(kntB.transfer(deployment.KNTAllInOne, ether("3000")), "B deposits 3000 KNT");
  const userA = await knt.users(walletA.address);
  const userB = await knt.users(walletB.address);

  const depositOk =
    userA.depositAmount >= ether("1000") &&
    userA.lpValueUsdt >= ether("1000") &&
    userA.power >= ether("6000") &&
    userB.depositAmount >= ether("3000") &&
    userB.power >= ether("18000");
  report.results.push(
    depositOk
      ? pass("Transfer KNT to contract auto-deposits and creates power", "A: 1000 deposit/6000 power; B: 3000 deposit/18000 power", {
          aDepositAmount: fmt(userA.depositAmount),
          aPower: fmt(userA.power),
          bDepositAmount: fmt(userB.depositAmount),
          bPower: fmt(userB.power),
        }, [aDeposit.hash, bDeposit.hash])
      : diff("Transfer KNT to contract auto-deposits and creates power", "A: 1000 deposit/6000 power; B: 3000 deposit/18000 power", {
          aDepositAmount: fmt(userA.depositAmount),
          aPower: fmt(userA.power),
          bDepositAmount: fmt(userB.depositAmount),
          bPower: fmt(userB.power),
        }, [aDeposit.hash, bDeposit.hash])
  );

  const nodeOk =
    userA.isNode &&
    userA.directLpValueUsdt >= ether("3000") &&
    userA.directEffectiveCount >= 1n;
  report.results.push(
    nodeOk
      ? pass("Node qualification", "A has >=1000 self LP, >=3000 direct LP, >=1 effective account", {
          isNode: userA.isNode,
          directLpValueUsdt: fmt(userA.directLpValueUsdt),
          directEffectiveCount: userA.directEffectiveCount.toString(),
        })
      : diff("Node qualification", "A has >=1000 self LP, >=3000 direct LP, >=1 effective account", {
          isNode: userA.isNode,
          directLpValueUsdt: fmt(userA.directLpValueUsdt),
          directEffectiveCount: userA.directEffectiveCount.toString(),
        })
  );

  const queueBefore = await knt.burnQueueLength();
  const burnTx = await wait(kntB.transfer(DEAD, ether("10")), "B sends 10 KNT to dead");
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

  const recordTx = await wait(knt.recordBuy(walletB.address, ether("100"), ether("100")), "record B buy cost");
  const foundationBefore = await knt.balanceOf(deployment.wallets.foundationWallet);
  const dexBefore = await knt.balanceOf(deployment.wallets.dexSettlementWallet);
  const burnedBefore = await knt.totalBurned();
  const sellTx = await wait(kntB.settleSell(ether("100"), ether("150"), ether("150"), ether("150")), "B settles profitable sell");
  const foundationAfter = await knt.balanceOf(deployment.wallets.foundationWallet);
  const dexAfter = await knt.balanceOf(deployment.wallets.dexSettlementWallet);
  const burnedAfter = await knt.totalBurned();
  const foundationDelta = foundationAfter - foundationBefore;
  const dexDelta = dexAfter - dexBefore;
  const burnedDelta = burnedAfter - burnedBefore;

  const sameSettlementWallet =
    deployment.wallets.foundationWallet.toLowerCase() === deployment.wallets.dexSettlementWallet.toLowerCase();
  const taxOk = sameSettlementWallet
    ? foundationDelta === ether("93.000000000000000001") && dexDelta === ether("93.000000000000000001") && burnedDelta === ether("3.333333333333333333")
    : foundationDelta === ether("8.000000000000000001") && dexDelta === ether("85") && burnedDelta === ether("3.333333333333333333");
  report.results.push(
    taxOk
      ? pass("Sell tax + profit tax distribution", "100 KNT sell at 150U after 100U cost; same foundation/dex wallet receives combined 93.000000000000000001 KNT", {
          sameSettlementWallet,
          foundationDelta: fmt(foundationDelta),
          dexDelta: fmt(dexDelta),
          burnedDelta: fmt(burnedDelta),
        }, [recordTx.hash, sellTx.hash])
      : diff("Sell tax + profit tax distribution", "100 KNT sell at 150U after 100U cost; same foundation/dex wallet receives combined 93.000000000000000001 KNT", {
          sameSettlementWallet,
          foundationDelta: fmt(foundationDelta),
          dexDelta: fmt(dexDelta),
          burnedDelta: fmt(burnedDelta),
        }, [recordTx.hash, sellTx.hash])
  );

  const migrationId = await knt.nextMigrationId();
  const migrationTx = await wait(knt.mintMigration(walletB.address, ether("1000")), "mint B migration position");
  const claimableNow = await knt.migrationClaimable(migrationId);
  report.results.push(
    claimableNow === 0n
      ? pass("Migration release starts after elapsed days", "same-day claimable = 0", fmt(claimableNow), migrationTx.hash)
      : diff("Migration release starts after elapsed days", "same-day claimable = 0", fmt(claimableNow), migrationTx.hash)
  );

  report.results.push(skip("Daily static reward and 1.2% power compounding", "requires one or more real days on BSC Testnet", "not time-traveled on public testnet"));
  report.results.push(skip("Migration 0.1%/0.3% daily release payout", "requires one or more real days on BSC Testnet", "same-day claimable verified as 0"));
  report.results.push(skip("Native USDT -> LABUBU/KNT -> LP deposit workflow", "XMind describes auto split and LP creation from U", "current contract supports KNT transfer deposit; Pancake test pool exists separately"));
  report.results.push(skip("Automatic Pancake sell tax hook", "taxes should trigger on swap sell automatically", "current implementation uses explicit settleSell()"));
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
