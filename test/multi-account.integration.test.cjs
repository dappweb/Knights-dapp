const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;
const TIER = {
  BASIC: 0,
  V1: 1,
  V2: 2,
  V3: 3,
};
const TEAM_LEVEL = {
  NONE: 0,
  V1: 1,
  V2: 2,
  V3: 3,
  V4: 4,
  V5: 5,
};

async function deployMultiAccountFixture() {
  const [owner, foundation, alice, bob, carol, dave, eve, frank] = await ethers.getSigners();

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

  const SeerProtocol = await ethers.getContractFactory("SeerProtocol");
  const protocol = await upgrades.deployProxy(
    SeerProtocol,
    [await usdt.getAddress(), await seer.getAddress(), foundation.address],
    {
      initializer: "initialize",
      unsafeAllow: ["constructor"],
    }
  );
  await protocol.waitForDeployment();

  await protocol.connect(owner).setMinerNode(await minerNode.getAddress());
  await minerNode.connect(owner).setProtocolAddress(await protocol.getAddress());

  const tierCosts = {};
  const seerQuotes = {};
  for (const [label, tier] of Object.entries(TIER)) {
    const info = await protocol.getMinerTierInfo(tier);
    const quote = await protocol.quoteSeerForMiner(tier);
    tierCosts[label] = info[0];
    seerQuotes[label] = quote[2];
  }

  const richUsdt = tierCosts.V3 * 20n;
  const richSeer = seerQuotes.V3 * 50n;
  for (const signer of [owner, alice, bob, carol, dave, eve, frank]) {
    await usdt.mint(signer.address, richUsdt);
    await seer.connect(owner).transfer(signer.address, richSeer);
    await usdt.connect(signer).approve(await protocol.getAddress(), ethers.MaxUint256);
    await seer.connect(signer).approve(await protocol.getAddress(), ethers.MaxUint256);
  }

  const miningPoolAmount = seerQuotes.V3 * 400n;
  await seer.connect(owner).approve(await protocol.getAddress(), miningPoolAmount);
  await protocol.connect(owner).fundMiningPool(miningPoolAmount);

  const nodeRightsPoolAmount = ethers.parseEther("200000");
  await seer.connect(owner).approve(await minerNode.getAddress(), nodeRightsPoolAmount);
  await minerNode.connect(owner).fundNodeRightsPool(nodeRightsPoolAmount);

  await protocol.connect(owner).register(ethers.ZeroAddress);
  await protocol.connect(alice).register(owner.address);
  await protocol.connect(bob).register(owner.address);
  await protocol.connect(carol).register(alice.address);
  await protocol.connect(dave).register(owner.address);
  await protocol.connect(eve).register(owner.address);
  await protocol.connect(frank).register(owner.address);

  return {
    owner,
    foundation,
    alice,
    bob,
    carol,
    dave,
    eve,
    frank,
    usdt,
    seer,
    protocol,
    minerNode,
    tierCosts,
    seerQuotes,
  };
}

