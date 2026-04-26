const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

async function deployProtocolFixture() {
  const [owner, foundation, user, alice, bob] = await ethers.getSigners();

  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const usdt = await MockUSDT.deploy();
  await usdt.waitForDeployment();

  const SEER = await ethers.getContractFactory("SEER");
  const seer = await upgrades.deployProxy(SEER, [foundation.address, foundation.address], {
    initializer: "initialize",
    unsafeAllow: ["constructor", "state-variable-assignment"],
  });
  await seer.waitForDeployment();

  const MinerNode = await ethers.getContractFactory("MinerNode");
  const minerNode = await upgrades.deployProxy(MinerNode, [await seer.getAddress()], {
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await minerNode.waitForDeployment();

  await seer.connect(owner).setNodeRewardPool(await minerNode.getAddress());

  const LibSeerAdmin = await ethers.getContractFactory("LibSeerAdmin");
  const libSeerAdmin = await LibSeerAdmin.deploy();
  await libSeerAdmin.waitForDeployment();

  const LibSeerClaim = await ethers.getContractFactory("LibSeerClaim");
  const libSeerClaim = await LibSeerClaim.deploy();
  await libSeerClaim.waitForDeployment();

  const SeerProtocol = await ethers.getContractFactory("SeerProtocol", {
    libraries: {
      LibSeerAdmin: await libSeerAdmin.getAddress(),
      LibSeerClaim: await libSeerClaim.getAddress(),
    },
  });
  const protocol = await upgrades.deployProxy(
    SeerProtocol,
    [await usdt.getAddress(), await seer.getAddress(), foundation.address],
    {
      initializer: "initialize",
      unsafeAllow: ["constructor", "external-library-linking", "missing-initializer-call", "missing-initializer"],
      unsafeAllowLinkedLibraries: true,
    }
  );
  await protocol.waitForDeployment();

  await protocol.connect(owner).setMinerNode(await minerNode.getAddress());
  await minerNode.connect(owner).setProtocolAddress(await protocol.getAddress());

  const miningPoolAmount = ethers.parseEther("1000000");
  await seer.connect(owner).approve(await protocol.getAddress(), miningPoolAmount);
  await protocol.connect(owner).fundMiningPool(miningPoolAmount);

  const nodeRightsPoolAmount = ethers.parseEther("100000");
  await seer.connect(owner).approve(await minerNode.getAddress(), nodeRightsPoolAmount);
  await minerNode.connect(owner).fundNodeRightsPool(nodeRightsPoolAmount);

  return { owner, foundation, user, alice, bob, usdt, seer, protocol, minerNode };
}

describe("SEER Protocol Business Rules", function () {
  it("counts gifted miner value into personal and upline team performance", async function () {
    const { owner, user, usdt, protocol } = await loadFixture(deployProtocolFixture);

    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(user).register(owner.address);

    const v1Cost = (await protocol.getMinerTierInfo(1))[0];
    await usdt.mint(user.address, v1Cost);
    await usdt.connect(user).approve(await protocol.getAddress(), v1Cost);
    await protocol.connect(user).purchaseMiner(1);

    const userInfo = await protocol.getUserInfo(user.address);
    const ownerInfo = await protocol.getUserInfo(owner.address);

    expect(userInfo[3]).to.equal(v1Cost * 2n); // personal performance includes paid + gifted miner value
    expect(userInfo[4]).to.equal(0n);          // buyer teamVolumeUsdt 不应包含本人购买
    expect(ownerInfo[4]).to.equal(v1Cost * 2n); // upline team performance includes paid + gifted miner value
  });

  it("keeps team volume self-excluded while branch volume includes direct personal performance", async function () {
    const { owner, user, alice, usdt, protocol } = await loadFixture(deployProtocolFixture);

    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(user).register(owner.address);
    await protocol.connect(alice).register(user.address);

    const v1Cost = (await protocol.getMinerTierInfo(1))[0];
    await usdt.mint(user.address, v1Cost);
    await usdt.mint(alice.address, v1Cost);
    await usdt.connect(user).approve(await protocol.getAddress(), v1Cost);
    await usdt.connect(alice).approve(await protocol.getAddress(), v1Cost);

    await protocol.connect(user).purchaseMiner(1);
    await protocol.connect(alice).purchaseMiner(1);

    const userInfo = await protocol.getUserInfo(user.address);
    const ownerInfo = await protocol.getUserInfo(owner.address);
    const userBranchVolume = await protocol.getBranchVolume(owner.address, user.address);

    expect(userInfo.totalInvestedUsdt).to.equal(v1Cost * 2n);
    expect(userInfo.teamVolumeUsdt).to.equal(v1Cost * 2n);
    expect(ownerInfo.teamVolumeUsdt).to.equal(v1Cost * 4n);
    expect(userBranchVolume).to.equal(v1Cost * 4n);
  });

  it("uses small-area volume instead of total team volume for settlement level", async function () {
    const { owner, user, alice, bob, usdt, protocol } = await loadFixture(deployProtocolFixture);

    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(user).register(owner.address);
    await protocol.connect(alice).register(owner.address);
    await protocol.connect(bob).register(owner.address);

    await protocol.connect(owner).switchToMinerPhase();

    const v3Cost = (await protocol.getMinerTierInfo(3))[0];
    const userBudget = v3Cost * 10n;
    const aliceBudget = v3Cost;
    const bobBudget = v3Cost * 2n;

    await usdt.mint(user.address, userBudget);
    await usdt.mint(alice.address, aliceBudget);
    await usdt.mint(bob.address, bobBudget);

    await usdt.connect(user).approve(await protocol.getAddress(), userBudget);
    await usdt.connect(alice).approve(await protocol.getAddress(), aliceBudget);
    await usdt.connect(bob).approve(await protocol.getAddress(), bobBudget);

    for (let i = 0; i < 10; i++) {
      await protocol.connect(user).purchaseMiner(3);
    }
    await protocol.connect(alice).purchaseMiner(3);
    await protocol.connect(bob).purchaseMiner(3);
    await protocol.connect(bob).purchaseMiner(3);

    const ownerInfo = await protocol.getUserInfo(owner.address);
    const smallAreaVolume = await protocol.getSmallAreaVolume(owner.address);
    const userBranchVolume = await protocol.getBranchVolume(owner.address, user.address);
    const aliceBranchVolume = await protocol.getBranchVolume(owner.address, alice.address);
    const bobBranchVolume = await protocol.getBranchVolume(owner.address, bob.address);

    // teamVolumeUsdt is still the upline's downline-only team performance.
    expect(ownerInfo.teamVolumeUsdt).to.equal(v3Cost * 13n);
    // Branch volume is personal performance + downline team performance.
    expect(userBranchVolume).to.equal(v3Cost * 10n);
    expect(aliceBranchVolume).to.equal(v3Cost);
    expect(bobBranchVolume).to.equal(v3Cost * 2n);
    // Small-area volume = (10 + 1 + 2 - 10) * V3 cost = 30,000U.
    expect(smallAreaVolume).to.equal(v3Cost * 3n);
    expect(ownerInfo.teamLevel).to.equal(1n);
  });

  it("accumulates team volume across the full downline without an 8-level cap", async function () {
    const { protocol, usdt } = await loadFixture(deployProtocolFixture);
    const signers = await ethers.getSigners();
    const chain = signers.slice(0, 10);

    await protocol.connect(chain[0]).register(ethers.ZeroAddress);
    for (let i = 1; i < chain.length; i++) {
      await protocol.connect(chain[i]).register(chain[i - 1].address);
    }

    await protocol.connect(chain[0]).switchToMinerPhase();

    const v1Cost = (await protocol.getMinerTierInfo(1))[0];
    const leaf = chain[chain.length - 1];
    await usdt.mint(leaf.address, v1Cost);
    await usdt.connect(leaf).approve(await protocol.getAddress(), v1Cost);
    await protocol.connect(leaf).purchaseMiner(1);

    const rootInfo = await protocol.getUserInfo(chain[0].address);
    const deepAncestorInfo = await protocol.getUserInfo(chain[1].address);
    const buyerInfo = await protocol.getUserInfo(leaf.address);

    expect(rootInfo.teamVolumeUsdt).to.equal(v1Cost);
    expect(deepAncestorInfo.teamVolumeUsdt).to.equal(v1Cost);
    expect(buyerInfo.teamVolumeUsdt).to.equal(0n);
  });

  it("auto-gifts same-tier miner when buying V1", async function () {
    const { owner, usdt, protocol } = await deployProtocolFixture();

    await protocol.connect(owner).register(ethers.ZeroAddress);

    const v1Cost = (await protocol.getMinerTierInfo(1))[0];
    await usdt.mint(owner.address, v1Cost);
    await usdt.connect(owner).approve(await protocol.getAddress(), v1Cost);
    await protocol.connect(owner).purchaseMiner(1);

    const minerCount = await protocol.getUserMinerCount(owner.address);
    expect(minerCount).to.equal(2n);

    const firstMiner = await protocol.getUserMiner(owner.address, 0);
    const giftMiner = await protocol.getUserMiner(owner.address, 1);

    expect(firstMiner.isAutoGifted).to.equal(false);
    expect(firstMiner.costUsdt).to.equal(v1Cost);
    expect(giftMiner.isAutoGifted).to.equal(true);
    expect(giftMiner.costUsdt).to.equal(0n);
    expect(giftMiner.tier).to.equal(1n);

    const ownerInfo = await protocol.getUserInfo(owner.address);
    expect(ownerInfo.totalInvestedUsdt).to.equal(v1Cost * 2n);
  });

  it("enforces V2 purchase limit per address during NODE_PHASE", async function () {
    const { owner, user, usdt, protocol } = await loadFixture(deployProtocolFixture);

    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(user).register(owner.address);

    const v2Cost = (await protocol.getMinerTierInfo(2))[0];
    await usdt.mint(user.address, v2Cost * 2n);

    await usdt.connect(user).approve(await protocol.getAddress(), v2Cost * 2n);
    await protocol.connect(user).purchaseMiner(2);

    await expect(protocol.connect(user).purchaseMiner(2))
      .to.be.revertedWithCustomError(protocol, "MinerPurchaseLimitExceeded")
      .withArgs(2n, 1n, 1n);
  });

  it("deactivates and reactivates node miners with node lot state kept in sync", async function () {
    const { owner, user, usdt, protocol, minerNode } = await loadFixture(deployProtocolFixture);

    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(user).register(owner.address);

    const v1Cost = (await protocol.getMinerTierInfo(1))[0];
    await usdt.mint(user.address, v1Cost);
    await usdt.connect(user).approve(await protocol.getAddress(), v1Cost);
    await protocol.connect(user).purchaseMiner(1);

    const lotIdsBefore = await minerNode.getUserNodeLotIds(user.address);
    expect(lotIdsBefore.length).to.equal(1);
    const initialLotId = lotIdsBefore[0];

    await time.increase(90 * 24 * 60 * 60 + 1);

    await expect(protocol.connect(owner).deactivateMiner(user.address, 0))
      .to.emit(protocol, "AdminMinerDeactivated");

    const deactivatedMiner = await protocol.getUserMiner(user.address, 0);
    expect(deactivatedMiner.active).to.equal(false);
    expect(await protocol.minerNodeLotIds(user.address, 0)).to.equal(0n);

    const deactivatedLot = await minerNode.getNodeLotDetailsForAdmin(initialLotId);
    expect(deactivatedLot[8]).to.equal(false);

    const nodeInfoAfterDeactivate = await minerNode.nodes(user.address);
    expect(nodeInfoAfterDeactivate.isNode).to.equal(false);

    await expect(protocol.connect(owner).activateMiner(user.address, 0))
      .to.emit(protocol, "AdminMinerActivated");

    const reactivatedMiner = await protocol.getUserMiner(user.address, 0);
    expect(reactivatedMiner.active).to.equal(true);

    const newLotId = await protocol.minerNodeLotIds(user.address, 0);
    expect(newLotId).to.not.equal(0n);
    expect(newLotId).to.not.equal(initialLotId);

    const nodeInfoAfterActivate = await minerNode.nodes(user.address);
    expect(nodeInfoAfterActivate.isNode).to.equal(true);
  });

  it("syncs node tier edits to weight, rights, and address-level node state", async function () {
    const { owner, user, usdt, protocol, minerNode } = await loadFixture(deployProtocolFixture);

    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(user).register(owner.address);

    const v1Cost = (await protocol.getMinerTierInfo(1))[0];
    await usdt.mint(user.address, v1Cost);
    await usdt.connect(user).approve(await protocol.getAddress(), v1Cost);
    await protocol.connect(user).purchaseMiner(1);

    const lotId = await protocol.minerNodeLotIds(user.address, 0);
    expect(lotId).to.not.equal(0n);

    await protocol.connect(owner).editNodeTier(user.address, lotId, 3);

    const lotDetails = await minerNode.getNodeLotDetailsForAdmin(lotId);
    expect(lotDetails[1]).to.equal(3n);
    expect(lotDetails[2]).to.equal(10n);
    expect(lotDetails[4]).to.equal(ethers.parseEther("20000"));

    const rightsInfo = await minerNode.getNodeRightsInfo(user.address);
    expect(rightsInfo.currentTier).to.equal(3n);
    expect(rightsInfo.allocated).to.equal(ethers.parseEther("20000"));

    const nodeInfo = await minerNode.nodes(user.address);
    expect(nodeInfo.weight).to.equal(10n);
  });

  it("rejects admin vault edits that would violate release invariants", async function () {
    const { owner, user, usdt, protocol } = await loadFixture(deployProtocolFixture);

    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(user).register(owner.address);

    const v1Cost = (await protocol.getMinerTierInfo(1))[0];
    await usdt.mint(user.address, v1Cost);
    await usdt.connect(user).approve(await protocol.getAddress(), v1Cost);
    await protocol.connect(user).purchaseMiner(1);

    await expect(
      protocol.connect(owner).editMinerVaultA(user.address, 0, v1Cost + 1n)
    ).to.be.reverted;

    const tierInfo = await protocol.getMinerTierInfo(1);
    await expect(
      protocol.connect(owner).editMinerVaultB(user.address, 0, tierInfo[3] + 1n)
    ).to.be.reverted;
  });

  it("rejects admin node deactivation while the node lot is still protected", async function () {
    const { owner, user, usdt, protocol } = await loadFixture(deployProtocolFixture);

    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(user).register(owner.address);

    const v1Cost = (await protocol.getMinerTierInfo(1))[0];
    await usdt.mint(user.address, v1Cost);
    await usdt.connect(user).approve(await protocol.getAddress(), v1Cost);
    await protocol.connect(user).purchaseMiner(1);

    const lotId = await protocol.minerNodeLotIds(user.address, 0);
    await expect(
      protocol.connect(owner).adminDeactivateNodeLot(user.address, lotId)
    ).to.be.reverted;
  });
});
