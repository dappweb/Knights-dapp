const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("SEER Protocol Smoke", function () {
  it("deploys core contracts and allows first-user registration", async function () {
    const [owner, foundation] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    const SEER = await ethers.getContractFactory("SEER");
    const seer = await upgrades.deployProxy(
      SEER,
      [foundation.address, foundation.address],
      {
        initializer: "initialize",
        unsafeAllow: ["constructor", "state-variable-assignment"],
      }
    );
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

    await protocol.register(ethers.ZeroAddress);

    const userInfo = await protocol.users(owner.address);
    expect(userInfo.registered).to.equal(true);
    expect(await protocol.totalUsers()).to.equal(1n);
  });
});
