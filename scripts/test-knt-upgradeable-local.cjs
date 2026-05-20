const hre = require("hardhat");

function ether(value) {
  return hre.ethers.parseEther(value);
}

function fmt(value) {
  return hre.ethers.formatEther(value);
}

async function main() {
  const [owner, foundation, dex, a, b, c, d, e] = await hre.ethers.getSigners();
  const KNT = await hre.ethers.getContractFactory("KNTAllInOneUpgradeable");
  const implementation = await KNT.deploy();
  await implementation.waitForDeployment();

  const initData = KNT.interface.encodeFunctionData("initialize", [
    owner.address,
    foundation.address,
    dex.address,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
  ]);
  const Proxy = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");
  const proxy = await Proxy.deploy(await implementation.getAddress(), owner.address, initData);
  await proxy.waitForDeployment();
  const knt = KNT.attach(await proxy.getAddress());

  await knt.setRewardPeriodSeconds(600);
  await knt.fundRewardPool(ether("1000000"));
  await knt.adminImportDeposits(
    [a.address, b.address, c.address, d.address, e.address],
    [ether("1000"), ether("1000"), ether("1000"), ether("1000"), ether("1000")],
    [ether("1000"), ether("1000"), ether("1000"), ether("1000"), ether("1000")],
    [owner.address, a.address, a.address, a.address, a.address]
  );

  await hre.network.provider.send("evm_increaseTime", [601]);
  await hre.network.provider.send("evm_mine");

  const before = await knt.balanceOf(b.address);
  await knt.keeperDistributeRewards([b.address, c.address, d.address, e.address, a.address]);
  const after = await knt.balanceOf(b.address);
  const aUser = await knt.users(a.address);

  if ((await knt.currentDay()) !== 1n) throw new Error("currentDay should be 1 after 600 seconds");
  if (after <= before) throw new Error("static reward was not distributed");
  if (!aUser.isNode || aUser.totalDynamicReward === 0n || aUser.totalNodeReward === 0n) {
    throw new Error("dynamic or node reward was not distributed");
  }

  const migrationId = await knt.nextMigrationId();
  await knt.mintMigration(b.address, ether("1000"));
  await hre.network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
  await hre.network.provider.send("evm_mine");
  const migrationBefore = await knt.balanceOf(b.address);
  await knt.keeperClaimMigrations([migrationId]);
  const migrationAfter = await knt.balanceOf(b.address);
  if (migrationAfter - migrationBefore !== ether("1")) {
    throw new Error("keeper migration claim did not transfer released KNT");
  }

  console.log(JSON.stringify({
    proxy: await proxy.getAddress(),
    implementation: await implementation.getAddress(),
    rewardPeriodSeconds: (await knt.rewardPeriodSeconds()).toString(),
    currentDay: (await knt.currentDay()).toString(),
    bStaticDelta: fmt(after - before),
    bMigrationDelta: fmt(migrationAfter - migrationBefore),
    aDynamicReward: fmt(aUser.totalDynamicReward),
    aNodeReward: fmt(aUser.totalNodeReward),
    status: "PASS",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