describe("SEER Protocol multi-account integration", function () {
  it("covers four miner tiers across USDT and SEER purchase paths", async function () {
    const { owner, alice, bob, carol, dave, protocol, minerNode } = await loadFixture(deployMultiAccountFixture);

    await expect(protocol.connect(alice).purchaseMiner(TIER.V1))
      .to.emit(protocol, "MinerPurchased")
      .and.to.emit(protocol, "MinerAutoGifted");

    await expect(protocol.connect(bob).purchaseMinerWithSEER(TIER.V2))
      .to.emit(protocol, "MinerPurchasedWithSEER")
      .and.to.emit(protocol, "MinerAutoGifted");

    await expect(protocol.connect(carol).purchaseMiner(TIER.V3))
      .to.emit(protocol, "MinerPurchased")
      .and.to.emit(protocol, "MinerAutoGifted");

    await protocol.connect(owner).switchToMinerPhase();

    await expect(protocol.connect(dave).purchaseMinerWithSEER(TIER.BASIC))
      .to.emit(protocol, "MinerPurchased");

    expect(await protocol.getUserMinerCount(alice.address)).to.equal(2n);
    expect(await protocol.getUserMinerCount(bob.address)).to.equal(2n);
    expect(await protocol.getUserMinerCount(carol.address)).to.equal(2n);
    expect(await protocol.getUserMinerCount(dave.address)).to.equal(1n);

    const aliceNodeLots = await minerNode.getUserNodeLotIds(alice.address);
    const bobNodeLots = await minerNode.getUserNodeLotIds(bob.address);
    const carolNodeLots = await minerNode.getUserNodeLotIds(carol.address);
    const daveNodeLots = await minerNode.getUserNodeLotIds(dave.address);

    expect(aliceNodeLots.length).to.equal(1);
    expect(bobNodeLots.length).to.equal(1);
    expect(carolNodeLots.length).to.equal(1);
    expect(daveNodeLots.length).to.equal(0);
  });

  it("covers node purchase, zero-pending branches, node reward claim, and node rights claim", async function () {
    const { owner, alice, protocol, seer, minerNode } = await loadFixture(deployMultiAccountFixture);

    await protocol.connect(alice).purchaseMiner(TIER.V1);

    await expect(minerNode.connect(alice).claimReward()).to.be.reverted;
    await expect(minerNode.connect(alice).claimNodeRights()).to.be.reverted;

    const rewardAmount = ethers.parseEther("5000");
    await seer.connect(owner).approve(await minerNode.getAddress(), rewardAmount);
    await expect(minerNode.connect(owner).distributeReward(rewardAmount))
      .to.emit(minerNode, "RewardDistributed");

    await expect(minerNode.connect(alice).claimReward())
      .to.emit(minerNode, "RewardClaimed");
    await expect(minerNode.connect(alice).claimReward()).to.be.reverted;

    const currentPrice = await protocol.seerPriceUsdt();
    await expect(protocol.connect(owner).updatePrice(currentPrice + 5n * 10n ** 17n))
      .to.emit(protocol, "PriceUpdated")
      .and.to.emit(minerNode, "NodeRightsUnlocked");

    const rightsInfoBefore = await minerNode.getNodeRightsInfo(alice.address);
    expect(rightsInfoBefore[2]).to.be.gt(0n);

    await expect(minerNode.connect(alice).claimNodeRights())
      .to.emit(minerNode, "NodeRightsClaimed");

    const rightsInfoAfter = await minerNode.getNodeRightsInfo(alice.address);
    expect(rightsInfoAfter[2]).to.equal(0n);

    await expect(minerNode.connect(alice).claimNodeRights()).to.be.reverted;
  });

  it("covers checkin, withdraw, referral rewards, and documents missing differential/equal/community emissions", async function () {
    const { owner, alice, carol, protocol, seer } = await loadFixture(deployMultiAccountFixture);

    await protocol.connect(alice).purchaseMiner(TIER.V1);
    await protocol.connect(carol).purchaseMiner(TIER.V1);

    await time.increase(DAY);

    const claimTx = await protocol.connect(carol).claimMining();
    const claimReceipt = await claimTx.wait();

    const referralEvent = claimReceipt.logs
      .map((log) => {
        try {
          return protocol.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .find((entry) => entry.name === "ReferralReward");

    expect(referralEvent).to.not.equal(undefined);

    const missingRewardEvents = claimReceipt.logs
      .map((log) => {
        try {
          return protocol.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((entry) => ["DifferentialReward", "EqualLevelBonus", "CommunityTax"].includes(entry.name));

    expect(missingRewardEvents.length).to.equal(0);

    await expect(protocol.connect(carol).dailyCheckin())
      .to.emit(protocol, "DailyCheckin");

    await expect(protocol.connect(carol).dailyCheckin())
      .to.be.revertedWithCustomError(protocol, "CheckinTooEarly");

    await time.increase(DAY);
    await expect(protocol.connect(carol).dailyCheckin())
      .to.emit(protocol, "DailyCheckin");

    await protocol.connect(owner).setUserTeamLevel(carol.address, TEAM_LEVEL.V5);

    const beforeBalance = await seer.balanceOf(carol.address);
    const carolInfoBeforeWithdraw = await protocol.users(carol.address);
    const withdrawAmount = carolInfoBeforeWithdraw.seerBalance;
    await expect(protocol.connect(carol).withdraw(withdrawAmount))
      .to.emit(protocol, "Withdrawal");
    const afterBalance = await seer.balanceOf(carol.address);
    expect(afterBalance).to.be.gt(beforeBalance);

    const userInfo = await protocol.users(carol.address);
    expect(userInfo.teamLevel).to.equal(5n);
  });

  it("covers exception paths for not registered, insufficient balance, phase restriction, mining pool depletion, and permissions", async function () {
    const [owner, foundation, outsider] = await ethers.getSigners();
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    const SEER = await ethers.getContractFactory("SEER");
    const seer = await upgrades.deployProxy(SEER, [foundation.address, foundation.address], {
      initializer: "initialize",
      unsafeAllow: ["constructor", "state-variable-assignment"],
    });
    await seer.waitForDeployment();

    const SeerProtocol = await ethers.getContractFactory("SeerProtocol");
    const protocol = await upgrades.deployProxy(
      SeerProtocol,
      [await usdt.getAddress(), await seer.getAddress(), foundation.address],
      {
        initializer: "initialize",
        unsafeAllow: ["constructor"],
      }
    );
    await protocol.waitForDeployment();

    await expect(protocol.connect(outsider).purchaseMiner(TIER.V1))
      .to.be.revertedWithCustomError(protocol, "NotRegistered");

    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(outsider).register(owner.address);

    await expect(protocol.connect(outsider).purchaseMiner(TIER.BASIC))
      .to.be.revertedWithCustomError(protocol, "NodePhaseMinerRestricted");

    await protocol.connect(owner).switchToMinerPhase();
    await usdt.connect(outsider).approve(await protocol.getAddress(), ethers.MaxUint256);
    await expect(protocol.connect(outsider).purchaseMiner(TIER.BASIC)).to.be.reverted;

    const basicCost = (await protocol.getMinerTierInfo(TIER.BASIC))[0];
    await usdt.mint(outsider.address, basicCost);
    await protocol.connect(outsider).purchaseMiner(TIER.BASIC);
    await time.increase(DAY);

    await expect(protocol.connect(outsider).claimMining())
      .to.be.revertedWithCustomError(protocol, "MiningPoolDepleted");

    await expect(protocol.connect(outsider).withdraw(0))
      .to.be.revertedWithCustomError(protocol, "ZeroAmount");

    await expect(protocol.connect(outsider).setPaused(true)).to.be.reverted;
  });

  it("covers edge values around minimum tier, cycle completion, and node protection boundary", async function () {
    const { owner, alice, dave, eve, protocol, minerNode } = await loadFixture(deployMultiAccountFixture);

    await protocol.connect(owner).switchToMinerPhase();
    await protocol.connect(dave).purchaseMiner(TIER.BASIC);

    const basicMiner = await protocol.getUserMiner(dave.address, 0);
    expect(basicMiner.tier).to.equal(0n);

    await protocol.connect(owner).resetToNodePhase();
    await protocol.connect(alice).purchaseMiner(TIER.V1);

    const [lotId] = await minerNode.getUserNodeLotIds(alice.address);
    await expect(minerNode.connect(owner).removeNodeLot(alice.address, lotId))
      .to.emit(minerNode, "NodeRemovalSkipped");

    const beforeExpiryNode = await minerNode.nodes(alice.address);
    expect(beforeExpiryNode.isNode).to.equal(true);

    await time.increase(90 * DAY + 1);

    await expect(minerNode.connect(owner).removeNodeLot(alice.address, lotId))
      .to.emit(minerNode, "NodeLotDeactivated")
      .and.to.emit(minerNode, "NodeRemoved");

    const afterExpiryNode = await minerNode.nodes(alice.address);
    expect(afterExpiryNode.isNode).to.equal(false);

    await protocol.connect(eve).purchaseMiner(TIER.V1);
    const eveGiftMiner = await protocol.getUserMiner(eve.address, 1);

    await time.increase(Number(eveGiftMiner.cycleDays) * DAY);

    await expect(protocol.connect(eve).claimMiningByMiner(1))
      .to.emit(protocol, "VaultBExhausted");

    const exhaustedGiftMiner = await protocol.getUserMiner(eve.address, 1);
    expect(exhaustedGiftMiner.active).to.equal(false);
    expect(exhaustedGiftMiner.vaultB_usdt).to.equal(0n);
  });
});