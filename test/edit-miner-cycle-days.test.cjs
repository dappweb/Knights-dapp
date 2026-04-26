/**
 * edit-miner-cycle-days.test.cjs
 * ─────────────────────────────────────────────────────
 * 测试 editMinerCycleDays 管理员修改已有矿机释放周期
 */

const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, upgrades } = hre;

describe("editMinerCycleDays", function () {
  let protocol, usdt, seer, minerNode, owner, foundation, user1, nonOwner, superAdmin;

  beforeEach(async function () {
    [owner, foundation, user1, nonOwner, superAdmin] = await ethers.getSigners();

    // Deploy mock USDT
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    // Deploy SEER
    const SEER = await ethers.getContractFactory("SEER");
    seer = await upgrades.deployProxy(SEER, [foundation.address, foundation.address], {
      initializer: "initialize",
      unsafeAllow: ["constructor", "state-variable-assignment"],
    });
    await seer.waitForDeployment();

    // Deploy MinerNode
    const MinerNode = await ethers.getContractFactory("MinerNode");
    minerNode = await upgrades.deployProxy(MinerNode, [await seer.getAddress()], {
      initializer: "initialize",
      unsafeAllow: ["constructor"],
    });
    await minerNode.waitForDeployment();

    await seer.connect(owner).setNodeRewardPool(await minerNode.getAddress());

    // Deploy Protocol
    const SeerProtocol = await ethers.getContractFactory("SeerProtocol");
    protocol = await upgrades.deployProxy(
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

    // Fund mining pool
    const miningPoolAmount = ethers.parseEther("1000000");
    await seer.connect(owner).approve(await protocol.getAddress(), miningPoolAmount);
    await protocol.connect(owner).fundMiningPool(miningPoolAmount);

    // Register owner + user1
    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(user1).register(owner.address);

    // Give user1 USDT and approve, then purchase a V1 miner (allowed in node phase)
    const v1Cost = (await protocol.getMinerTierInfo(1))[0];
    await usdt.mint(user1.address, v1Cost);
    await usdt.connect(user1).approve(await protocol.getAddress(), v1Cost);
    await protocol.connect(user1).purchaseMiner(1);
  });

  it("should allow owner to edit cycleDays of existing miner", async function () {
    // Read original cycleDays
    const minerBefore = await protocol.getUserMiner(user1.address, 0);
    const oldCycle = Number(minerBefore.cycleDays);
    expect(oldCycle).to.be.greaterThan(0);

    // Edit to 50 days
    const tx = await protocol.editMinerCycleDays(user1.address, 0, 50);
    await tx.wait();

    const minerAfter = await protocol.getUserMiner(user1.address, 0);
    expect(Number(minerAfter.cycleDays)).to.equal(50);
  });

  it("should emit AdminMinerCycleDaysEdited event", async function () {
    const minerBefore = await protocol.getUserMiner(user1.address, 0);
    const oldCycle = minerBefore.cycleDays;

    await expect(protocol.editMinerCycleDays(user1.address, 0, 30))
      .to.emit(protocol, "AdminMinerCycleDaysEdited")
      .withArgs(owner.address, user1.address, 0, oldCycle, 30);
  });

  it("should allow super-admin to edit cycleDays", async function () {
    await protocol.addSuperAdmin(superAdmin.address);

    await expect(
      protocol.connect(superAdmin).editMinerCycleDays(user1.address, 0, 45)
    )
      .to.emit(protocol, "AdminMinerCycleDaysEdited")
      .withArgs(superAdmin.address, user1.address, 0, (v) => v > 0n, 45);

    const minerAfter = await protocol.getUserMiner(user1.address, 0);
    expect(Number(minerAfter.cycleDays)).to.equal(45);
  });

  it("should revert if cycleDays is 0", async function () {
    await expect(
      protocol.editMinerCycleDays(user1.address, 0, 0)
    ).to.be.reverted;
  });

  it("should revert for invalid miner index", async function () {
    await expect(
      protocol.editMinerCycleDays(user1.address, 999, 50)
    ).to.be.reverted;
  });

  it("should revert if called by non-owner", async function () {
    await expect(
      protocol.connect(nonOwner).editMinerCycleDays(user1.address, 0, 50)
    ).to.be.reverted;
  });
});
