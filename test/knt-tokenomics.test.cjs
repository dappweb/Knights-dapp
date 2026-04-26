const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("KNT tokenomics alignment", function () {
  async function deployFixture() {
    const [owner, alice, bob, foundation, dex] = await ethers.getSigners();

    const KNT = await ethers.getContractFactory("KNT");
    const knt = await KNT.deploy(owner.address);
    await knt.waitForDeployment();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const lp = await MockERC20.deploy("KNT-LABUBU LP Test Token", "KNT-LABUBU-LP", 18);
    await lp.waitForDeployment();

    const KNTLpMining = await ethers.getContractFactory("KNTLpMining");
    const mining = await KNTLpMining.deploy(await knt.getAddress(), await lp.getAddress(), owner.address);
    await mining.waitForDeployment();

    const KNTBurnQueue = await ethers.getContractFactory("KNTBurnQueue");
    const burnQueue = await KNTBurnQueue.deploy(await knt.getAddress(), owner.address);
    await burnQueue.waitForDeployment();

    const KNTTaxManager = await ethers.getContractFactory("KNTTaxManager");
    const taxManager = await KNTTaxManager.deploy(
      await knt.getAddress(),
      foundation.address,
      await burnQueue.getAddress(),
      dex.address,
      owner.address
    );
    await taxManager.waitForDeployment();

    const KNTMigrationNFT = await ethers.getContractFactory("KNTMigrationNFT");
    const migration = await KNTMigrationNFT.deploy(await knt.getAddress(), await mining.getAddress(), owner.address);
    await migration.waitForDeployment();

    for (const account of [owner, alice, bob]) {
      await lp.mint(account.address, ethers.parseEther("10000"));
      await lp.connect(account).approve(await mining.getAddress(), ethers.MaxUint256);
    }

    await knt.approve(await mining.getAddress(), ethers.parseEther("1000000"));
    await mining.fundRewards(ethers.parseEther("1000000"));

    return { owner, alice, bob, foundation, dex, knt, lp, mining, burnQueue, taxManager, migration };
  }

  it("deploys KNT with 210 million supply and 3 USDT initial emission model", async function () {
    const { owner, knt, mining } = await deployFixture();

    expect(await knt.name()).to.equal("Knight Token");
    expect(await knt.symbol()).to.equal("KNT");
    expect(await knt.totalSupply()).to.equal(ethers.parseEther("210000000"));
    expect(await knt.balanceOf(owner.address)).to.equal(ethers.parseEther("209000000"));
    expect(await mining.currentDailyEmission()).to.equal(ethers.parseEther("1560"));
  });

  it("uses LP value for mining, node qualification, and 50/40/10 daily allocation", async function () {
    const { owner, alice, mining } = await deployFixture();

    await mining.connect(owner).register(ethers.ZeroAddress);
    await mining.connect(owner).depositLp(
      ethers.parseEther("1000"),
      ethers.parseEther("1000"),
      ethers.ZeroAddress
    );
    await mining.connect(alice).depositLp(
      ethers.parseEther("3000"),
      ethers.parseEther("3000"),
      owner.address
    );

    const ownerInfoBefore = await mining.users(owner.address);
    expect(ownerInfoBefore.isNode).to.equal(true);
    expect(await mining.nodeCount()).to.equal(1n);
    expect(await mining.currentDailyEmission()).to.equal(ethers.parseEther("1560"));

    await time.increase(24 * 60 * 60 + 1);
    await mining.connect(owner).claim();

    const ownerInfoAfter = await mining.users(owner.address);
    expect(ownerInfoAfter.totalStaticReward).to.be.gt(0n);
    expect(ownerInfoAfter.totalNodeReward).to.equal(ethers.parseEther("156"));
  });

  it("caps emission growth at 3360 KNT/day and applies 50-day reductions", async function () {
    const { owner, mining } = await deployFixture();

    await mining.connect(owner).register(ethers.ZeroAddress);
    await mining.connect(owner).depositLp(
      ethers.parseEther("1000"),
      ethers.parseEther("500000"),
      ethers.ZeroAddress
    );

    expect(await mining.currentDailyEmission()).to.equal(ethers.parseEther("3360"));
    expect(await mining.dailyEmissionForDay(50)).to.equal(ethers.parseEther("2688"));
  });

  it("queues active KNT burns for 1.2x payout", async function () {
    const { owner, alice, knt, burnQueue } = await deployFixture();

    await knt.transfer(alice.address, ethers.parseEther("100"));
    await knt.connect(alice).approve(await burnQueue.getAddress(), ethers.parseEther("10"));
    await burnQueue.connect(alice).burnAndQueue(ethers.parseEther("10"));

    await knt.approve(await burnQueue.getAddress(), ethers.parseEther("12"));
    await burnQueue.fundRewardPool(ethers.parseEther("12"));
    await burnQueue.processNext(1);

    expect(await knt.balanceOf(alice.address)).to.equal(ethers.parseEther("102"));
    expect(await knt.totalBurned()).to.equal(ethers.parseEther("10"));
  });

  it("applies KNT sell, profit, and dump tax buckets", async function () {
    const { alice, foundation, dex, knt, burnQueue, taxManager } = await deployFixture();

    await knt.transfer(alice.address, ethers.parseEther("1000"));
    await taxManager.recordBuy(alice.address, ethers.parseEther("1000"), ethers.parseEther("1000"));
    await knt.connect(alice).approve(await taxManager.getAddress(), ethers.parseEther("100"));

    await taxManager.connect(alice).settleSell(
      ethers.parseEther("100"),
      ethers.parseEther("200"),
      ethers.parseEther("0.8"),
      ethers.parseEther("1")
    );

    expect(await knt.balanceOf(foundation.address)).to.be.gt(0n);
    expect(await knt.balanceOf(await burnQueue.getAddress())).to.be.gt(0n);
    expect(await knt.balanceOf(dex.address)).to.be.lt(ethers.parseEther("100"));
    expect(await knt.totalBurned()).to.be.gt(0n);
  });

  it("releases migrated spot balances through NFT positions", async function () {
    const { owner, alice, knt, migration } = await deployFixture();

    await knt.approve(await migration.getAddress(), ethers.parseEther("1000"));
    await migration.fund(ethers.parseEther("1000"));
    await migration.mintMigration(alice.address, ethers.parseEther("1000"));

    await time.increase(24 * 60 * 60 + 1);
    await migration.connect(alice).claim(1);

    expect(await knt.balanceOf(alice.address)).to.equal(ethers.parseEther("1"));
    expect(await migration.ownerOf(1)).to.equal(alice.address);
  });
});
