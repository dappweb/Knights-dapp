/**
 * admin-batch-register.test.cjs
 * ─────────────────────────────────────────────────────
 * 测试 adminBatchRegister 批量注册/激活用户功能
 */

const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, upgrades } = hre;

describe("adminBatchRegister", function () {
  let protocol, usdt, seer, owner, foundation, addr1, addr2, addr3, addr4, nonOwner, superAdmin;

  beforeEach(async function () {
    [owner, foundation, addr1, addr2, addr3, addr4, nonOwner, superAdmin] = await ethers.getSigners();

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
    const minerNode = await upgrades.deployProxy(MinerNode, [await seer.getAddress()], {
      initializer: "initialize",
      unsafeAllow: ["constructor"],
    });
    await minerNode.waitForDeployment();

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

    // Owner registers as first user
    await protocol.connect(owner).register(ethers.ZeroAddress);
  });

  it("should batch register multiple users under owner", async function () {
    const users = [addr1.address, addr2.address, addr3.address];
    const refs = [ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress];

    const tx = await protocol.adminBatchRegister(users, refs);
    await tx.wait();

    // Verify all registered
    for (const addr of users) {
      const info = await protocol.getUserInfo(addr);
      expect(info[0]).to.equal(true, `${addr} should be registered`);
      expect(info[1]).to.equal(owner.address, `${addr} referrer should be owner`);
    }

    const totalUsers = await protocol.totalUsers();
    expect(totalUsers).to.equal(4n); // owner + 3
  });

  it("should skip already registered users", async function () {
    // Register addr1 manually
    await protocol.connect(addr1).register(owner.address);

    const users = [addr1.address, addr2.address];
    const refs = [ethers.ZeroAddress, ethers.ZeroAddress];

    await protocol.adminBatchRegister(users, refs);

    const totalUsers = await protocol.totalUsers();
    expect(totalUsers).to.equal(3n); // owner + addr1 + addr2 (addr1 not double counted)
  });

  it("should allow specifying custom referrers", async function () {
    // First register addr1
    await protocol.connect(addr1).register(owner.address);

    // Then batch register addr2 under addr1
    const users = [addr2.address];
    const refs = [addr1.address];

    await protocol.adminBatchRegister(users, refs);

    const info = await protocol.getUserInfo(addr2.address);
    expect(info[0]).to.equal(true);
    expect(info[1]).to.equal(addr1.address);
  });

  it("should allow super-admin to batch register users", async function () {
    await protocol.addSuperAdmin(superAdmin.address);

    const users = [addr1.address, addr2.address];
    const refs = [ethers.ZeroAddress, ethers.ZeroAddress];

    await protocol.connect(superAdmin).adminBatchRegister(users, refs);

    const info1 = await protocol.getUserInfo(addr1.address);
    const info2 = await protocol.getUserInfo(addr2.address);
    expect(info1[0]).to.equal(true);
    expect(info2[0]).to.equal(true);
  });

  it("should revert if called by non-owner", async function () {
    await expect(
      protocol.connect(nonOwner).adminBatchRegister([addr1.address], [ethers.ZeroAddress])
    ).to.be.reverted;
  });

  it("should only allow owner to add/remove super-admin", async function () {
    await protocol.addSuperAdmin(superAdmin.address);

    await expect(
      protocol.connect(superAdmin).addSuperAdmin(addr1.address)
    ).to.be.revertedWithCustomError(protocol, "OwnableUnauthorizedAccount");

    await expect(
      protocol.connect(superAdmin).removeSuperAdmin(superAdmin.address)
    ).to.be.revertedWithCustomError(protocol, "OwnableUnauthorizedAccount");
  });

  it("should revert on length mismatch", async function () {
    await expect(
      protocol.adminBatchRegister([addr1.address, addr2.address], [ethers.ZeroAddress])
    ).to.be.reverted;
  });

  it("should skip users with unregistered referrers", async function () {
    // addr3 is not registered, try to use as referrer
    const users = [addr1.address];
    const refs = [addr3.address];

    await protocol.adminBatchRegister(users, refs);

    const info = await protocol.getUserInfo(addr1.address);
    expect(info[0]).to.equal(false); // should have been skipped
  });

  it("should emit AdminBatchRegistered event", async function () {
    const users = [addr1.address, addr2.address];
    const refs = [ethers.ZeroAddress, ethers.ZeroAddress];

    await expect(protocol.adminBatchRegister(users, refs))
      .to.emit(protocol, "AdminBatchRegistered")
      .withArgs(owner.address, 2n, (v) => v > 0);
  });

  it("registered users can now serve as referrers", async function () {
    // Batch register addr1
    await protocol.adminBatchRegister([addr1.address], [ethers.ZeroAddress]);

    // addr2 registers with addr1 as referrer (normal user flow)
    await protocol.connect(addr2).register(addr1.address);

    const info = await protocol.getUserInfo(addr2.address);
    expect(info[0]).to.equal(true);
    expect(info[1]).to.equal(addr1.address);
  });
});
