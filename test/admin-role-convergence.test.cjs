/**
 * admin-role-convergence.test.cjs
 * ─────────────────────────────────────────────────────
 * 测试权限收敛后的角色边界
 */

const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, upgrades } = hre;

describe("admin role convergence", function () {
  let protocol, usdt, seer, minerNode;
  let owner, foundation, superAdmin, user1;

  beforeEach(async function () {
    [owner, foundation, superAdmin, user1] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    const SEER = await ethers.getContractFactory("SEER");
    seer = await upgrades.deployProxy(SEER, [foundation.address, foundation.address], {
      initializer: "initialize",
      unsafeAllow: ["constructor", "state-variable-assignment"],
    });
    await seer.waitForDeployment();

    const MinerNode = await ethers.getContractFactory("MinerNode");
    minerNode = await upgrades.deployProxy(MinerNode, [await seer.getAddress()], {
      initializer: "initialize",
      unsafeAllow: ["constructor"],
    });
    await minerNode.waitForDeployment();

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

    await seer.connect(owner).setNodeRewardPool(await minerNode.getAddress());
    await protocol.connect(owner).setMinerNode(await minerNode.getAddress());
    await minerNode.connect(owner).setProtocolAddress(await protocol.getAddress());

    await protocol.connect(owner).register(ethers.ZeroAddress);
    await protocol.connect(user1).register(owner.address);

    const v1Cost = (await protocol.getMinerTierInfo(1))[0];
    await usdt.mint(user1.address, v1Cost);
    await usdt.connect(user1).approve(await protocol.getAddress(), v1Cost);
    await protocol.connect(user1).purchaseMiner(1);

    await protocol.connect(owner).addSuperAdmin(superAdmin.address);
  });

  it("super-admin can pause and switch sale toggles", async function () {
    await expect(protocol.connect(superAdmin).setPaused(true))
      .to.emit(protocol, "ProtocolPaused")
      .withArgs(true);

    expect(await protocol.paused()).to.equal(true);

    await expect(protocol.connect(superAdmin).setNodeSaleOpen(false))
      .to.emit(protocol, "NodeSaleOpenChanged")
      .withArgs(false);

    await expect(protocol.connect(superAdmin).setMinerSaleOpen(false))
      .to.emit(protocol, "MinerSaleOpenChanged")
      .withArgs(false);
  });

  it("super-admin can deactivate/activate miner but cannot remove miner", async function () {
    const targetMinerId = 1;

    await expect(protocol.connect(superAdmin).deactivateMiner(user1.address, targetMinerId))
      .to.emit(protocol, "AdminMinerDeactivated");

    const minerAfterDeactivate = await protocol.getUserMiner(user1.address, targetMinerId);
    expect(minerAfterDeactivate.active).to.equal(false);

    await expect(protocol.connect(superAdmin).activateMiner(user1.address, targetMinerId))
      .to.emit(protocol, "AdminMinerActivated");

    const minerAfterActivate = await protocol.getUserMiner(user1.address, targetMinerId);
    expect(minerAfterActivate.active).to.equal(true);

    await expect(
      protocol.connect(superAdmin).removeMiner(user1.address, targetMinerId)
    ).to.be.revertedWithCustomError(protocol, "OwnableUnauthorizedAccount");
  });
});
