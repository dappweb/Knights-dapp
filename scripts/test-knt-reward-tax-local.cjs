const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

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

function assertEq(name, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${fmt(expected)}, got ${fmt(actual)}`);
  }
}

async function deployKnt() {
  const [owner, a, b, c, d, e, pair, foundation, dex, ecosystem, taxUser] = await hre.ethers.getSigners();
  const KNTAllInOne = await hre.ethers.getContractFactory("KNTAllInOne");
  const knt = await KNTAllInOne.deploy(
    owner.address,
    foundation.address,
    dex.address,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress
  );
  await knt.waitForDeployment();
  await knt.setEcosystemWallet(ecosystem.address);
  await knt.setAmmPair(pair.address, true);
  return { knt, owner, a, b, c, d, e, pair, foundation, dex, ecosystem, taxUser };
}

async function balanceMap(knt, accounts) {
  return Object.fromEntries(
    await Promise.all(Object.entries(accounts).map(async ([label, account]) => [label, await knt.balanceOf(account.address)]))
  );
}

function deltaMap(before, after) {
  return Object.fromEntries(Object.keys(after).map((key) => [key, fmt(after[key] - before[key])]));
}

async function main() {
  const { knt, owner, a, b, c, d, e, pair, foundation, ecosystem, taxUser } = await deployKnt();
  const contract = await knt.getAddress();

  await knt.fundRewardPool(ether("1000000"));
  await knt.adminImportDeposits(
    [a.address, b.address, c.address, d.address, e.address],
    [ether("1000"), ether("1000"), ether("1000"), ether("1000"), ether("1000")],
    [ether("1000"), ether("1000"), ether("1000"), ether("1000"), ether("1000")],
    [owner.address, a.address, a.address, a.address, a.address]
  );

  const aInfoBefore = await knt.users(a.address);
  if (!aInfoBefore.isNode) throw new Error("A should qualify as node before reward distribution");

  await hre.network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
  await hre.network.provider.send("evm_mine");

  const rewardBalancesBefore = await balanceMap(knt, { owner, foundation, A: a, B: b, C: c, D: d, E: e });
  const rewardReceipt = await (await knt.keeperDistributeRewards([
    b.address,
    c.address,
    d.address,
    e.address,
    a.address,
    owner.address,
    foundation.address,
  ])).wait();
  const rewardBalancesAfter = await balanceMap(knt, { owner, foundation, A: a, B: b, C: c, D: d, E: e });

  const expectedChildStatic = ether("157.872");
  const expectedADelta = ether("440.1696");
  const expectedOwnerDynamic = ether("63.1488");
  const expectedSinkDynamic = ether("434.5536");
  assertEq("B static reward", rewardBalancesAfter.B - rewardBalancesBefore.B, expectedChildStatic);
  assertEq("C static reward", rewardBalancesAfter.C - rewardBalancesBefore.C, expectedChildStatic);
  assertEq("D static reward", rewardBalancesAfter.D - rewardBalancesBefore.D, expectedChildStatic);
  assertEq("E static reward", rewardBalancesAfter.E - rewardBalancesBefore.E, expectedChildStatic);
  assertEq("A static + dynamic + node reward", rewardBalancesAfter.A - rewardBalancesBefore.A, expectedADelta);
  assertEq("owner dynamic reward", rewardBalancesAfter.owner - rewardBalancesBefore.owner, expectedOwnerDynamic);
  assertEq("project sink dynamic reward", rewardBalancesAfter.foundation - rewardBalancesBefore.foundation, expectedSinkDynamic);

  const aInfoAfter = await knt.users(a.address);
  assertEq("A total static reward", aInfoAfter.totalStaticReward, expectedChildStatic);
  assertEq("A total direct dynamic reward", aInfoAfter.totalDynamicReward, ether("126.2976"));
  assertEq("A total node reward", aInfoAfter.totalNodeReward, ether("156"));

  await knt.transfer(taxUser.address, ether("300"));

  const observed = { pair, foundation, ecosystem };
  const sellBefore = await balanceMap(knt, observed);
  const burnedBeforeSell = await knt.totalBurned();
  const rewardPoolBeforeSell = await knt.rewardPool();
  await knt.recordBuy(taxUser.address, ether("100"), ether("100"));
  await knt.keeperUpdateKntPrices(ether("1.5"), ether("1.5"));
  const profitSellReceipt = await (await knt.connect(taxUser).transfer(pair.address, ether("100"))).wait();
  const sellAfter = await balanceMap(knt, observed);
  const burnedAfterSell = await knt.totalBurned();
  const rewardPoolAfterSell = await knt.rewardPool();

  assertEq("profit sell pair net", sellAfter.pair - sellBefore.pair, ether("85"));
  assertEq("profit sell foundation tax", sellAfter.foundation - sellBefore.foundation, ether("3"));
  assertEq("profit sell ecosystem tax", sellAfter.ecosystem - sellBefore.ecosystem, ether("5.000000000000000001"));
  assertEq("profit sell burn", burnedAfterSell - burnedBeforeSell, ether("3.333333333333333333"));
  assertEq("profit sell reward pool", rewardPoolAfterSell - rewardPoolBeforeSell, ether("3.666666666666666666"));

  const dumpBefore = await balanceMap(knt, observed);
  const burnedBeforeDump = await knt.totalBurned();
  const rewardPoolBeforeDump = await knt.rewardPool();
  await knt.keeperUpdateKntPrices(ether("0.875"), ether("1"));
  const dumpSellReceipt = await (await knt.connect(taxUser).transfer(pair.address, ether("100"))).wait();
  const dumpAfter = await balanceMap(knt, observed);
  const burnedAfterDump = await knt.totalBurned();
  const rewardPoolAfterDump = await knt.rewardPool();

  assertEq("dump sell pair net", dumpAfter.pair - dumpBefore.pair, ether("82.5"));
  assertEq("dump sell foundation tax", dumpAfter.foundation - dumpBefore.foundation, ether("3"));
  assertEq("dump sell ecosystem tax", dumpAfter.ecosystem - dumpBefore.ecosystem, 0n);
  assertEq("dump sell burn", burnedAfterDump - burnedBeforeDump, ether("6.25"));
  assertEq("dump sell reward pool", rewardPoolAfterDump - rewardPoolBeforeDump, ether("8.25"));

  const report = {
    network: hre.network.name,
    testedAt: new Date().toISOString(),
    contract,
    rewards: {
      currentDay: (await knt.currentDay()).toString(),
      rewardTx: rewardReceipt.hash,
      nodeCount: (await knt.nodeCount()).toString(),
      dailyEmissionDay0: fmt(await knt.dailyEmissionForDay(0)),
      static: {
        childStaticEach: fmt(expectedChildStatic),
        B: fmt(rewardBalancesAfter.B - rewardBalancesBefore.B),
        C: fmt(rewardBalancesAfter.C - rewardBalancesBefore.C),
        D: fmt(rewardBalancesAfter.D - rewardBalancesBefore.D),
        E: fmt(rewardBalancesAfter.E - rewardBalancesBefore.E),
      },
      dynamic: {
        aDirectDynamic: fmt(aInfoAfter.totalDynamicReward),
        ownerUplineDynamic: fmt(rewardBalancesAfter.owner - rewardBalancesBefore.owner),
        projectSinkDynamic: fmt(rewardBalancesAfter.foundation - rewardBalancesBefore.foundation),
        dynamicPoolRemaining: fmt(await knt.dynamicPool()),
      },
      node: {
        A: fmt(aInfoAfter.totalNodeReward),
        accNodeRewardPerNode: fmt(await knt.accNodeRewardPerNode()),
      },
      balanceDeltas: deltaMap(rewardBalancesBefore, rewardBalancesAfter),
    },
    taxes: {
      profitSell: {
        tx: profitSellReceipt.hash,
        pairNet: fmt(sellAfter.pair - sellBefore.pair),
        foundationTax: fmt(sellAfter.foundation - sellBefore.foundation),
        ecosystemTax: fmt(sellAfter.ecosystem - sellBefore.ecosystem),
        burned: fmt(burnedAfterSell - burnedBeforeSell),
        rewardPoolAdded: fmt(rewardPoolAfterSell - rewardPoolBeforeSell),
      },
      dumpSell: {
        tx: dumpSellReceipt.hash,
        pairNet: fmt(dumpAfter.pair - dumpBefore.pair),
        foundationTax: fmt(dumpAfter.foundation - dumpBefore.foundation),
        ecosystemTax: fmt(dumpAfter.ecosystem - dumpBefore.ecosystem),
        burned: fmt(burnedAfterDump - burnedBeforeDump),
        rewardPoolAdded: fmt(rewardPoolAfterDump - rewardPoolBeforeDump),
      },
    },
    status: "PASS",
  };

  const outDir = path.join(__dirname, "..", "deployments", "local");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "knt-reward-tax-test-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, jsonReplacer, 2));
  console.log(JSON.stringify(report, jsonReplacer, 2));
  console.log(`Reward and tax test report written to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
