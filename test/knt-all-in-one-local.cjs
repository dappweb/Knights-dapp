const assert = require("assert");
const { ethers, network } = require("hardhat");

const DEAD = "0x000000000000000000000000000000000000dEaD";

function ether(value) {
  return ethers.parseEther(value);
}

function packLegacyAmount(lpAmount, power) {
  return (power << 128n) | lpAmount;
}

async function deployKnt() {
  const [owner, user, pair, foundation, dex, ecosystem, admin, manager, keeper, taxKeeper] = await ethers.getSigners();
  const KNTAllInOne = await ethers.getContractFactory("KNTAllInOne");
  const knt = await KNTAllInOne.deploy(
    owner.address,
    foundation.address,
    dex.address,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  await knt.waitForDeployment();
  await knt.setEcosystemWallet(ecosystem.address);
  await knt.setAmmPair(pair.address, true);
  return { knt, owner, user, pair, foundation, dex, ecosystem, admin, manager, keeper, taxKeeper };
}

async function deployKntWithFoundationSwap() {
  const [owner, user, pair, foundation, dex, ecosystem, admin, manager, keeper, taxKeeper] = await ethers.getSigners();
  const TestToken = await ethers.getContractFactory("TestToken");
  const TestPancakeRouter = await ethers.getContractFactory("TestPancakeRouter");

  const usdt = await TestToken.deploy("Tether USD Test Token", "USDT", 18, owner.address);
  await usdt.waitForDeployment();
  const labubu = await TestToken.deploy("LABUBU Test Token", "LABUBU", 18, owner.address);
  await labubu.waitForDeployment();
  const router = await TestPancakeRouter.deploy();
  await router.waitForDeployment();

  const KNTAllInOne = await ethers.getContractFactory("KNTAllInOne");
  const knt = await KNTAllInOne.deploy(
    owner.address,
    foundation.address,
    dex.address,
    await router.getAddress(),
    await usdt.getAddress(),
    await labubu.getAddress()
  );
  await knt.waitForDeployment();
  await knt.setEcosystemWallet(ecosystem.address);
  await knt.setLiquidityConfig(await router.getAddress(), await usdt.getAddress(), await labubu.getAddress(), pair.address);

  await labubu.mint(await router.getAddress(), ether("1000000"));
  await router.setSwapOutputEqualInput(await knt.getAddress(), await labubu.getAddress());

  return { knt, usdt, labubu, router, owner, user, pair, foundation, dex, ecosystem, admin, manager, keeper, taxKeeper };
}

async function deployUsdtDepositHarness() {
  const [owner, user, pair, foundation, dex, keeper] = await ethers.getSigners();
  const TestToken = await ethers.getContractFactory("TestToken");
  const TestPancakeRouter = await ethers.getContractFactory("TestPancakeRouter");

  const usdt = await TestToken.deploy("Tether USD Test Token", "USDT", 18, owner.address);
  await usdt.waitForDeployment();
  const labubu = await TestToken.deploy("LABUBU Test Token", "LABUBU", 18, owner.address);
  await labubu.waitForDeployment();
  const wbnb = await TestToken.deploy("Wrapped BNB Test Token", "WBNB", 18, owner.address);
  await wbnb.waitForDeployment();
  const router = await TestPancakeRouter.deploy();
  await router.waitForDeployment();

  const KNTAllInOne = await ethers.getContractFactory("KNTAllInOne");
  const knt = await KNTAllInOne.deploy(
    owner.address,
    foundation.address,
    dex.address,
    await router.getAddress(),
    await usdt.getAddress(),
    await labubu.getAddress()
  );
  await knt.waitForDeployment();
  await knt.setLiquidityConfig(await router.getAddress(), await usdt.getAddress(), await labubu.getAddress(), pair.address);
  await knt.setKeeper(keeper.address, true);

  return { knt, usdt, labubu, wbnb, router, owner, user, pair, dex, keeper };
}

async function deployUpgradeableUsdtDepositHarness() {
  const [owner, user, pair, foundation, dex, keeper, admin] = await ethers.getSigners();
  const TestToken = await ethers.getContractFactory("TestToken");
  const TestPancakeRouter = await ethers.getContractFactory("TestPancakeRouter");

  const usdt = await TestToken.deploy("Tether USD Test Token", "USDT", 18, owner.address);
  await usdt.waitForDeployment();
  const labubu = await TestToken.deploy("LABUBU Test Token", "LABUBU", 18, owner.address);
  await labubu.waitForDeployment();
  const router = await TestPancakeRouter.deploy();
  await router.waitForDeployment();

  const KNTUpgradeable = await ethers.getContractFactory("KNTAllInOneUpgradeable");
  const implementation = await KNTUpgradeable.deploy();
  await implementation.waitForDeployment();

  const initData = KNTUpgradeable.interface.encodeFunctionData("initialize", [
    owner.address,
    foundation.address,
    dex.address,
    await router.getAddress(),
    await usdt.getAddress(),
    await labubu.getAddress(),
  ]);
  const Proxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
  const proxy = await Proxy.deploy(await implementation.getAddress(), owner.address, initData);
  await proxy.waitForDeployment();
  const knt = KNTUpgradeable.attach(await proxy.getAddress());

  await knt.setLiquidityConfig(await router.getAddress(), await usdt.getAddress(), await labubu.getAddress(), pair.address);
  await knt.setKeeper(keeper.address, true);

  return { knt, usdt, labubu, router, owner, user, pair, dex, keeper, admin };
}

async function parsedEvents(knt, tx) {
  const receipt = await (await tx).wait();
  return receipt.logs
    .map((log) => {
      try {
        return knt.interface.parseLog(log);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

describe("KNTAllInOne business guards", function () {
  it("enforces owner, admin, manager, and keeper permissions", async function () {
    const { knt, owner, user, admin, manager, keeper, taxKeeper, ecosystem } = await deployKnt();

    await assert.rejects(knt.connect(user).setKeeper(keeper.address, true));
    await assert.rejects(knt.connect(user).setAdmin(admin.address, true));

    await knt.setAdmin(admin.address, true);
    await knt.connect(admin).setManager(manager.address, true);
    await knt.connect(manager).setKeeper(keeper.address, true);
    await knt.connect(manager).setKeeper(taxKeeper.address, true);

    const adminRole = await knt.roleOf(admin.address);
    const managerRole = await knt.roleOf(manager.address);
    const keeperRole = await knt.roleOf(keeper.address);
    const taxKeeperRole = await knt.roleOf(taxKeeper.address);
    assert.equal(adminRole.isAdminRole, true);
    assert.equal(managerRole.isManagerRole, true);
    assert.equal(keeperRole.isKeeperRole, true);
    assert.equal(taxKeeperRole.isKeeperRole, true);

    await knt.connect(manager).setReferralSignalAmount(ether("2"));
    await knt.connect(manager).setBurnQueueRewardBP(12_500);
    assert.equal(await knt.referralSignalAmount(), ether("2"));
    assert.equal(await knt.burnQueueRewardBP(), 12_500n);

    await knt.connect(keeper).keeperUpdateKntPrices(ether("1"), ether("0.9"));
    await knt.connect(keeper).keeperUpdateGlobalLpValue(ether("10000"));
    assert.equal(await knt.latestKntPriceUsdt(), ether("1"));
    assert.equal(await knt.globalLpValueUsdt(), ether("10000"));

    await assert.rejects(knt.connect(keeper).setReferralSignalAmount(ether("3")));
    await assert.rejects(knt.connect(manager).setEcosystemWallet(ecosystem.address));
    await knt.connect(admin).setEcosystemWallet(ecosystem.address);
    await knt.connect(admin).transferOwnership(user.address);
    assert.equal(await knt.owner(), user.address);

    await knt.connect(taxKeeper).recordBuy(user.address, ether("10"), ether("12"));
    const basis = await knt.costBasisOf(user.address);
    assert.equal(basis.boughtKnt, ether("10"));
    assert.equal(basis.spentUsdt, ether("12"));

    assert.equal(await knt.isAdminOrOwner(user.address), true);
    assert.equal(await knt.isAdminOrOwner(admin.address), true);
    assert.equal(await knt.isManagerOrAbove(manager.address), true);
    assert.equal(await knt.isKeeperOrAbove(keeper.address), true);
  });

  it("burns and queues KNT sent to the zero and dead addresses", async function () {
    const { knt, user } = await deployKnt();
    await knt.transfer(user.address, ether("20"));

    await knt.connect(user).transfer(ethers.ZeroAddress, ether("5"));
    await knt.connect(user).transfer(DEAD, ether("5"));

    assert.equal(await knt.burnQueueLength(), 2n);
    assert.equal(await knt.totalBurned(), ether("10"));
    assert.equal(await knt.balanceOf(DEAD), 0n);

    const first = await knt.burnQueue(0);
    const second = await knt.burnQueue(1);
    assert.equal(first.rewardAmount, ether("6"));
    assert.equal(second.rewardAmount, ether("6"));
  });

  it("emits burn and tax events used by accounting records", async function () {
    const { knt, user, pair } = await deployKntWithFoundationSwap();
    await knt.transfer(user.address, ether("320"));

    const burnQueuedEvents = await parsedEvents(knt, knt.connect(user).transfer(ethers.ZeroAddress, ether("10")));
    const burnQueued = burnQueuedEvents.find((event) => event.name === "BurnQueued");
    assert(burnQueued);
    assert.equal(burnQueued.args.user, user.address);
    assert.equal(burnQueued.args.index, 0n);
    assert.equal(burnQueued.args.burnedAmount, ether("10"));
    assert.equal(burnQueued.args.rewardAmount, ether("12"));

    await knt.fundRewardPool(ether("20"));
    const queuePaidEvents = await parsedEvents(knt, knt.processBurnQueue(1));
    const queuePaid = queuePaidEvents.find((event) => event.name === "QueuePaid");
    assert(queuePaid);
    assert.equal(queuePaid.args.user, user.address);
    assert.equal(queuePaid.args.index, 0n);
    assert.equal(queuePaid.args.rewardAmount, ether("12"));

    const burnRecord = await knt.burnQueue(0);
    assert.equal(burnRecord.account, user.address);
    assert.equal(burnRecord.burnedAmount, ether("10"));
    assert.equal(burnRecord.rewardAmount, ether("12"));
    assert.equal(burnRecord.paid, true);

    await knt.recordBuy(user.address, ether("100"), ether("100"));
    await knt.keeperUpdateKntPrices(ether("1.5"), ether("1.5"));
    const profitTaxEvents = await parsedEvents(knt, knt.connect(user).transfer(pair.address, ether("100")));
    const profitTaxRecord = profitTaxEvents.find((event) => event.name === "SellSettled");
    assert(profitTaxRecord);
    assert.equal(profitTaxRecord.args.account, user.address);
    assert.equal(profitTaxRecord.args.grossAmount, ether("100"));
    assert.equal(profitTaxRecord.args.netAmount, ether("85"));
    assert.equal(profitTaxRecord.args.sellTax, ether("5"));
    assert.equal(profitTaxRecord.args.profitTax, ether("10"));
    assert.equal(profitTaxRecord.args.dumpTax, 0n);

    await knt.keeperUpdateKntPrices(ether("0.875"), ether("1"));
    const dumpTaxEvents = await parsedEvents(knt, knt.connect(user).transfer(pair.address, ether("100")));
    const dumpTaxRecord = dumpTaxEvents.find((event) => event.name === "SellSettled");
    assert(dumpTaxRecord);
    assert.equal(dumpTaxRecord.args.account, user.address);
    assert.equal(dumpTaxRecord.args.grossAmount, ether("100"));
    assert.equal(dumpTaxRecord.args.netAmount, ether("82.5"));
    assert.equal(dumpTaxRecord.args.sellTax, ether("5"));
    assert.equal(dumpTaxRecord.args.profitTax, 0n);
    assert.equal(dumpTaxRecord.args.dumpTax, ether("12.5"));
  });

  it("settles Pancake AMM sells automatically with profit tax and cost-basis consumption", async function () {
    const { knt, user, pair, foundation, dex, ecosystem, labubu, router } = await deployKntWithFoundationSwap();
    await knt.transfer(user.address, ether("100"));
    await knt.recordBuy(user.address, ether("100"), ether("100"));
    await knt.keeperUpdateKntPrices(ethers.parseEther("1.5"), ethers.parseEther("1.5"));

    const foundationKntBefore = await knt.balanceOf(foundation.address);
    const foundationLabubuBefore = await labubu.balanceOf(foundation.address);
    const ecosystemLabubuBefore = await labubu.balanceOf(ecosystem.address);
    const routerKntBefore = await knt.balanceOf(await router.getAddress());
    const dexBefore = await knt.balanceOf(dex.address);
    const ecosystemBefore = await knt.balanceOf(ecosystem.address);
    const burnedBefore = await knt.totalBurned();
    const rewardPoolBefore = await knt.rewardPool();

    await knt.connect(user).transfer(pair.address, ether("100"));

    assert.equal(await knt.balanceOf(pair.address), ether("85"));
    assert.equal((await knt.balanceOf(foundation.address)) - foundationKntBefore, 0n);
    assert.equal((await labubu.balanceOf(foundation.address)) - foundationLabubuBefore, ether("3"));
    assert.equal((await labubu.balanceOf(ecosystem.address)) - ecosystemLabubuBefore, ether("5.000000000000000001"));
    assert.equal((await knt.balanceOf(await router.getAddress())) - routerKntBefore, ether("8.000000000000000001"));
    assert.equal((await knt.balanceOf(dex.address)) - dexBefore, 0n);
    assert.equal((await knt.balanceOf(ecosystem.address)) - ecosystemBefore, 0n);
    assert.equal((await knt.totalBurned()) - burnedBefore, ether("3.333333333333333333"));
    assert.equal((await knt.rewardPool()) - rewardPoolBefore, ether("3.666666666666666666"));

    assert.equal(await router.swapRecordCount(), 2n);
    const foundationSwap = await router.swapRecord(0);
    assert.equal(foundationSwap.amountIn, ether("3"));
    assert.equal(foundationSwap.tokenIn, await knt.getAddress());
    assert.equal(foundationSwap.tokenOut, await labubu.getAddress());
    assert.equal(foundationSwap.to, foundation.address);
    const ecosystemSwap = await router.swapRecord(1);
    assert.equal(ecosystemSwap.amountIn, ether("5.000000000000000001"));
    assert.equal(ecosystemSwap.tokenIn, await knt.getAddress());
    assert.equal(ecosystemSwap.tokenOut, await labubu.getAddress());
    assert.equal(ecosystemSwap.to, ecosystem.address);

    const basis = await knt.costBasisOf(user.address);
    assert.equal(basis.boughtKnt, 0n);
    assert.equal(basis.spentUsdt, 0n);
  });

  it("does not record AMM pair outgoing transfers as buys because Pancake LP removals are ambiguous", async function () {
    const { knt, user, pair } = await deployKnt();
    await knt.setAmmPair(pair.address, false);
    await knt.transfer(pair.address, ether("100"));
    await knt.setAmmPair(pair.address, true);
    await knt.keeperUpdateKntPrices(ether("2"), ether("2"));

    const events = await parsedEvents(knt, knt.connect(pair).transfer(user.address, ether("40")));

    assert.equal(events.some((event) => event.name === "BuyRecorded"), false);
    assert.equal(await knt.balanceOf(user.address), ether("40"));

    const basis = await knt.costBasisOf(user.address);
    assert.equal(basis.boughtKnt, 0n);
    assert.equal(basis.spentUsdt, 0n);
  });

  it("lets keepers burn user-wallet KNT without allowance for centralized LP-removal settlement", async function () {
    const { knt, user, keeper, pair } = await deployKnt();
    await knt.transfer(user.address, ether("50"));
    await knt.setKeeper(keeper.address, true);

    await assert.rejects(knt.connect(user).keeperBurnFrom(user.address, ether("1")));
    await assert.rejects(knt.connect(keeper).keeperBurnFrom(pair.address, ether("1")));

    const burnedBefore = await knt.totalBurned();
    const events = await parsedEvents(knt, knt.connect(keeper).keeperBurnFrom(user.address, ether("20")));
    const keeperBurned = events.find((event) => event.name === "KeeperBurned");

    assert(keeperBurned);
    assert.equal(keeperBurned.args.account, user.address);
    assert.equal(keeperBurned.args.operator, keeper.address);
    assert.equal(keeperBurned.args.amount, ether("20"));
    assert.equal(await knt.balanceOf(user.address), ether("30"));
    assert.equal((await knt.totalBurned()) - burnedBefore, ether("20"));
    assert.equal(await knt.burnQueueLength(), 0n);
  });

  it("lets keepers reduce accounted LP without contract-owned Pancake LP", async function () {
    const { knt, owner, user, keeper } = await deployKnt();
    await knt.setKeeper(keeper.address, true);
    await knt.adminImportDeposits(
      [user.address],
      [ether("1000")],
      [ether("1000")],
      [owner.address]
    );

    await assert.rejects(knt.connect(user).keeperReduceUserLp(user.address, ether("1"), ether("1")));

    const keeperEvents = await parsedEvents(knt, knt.connect(keeper).keeperReduceUserLp(user.address, ether("100"), ether("100")));
    const reduced = keeperEvents.find((event) => event.name === "KeeperLpReduced");
    assert(reduced);
    assert.equal(reduced.args.account, user.address);
    assert.equal(reduced.args.operator, keeper.address);
    assert.equal(reduced.args.lpAmount, ether("100"));
    assert.equal(reduced.args.lpValueUsdt, ether("100"));

    let userInfo = await knt.users(user.address);
    assert.equal(userInfo.depositAmount, ether("900"));
    assert.equal(userInfo.lpValueUsdt, ether("900"));
    assert.equal(userInfo.power, ether("5400"));
    assert.equal(await knt.totalLpValueUsdt(), ether("900"));
    assert.equal(await knt.totalPower(), ether("5400"));
    assert.equal(knt.interface.getFunction("withdrawDeposit"), null);
  });

  it("processes USDT deposits by buying LABUBU first, swapping half to KNT, then adding LABUBU/KNT LP", async function () {
    const { knt, usdt, labubu, router, user, dex, keeper } = await deployUsdtDepositHarness();
    const kntAddress = await knt.getAddress();
    const usdtAddress = await usdt.getAddress();
    const labubuAddress = await labubu.getAddress();
    const routerAddress = await router.getAddress();

    await usdt.mint(user.address, ether("1000"));
    await labubu.mint(routerAddress, ether("2000"));
    await knt.transfer(routerAddress, ether("100"));
    await knt.connect(dex).approve(kntAddress, ethers.MaxUint256);
    await router.setSwapOutput(usdtAddress, labubuAddress, ether("2000"));
    await router.setSwapOutput(labubuAddress, kntAddress, ether("100"));
    await router.setLiquidityToMint(ether("123"));

    await usdt.connect(user).transfer(kntAddress, ether("1000"));
    const block = await ethers.provider.getBlock("latest");
    const depositId = ethers.keccak256(ethers.toUtf8Bytes("deposit-1"));
    const tx = await knt.connect(keeper).processUsdtDeposit(
      user.address,
      ether("1000"),
      depositId,
      0,
      0,
      0,
      0,
      0,
      block.timestamp + 1200
    );
    const receipt = await tx.wait();

    assert.equal(await router.swapRecordCount(), 2n);
    const firstSwap = await router.swapRecord(0);
    assert.equal(firstSwap.amountIn, ether("1000"));
    assert.equal(firstSwap.tokenIn, usdtAddress);
    assert.equal(firstSwap.tokenOut, labubuAddress);
    assert.equal(firstSwap.viaToken, ethers.ZeroAddress);
    assert.equal(firstSwap.to, kntAddress);

    const secondSwap = await router.swapRecord(1);
    assert.equal(secondSwap.amountIn, ether("1000"));
    assert.equal(secondSwap.tokenIn, labubuAddress);
    assert.equal(secondSwap.tokenOut, kntAddress);
    assert.equal(secondSwap.viaToken, ethers.ZeroAddress);
    assert.equal(secondSwap.to, dex.address);

    assert.equal(await router.liquidityRecordCount(), 1n);
    const liquidity = await router.liquidityRecord(0);
    assert.equal(liquidity.tokenA, kntAddress);
    assert.equal(liquidity.tokenB, labubuAddress);
    assert.equal(liquidity.amountADesired, ether("100"));
    assert.equal(liquidity.amountBDesired, ether("1000"));
    assert.equal(liquidity.amountAUsed, ether("100"));
    assert.equal(liquidity.amountBUsed, ether("1000"));
    assert.equal(liquidity.to, user.address);

    const userInfo = await knt.users(user.address);
    assert.equal(userInfo.depositAmount, ether("123"));
    assert.equal(userInfo.lpValueUsdt, ether("1000"));
    assert.equal(userInfo.power, ether("6000"));
    assert.equal(await knt.processedUsdtDeposits(depositId), true);

    const events = receipt.logs
      .map((log) => {
        try {
          return knt.interface.parseLog(log);
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean);
    const deposited = events.find((event) => event.name === "UsdtDeposited");
    assert(deposited);
    assert.equal(deposited.args.usdtAmount, ether("1000"));
    assert.equal(deposited.args.kntUsed, ether("100"));
    assert.equal(deposited.args.labubuUsed, ether("1000"));
    assert.equal(deposited.args.lpAmount, ether("123"));
    assert.equal(deposited.args.lpValueUsdt, ether("1000"));

    const credited = events.find((event) => event.name === "UserLpCredited");
    assert(credited);
    assert.equal(credited.args.account, user.address);
    assert.equal(credited.args.lpAmount, ether("123"));
    assert.equal(credited.args.lpValueUsdt, ether("1000"));
  });

  it("uses configured Pancake proxy for USDT to LABUBU before adding LABUBU/KNT LP", async function () {
    const { knt, usdt, labubu, router, user, dex, keeper } = await deployUsdtDepositHarness();
    const kntAddress = await knt.getAddress();
    const usdtAddress = await usdt.getAddress();
    const labubuAddress = await labubu.getAddress();
    const routerAddress = await router.getAddress();

    const TestPancakeProxy = await ethers.getContractFactory("TestPancakeProxy");
    const pancakeProxy = await TestPancakeProxy.deploy(usdtAddress, labubuAddress);
    await pancakeProxy.waitForDeployment();
    const proxyAddress = await pancakeProxy.getAddress();

    await knt.setPancakeProxy(proxyAddress);
    assert.equal(await knt.pancakeProxy(), proxyAddress);

    await usdt.mint(user.address, ether("1000"));
    await labubu.mint(proxyAddress, ether("2000"));
    await knt.transfer(routerAddress, ether("100"));
    await knt.connect(dex).approve(kntAddress, ethers.MaxUint256);
    await pancakeProxy.setSwapByUsdtOutput(ether("2000"));
    await router.setSwapOutput(labubuAddress, kntAddress, ether("100"));
    await router.setLiquidityToMint(ether("123"));

    await usdt.connect(user).transfer(kntAddress, ether("1000"));
    const block = await ethers.provider.getBlock("latest");
    const depositId = ethers.keccak256(ethers.toUtf8Bytes("deposit-via-proxy"));
    await knt.connect(keeper).processUsdtDeposit(
      user.address,
      ether("1000"),
      depositId,
      0,
      ether("1900"),
      0,
      0,
      0,
      block.timestamp + 1200
    );

    assert.equal(await pancakeProxy.swapByUsdtRecordCount(), 1n);
    const proxySwap = await pancakeProxy.swapByUsdtRecord(0);
    assert.equal(proxySwap.amountIn, ether("1000"));
    assert.equal(proxySwap.amountOut, ether("2000"));
    assert.equal(proxySwap.amountOutMin, ether("1900"));
    assert.equal(proxySwap.to, kntAddress);

    assert.equal(await router.swapRecordCount(), 1n);
    const labubuToKntSwap = await router.swapRecord(0);
    assert.equal(labubuToKntSwap.amountIn, ether("1000"));
    assert.equal(labubuToKntSwap.tokenIn, labubuAddress);
    assert.equal(labubuToKntSwap.tokenOut, kntAddress);
    assert.equal(labubuToKntSwap.to, dex.address);

    assert.equal(await router.liquidityRecordCount(), 1n);
    const liquidity = await router.liquidityRecord(0);
    assert.equal(liquidity.tokenA, kntAddress);
    assert.equal(liquidity.tokenB, labubuAddress);
    assert.equal(liquidity.amountADesired, ether("100"));
    assert.equal(liquidity.amountBDesired, ether("1000"));
    assert.equal(liquidity.to, user.address);
  });

  it("upgradeable uses configured Pancake proxy for USDT to LABUBU deposits", async function () {
    const { knt, usdt, labubu, router, user, dex, keeper } = await deployUpgradeableUsdtDepositHarness();
    const kntAddress = await knt.getAddress();
    const usdtAddress = await usdt.getAddress();
    const labubuAddress = await labubu.getAddress();
    const routerAddress = await router.getAddress();

    const TestPancakeProxy = await ethers.getContractFactory("TestPancakeProxy");
    const pancakeProxy = await TestPancakeProxy.deploy(usdtAddress, labubuAddress);
    await pancakeProxy.waitForDeployment();
    const proxyAddress = await pancakeProxy.getAddress();

    await knt.setPancakeProxy(proxyAddress);
    assert.equal(await knt.pancakeProxy(), proxyAddress);

    await usdt.mint(user.address, ether("1000"));
    await labubu.mint(proxyAddress, ether("2000"));
    await knt.transfer(routerAddress, ether("100"));
    await knt.connect(dex).approve(kntAddress, ethers.MaxUint256);
    await pancakeProxy.setSwapByUsdtOutput(ether("2000"));
    await router.setSwapOutput(labubuAddress, kntAddress, ether("100"));
    await router.setLiquidityToMint(ether("123"));

    await usdt.connect(user).transfer(kntAddress, ether("1000"));
    const block = await ethers.provider.getBlock("latest");
    const depositId = ethers.keccak256(ethers.toUtf8Bytes("upgradeable-deposit-via-proxy"));
    await knt.connect(keeper).processUsdtDeposit(
      user.address,
      ether("1000"),
      depositId,
      0,
      ether("1900"),
      0,
      0,
      0,
      block.timestamp + 1200
    );

    assert.equal(await pancakeProxy.swapByUsdtRecordCount(), 1n);
    const proxySwap = await pancakeProxy.swapByUsdtRecord(0);
    assert.equal(proxySwap.amountIn, ether("1000"));
    assert.equal(proxySwap.amountOut, ether("2000"));
    assert.equal(proxySwap.amountOutMin, ether("1900"));
    assert.equal(proxySwap.to, kntAddress);

    assert.equal(await router.swapRecordCount(), 1n);
    const labubuToKntSwap = await router.swapRecord(0);
    assert.equal(labubuToKntSwap.amountIn, ether("1000"));
    assert.equal(labubuToKntSwap.tokenIn, labubuAddress);
    assert.equal(labubuToKntSwap.tokenOut, kntAddress);
    assert.equal(labubuToKntSwap.to, dex.address);
  });

  it("upgradeable falls back to Pancake router when no proxy is configured", async function () {
    const { knt, usdt, labubu, router, user, dex, keeper } = await deployUpgradeableUsdtDepositHarness();
    const kntAddress = await knt.getAddress();
    const usdtAddress = await usdt.getAddress();
    const labubuAddress = await labubu.getAddress();
    const routerAddress = await router.getAddress();

    assert.equal(await knt.pancakeProxy(), ethers.ZeroAddress);

    await usdt.mint(user.address, ether("1000"));
    await labubu.mint(routerAddress, ether("2000"));
    await knt.transfer(routerAddress, ether("100"));
    await knt.connect(dex).approve(kntAddress, ethers.MaxUint256);
    await router.setSwapOutput(usdtAddress, labubuAddress, ether("2000"));
    await router.setSwapOutput(labubuAddress, kntAddress, ether("100"));
    await router.setLiquidityToMint(ether("123"));

    await usdt.connect(user).transfer(kntAddress, ether("1000"));
    const block = await ethers.provider.getBlock("latest");
    const depositId = ethers.keccak256(ethers.toUtf8Bytes("upgradeable-deposit-router-fallback"));
    await knt.connect(keeper).processUsdtDeposit(
      user.address,
      ether("1000"),
      depositId,
      0,
      ether("1900"),
      0,
      0,
      0,
      block.timestamp + 1200
    );

    assert.equal(await router.swapRecordCount(), 2n);
    const usdtToLabubuSwap = await router.swapRecord(0);
    assert.equal(usdtToLabubuSwap.amountIn, ether("1000"));
    assert.equal(usdtToLabubuSwap.tokenIn, usdtAddress);
    assert.equal(usdtToLabubuSwap.tokenOut, labubuAddress);
    assert.equal(usdtToLabubuSwap.to, kntAddress);

    const labubuToKntSwap = await router.swapRecord(1);
    assert.equal(labubuToKntSwap.amountIn, ether("1000"));
    assert.equal(labubuToKntSwap.tokenIn, labubuAddress);
    assert.equal(labubuToKntSwap.tokenOut, kntAddress);
    assert.equal(labubuToKntSwap.to, dex.address);

    const userInfo = await knt.users(user.address);
    assert.equal(userInfo.depositAmount, ether("123"));
    assert.equal(await knt.processedUsdtDeposits(depositId), true);
  });

  it("upgradeable gives Admin the same ownership-transfer permission as Owner", async function () {
    const { knt, user, admin } = await deployUpgradeableUsdtDepositHarness();

    await knt.setAdmin(admin.address, true);
    await knt.connect(admin).transferOwnership(user.address);

    assert.equal(await knt.owner(), user.address);
    assert.equal(await knt.isAdminOrOwner(user.address), true);
    assert.equal(await knt.isAdminOrOwner(admin.address), true);
  });

  it("uses a configured intermediate token for the USDT to LABUBU swap", async function () {
    const { knt, usdt, labubu, wbnb, router, user, dex, keeper } = await deployUsdtDepositHarness();
    const kntAddress = await knt.getAddress();
    const usdtAddress = await usdt.getAddress();
    const labubuAddress = await labubu.getAddress();
    const wbnbAddress = await wbnb.getAddress();
    const routerAddress = await router.getAddress();

    await assert.rejects(knt.setLabubuSwapIntermediateToken(usdtAddress));
    await assert.rejects(knt.setLabubuSwapIntermediateToken(labubuAddress));
    await knt.setLabubuSwapIntermediateToken(wbnbAddress);
    assert.equal(await knt.labubuSwapIntermediateToken(), wbnbAddress);

    await usdt.mint(user.address, ether("1000"));
    await labubu.mint(routerAddress, ether("2000"));
    await knt.transfer(routerAddress, ether("100"));
    await knt.connect(dex).approve(kntAddress, ethers.MaxUint256);
    await router.setSwapOutput(usdtAddress, labubuAddress, ether("2000"));
    await router.setSwapOutput(labubuAddress, kntAddress, ether("100"));
    await router.setLiquidityToMint(ether("123"));

    await usdt.connect(user).transfer(kntAddress, ether("1000"));
    const block = await ethers.provider.getBlock("latest");
    const depositId = ethers.keccak256(ethers.toUtf8Bytes("deposit-with-hop"));
    await knt.connect(keeper).processUsdtDeposit(
      user.address,
      ether("1000"),
      depositId,
      0,
      0,
      0,
      0,
      0,
      block.timestamp + 1200
    );

    const firstSwap = await router.swapRecord(0);
    assert.equal(firstSwap.tokenIn, usdtAddress);
    assert.equal(firstSwap.tokenOut, labubuAddress);
    assert.equal(firstSwap.viaToken, wbnbAddress);
  });

  it("time travels across one day for rewards, compounding, and migration release", async function () {
    const { knt, owner } = await deployKnt();
    const allSigners = await ethers.getSigners();
    const [a, b, c, d, e] = allSigners.slice(10, 15);
    const accounts = [a, b, c, d, e];
    const accountAddresses = accounts.map((account) => account.address);

    await knt.fundRewardPool(ether("1000000"));
    await knt.adminImportDeposits(
      accountAddresses,
      accountAddresses.map(() => ether("1000")),
      accountAddresses.map(() => ether("1000")),
      [owner.address, a.address, a.address, a.address, a.address]
    );

    const aUserBefore = await knt.users(a.address);
    const bUserBefore = await knt.users(b.address);
    assert.equal(aUserBefore.isNode, true);
    assert.equal(aUserBefore.directLpValueUsdt, ether("4000"));
    assert.equal(bUserBefore.power, ether("6000"));

    const boostedMigrationId = await knt.nextMigrationId();
    await knt.mintMigration(a.address, ether("1000"));
    const baseMigrationId = await knt.nextMigrationId();
    await knt.mintMigration(b.address, ether("1000"));

    await network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await network.provider.send("evm_mine");

    assert.equal(await knt.currentDay(), 1n);
    assert.equal(await knt.migrationClaimable(boostedMigrationId), ether("1"));
    assert.equal(await knt.migrationClaimable(baseMigrationId), ether("1"));

    const balancesBefore = Object.fromEntries(
      await Promise.all(accountAddresses.map(async (address) => [address, await knt.balanceOf(address)]))
    );

    const rewardTx = await knt.keeperDistributeRewards([b.address, c.address, d.address, e.address, a.address]);
    const rewardReceipt = await rewardTx.wait();
    const rewardEvents = rewardReceipt.logs
      .map((log) => {
        try {
          return knt.interface.parseLog(log);
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean);
    assert(rewardEvents.some((event) => event.name === "StaticRewardAccrued"));
    assert(rewardEvents.some((event) => event.name === "DynamicRewardAccrued" && event.args.source === b.address && event.args.receiver === a.address));

    const aUserAfter = await knt.users(a.address);
    const bUserAfter = await knt.users(b.address);
    assert.equal(aUserAfter.power, ether("6072"));
    assert.equal(bUserAfter.power, ether("6072"));

    assert.equal((await knt.balanceOf(b.address)) - balancesBefore[b.address], ether("157.872"));
    assert.equal((await knt.balanceOf(c.address)) - balancesBefore[c.address], ether("157.872"));
    assert.equal((await knt.balanceOf(d.address)) - balancesBefore[d.address], ether("157.872"));
    assert.equal((await knt.balanceOf(e.address)) - balancesBefore[e.address], ether("157.872"));
    assert.equal((await knt.balanceOf(a.address)) - balancesBefore[a.address], ether("440.1696"));

    const aMigrationBefore = await knt.balanceOf(a.address);
    const bMigrationBefore = await knt.balanceOf(b.address);
    await assert.rejects(knt.connect(b).keeperClaimMigrations([baseMigrationId]));
    const migrationReceipt = await (await knt.keeperClaimMigrations([boostedMigrationId, baseMigrationId, 999999n])).wait();
    const migrationEvents = migrationReceipt.logs
      .map((log) => {
        try {
          return knt.interface.parseLog(log);
        } catch (_error) {
          return null;
        }
      })
      .filter((event) => event?.name === "MigrationClaimed");

    assert.equal((await knt.balanceOf(a.address)) - aMigrationBefore, ether("1"));
    assert.equal((await knt.balanceOf(b.address)) - bMigrationBefore, ether("1"));
    assert.equal(migrationEvents.length, 2);
    assert.equal(migrationEvents[0].args.account, a.address);
    assert.equal(migrationEvents[1].args.account, b.address);
    assert.equal(await knt.migrationClaimable(boostedMigrationId), 0n);
    assert.equal(await knt.migrationClaimable(baseMigrationId), 0n);
  });

  it("splits node rewards by direct LP node units", async function () {
    const { knt, owner } = await deployKnt();
    const allSigners = await ethers.getSigners();
    const [nodeA, nodeB, ...directs] = allSigners.slice(1, 12);
    const nodeADirects = directs.slice(0, 6);
    const nodeBDirects = directs.slice(6, 9);
    const accounts = [nodeA, nodeB, ...nodeADirects, ...nodeBDirects];

    await knt.fundRewardPool(ether("1000000"));
    await knt.adminImportDeposits(
      accounts.map((account) => account.address),
      accounts.map(() => ether("1000")),
      accounts.map(() => ether("1000")),
      [
        owner.address,
        owner.address,
        ...nodeADirects.map(() => nodeA.address),
        ...nodeBDirects.map(() => nodeB.address),
      ]
    );

    const nodeAInfoBefore = await knt.users(nodeA.address);
    const nodeBInfoBefore = await knt.users(nodeB.address);
    assert.equal(nodeAInfoBefore.isNode, true);
    assert.equal(nodeBInfoBefore.isNode, true);
    assert.equal(nodeAInfoBefore.directLpValueUsdt, ether("6000"));
    assert.equal(nodeBInfoBefore.directLpValueUsdt, ether("3000"));
    assert.equal(await knt.nodeCount(), 3n);
    await assert.rejects(knt.connect(nodeA).keeperSyncNodeUnits([nodeA.address]));
    await knt.keeperSyncNodeUnits(accounts.map((account) => account.address));
    assert.equal(await knt.nodeCount(), 3n);

    await network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await network.provider.send("evm_mine");
    await knt.keeperDistributeRewards([nodeA.address, nodeB.address]);

    const nodeAInfoAfter = await knt.users(nodeA.address);
    const nodeBInfoAfter = await knt.users(nodeB.address);
    assert(nodeBInfoAfter.totalNodeReward > 0n);
    assert.equal(nodeAInfoAfter.totalNodeReward, nodeBInfoAfter.totalNodeReward * 2n);
    assert.equal(nodeAInfoAfter.totalNodeReward, (await knt.accNodeRewardPerNode()) * 2n);
    assert.equal(nodeBInfoAfter.totalNodeReward, await knt.accNodeRewardPerNode());
  });

  it("imports legacy power without counting legacy direct LP toward migration acceleration", async function () {
    const { knt, owner } = await deployKnt();
    const allSigners = await ethers.getSigners();
    const [root, legacyHolder, legacyDirect, newDirect, dayZeroDirect] = allSigners.slice(10, 15);

    await knt.adminImportDeposits(
      [legacyHolder.address, legacyDirect.address],
      [packLegacyAmount(ether("1000"), ether("12345")), packLegacyAmount(ether("3000"), ether("23456"))],
      [ether("1000"), ether("3000")],
      [root.address, legacyHolder.address]
    );

    const holderAfterLegacyImport = await knt.users(legacyHolder.address);
    const directAfterLegacyImport = await knt.users(legacyDirect.address);
    assert.equal(holderAfterLegacyImport.power, ether("12345"));
    assert.equal(directAfterLegacyImport.power, ether("23456"));
    assert.equal(holderAfterLegacyImport.directLpValueUsdt, ether("3000"));
    assert.equal(await knt.directNewLpValueUsdtOf(legacyHolder.address), 0n);

    const migrationId = await knt.nextMigrationId();
    await knt.mintMigration(legacyHolder.address, ether("1000"));
    await network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await network.provider.send("evm_mine");
    assert.equal(await knt.migrationClaimable(migrationId), ether("1"));

    await knt.processAssistedUsdtDeposit(newDirect.address, legacyHolder.address, ether("3000"), ether("333"));
    const holderAfterNewDirect = await knt.users(legacyHolder.address);
    const newDirectAfterDeposit = await knt.users(newDirect.address);
    assert.equal(await knt.directNewLpValueUsdtOf(legacyHolder.address), ether("3000"));
    assert.equal(newDirectAfterDeposit.power, ether("18000"));

    await network.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await network.provider.send("evm_mine");
    assert.equal(await knt.migrationClaimable(migrationId), ether("6"));
  });

  it("upgradeable locks imported legacy LP while allowing new LP reductions and migration acceleration", async function () {
    const { knt, usdt, labubu, router, dex, keeper } = await deployUpgradeableUsdtDepositHarness();
    const allSigners = await ethers.getSigners();
    const [root, legacyHolder, legacyDirect, newDirect, dayZeroDirect] = allSigners.slice(10, 15);
    const kntAddress = await knt.getAddress();
    const usdtAddress = await usdt.getAddress();
    const labubuAddress = await labubu.getAddress();
    const routerAddress = await router.getAddress();

    await knt.adminImportDeposits(
      [legacyHolder.address, legacyDirect.address],
      [packLegacyAmount(ether("1000"), ether("12345")), packLegacyAmount(ether("3000"), ether("23456"))],
      [ether("1000"), ether("3000")],
      [root.address, legacyHolder.address]
    );

    const holderAfterLegacyImport = await knt.users(legacyHolder.address);
    assert.equal(holderAfterLegacyImport.power, ether("12345"));
    assert.equal(holderAfterLegacyImport.directLpValueUsdt, ether("3000"));
    assert.equal(await knt.directNewLpValueUsdtOf(legacyHolder.address), 0n);
    await assert.rejects(knt.connect(keeper).keeperReduceUserLp(legacyHolder.address, ether("1"), ether("1")));

    const migrationId = await knt.nextMigrationId();
    await knt.mintMigration(legacyHolder.address, ether("1000"));
    const dayZeroMigrationId = await knt.nextMigrationId();
    await knt.mintMigration(root.address, ether("1000"));
    await knt.connect(dayZeroDirect).bindReferrer(root.address);
    await usdt.mint(dayZeroDirect.address, ether("3000"));
    await labubu.mint(routerAddress, ether("6000"));
    await knt.transfer(routerAddress, ether("333"));
    await knt.connect(dex).approve(kntAddress, ethers.MaxUint256);
    await router.setSwapOutput(usdtAddress, labubuAddress, ether("6000"));
    await router.setSwapOutput(labubuAddress, kntAddress, ether("333"));
    await router.setLiquidityToMint(ether("333"));
    await usdt.connect(dayZeroDirect).transfer(kntAddress, ether("3000"));
    let block = await ethers.provider.getBlock("latest");
    await knt.connect(keeper).processUsdtDeposit(
      dayZeroDirect.address,
      ether("3000"),
      ethers.keccak256(ethers.toUtf8Bytes("day-zero-direct-lp")),
      0,
      0,
      0,
      0,
      0,
      block.timestamp + 1200
    );
    await network.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
    await network.provider.send("evm_mine");
    assert.equal(await knt.migrationClaimable(migrationId), ether("1"));
    assert.equal(await knt.migrationClaimable(dayZeroMigrationId), ether("5"));

    await knt.connect(newDirect).bindReferrer(legacyHolder.address);
    await usdt.mint(newDirect.address, ether("3000"));
    await labubu.mint(routerAddress, ether("6000"));
    await knt.transfer(routerAddress, ether("333"));
    await knt.connect(dex).approve(kntAddress, ethers.MaxUint256);
    await router.setSwapOutput(usdtAddress, labubuAddress, ether("6000"));
    await router.setSwapOutput(labubuAddress, kntAddress, ether("333"));
    await router.setLiquidityToMint(ether("333"));
    await usdt.connect(newDirect).transfer(kntAddress, ether("3000"));
    block = await ethers.provider.getBlock("latest");
    await knt.connect(keeper).processUsdtDeposit(
      newDirect.address,
      ether("3000"),
      ethers.keccak256(ethers.toUtf8Bytes("new-direct-lp")),
      0,
      0,
      0,
      0,
      0,
      block.timestamp + 1200
    );
    assert.equal(await knt.directNewLpValueUsdtOf(legacyHolder.address), ether("3000"));
    const newDirectAfterDeposit = await knt.users(newDirect.address);
    assert.equal(newDirectAfterDeposit.power, ether("18000"));

    await knt.connect(keeper).keeperReduceUserLp(newDirect.address, ether("111"), ether("1000"));
    const newDirectAfterReduction = await knt.users(newDirect.address);
    assert.equal(newDirectAfterReduction.lpValueUsdt, ether("2000"));

    await network.provider.send("evm_increaseTime", [24 * 60 * 60]);
    await network.provider.send("evm_mine");
    assert.equal(await knt.migrationClaimable(migrationId), ether("6"));
  });

});
