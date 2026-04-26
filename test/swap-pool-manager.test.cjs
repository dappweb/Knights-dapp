/**
 * swap-pool-manager.test.cjs
 * ─────────────────────────────────────────────────────
 * 测试 SwapPoolManager 解耦方案:
 *   - SEER 无内置税, 有 transfer restriction
 *   - Manager 收税并调用 Router 执行 swap
 */

const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("SwapPoolManager", function () {
  let seer, usdt, manager, router, pair;
  let owner, foundation, nodePool, user1, user2;

  beforeEach(async function () {
    [owner, foundation, nodePool, user1, user2] = await ethers.getSigners();

    // ─── Deploy MockUSDT ───
    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    usdt = await MockUSDT.deploy();
    await usdt.waitForDeployment();

    // ─── Deploy SEER (upgraded version: no embedded tax) ───
    const SEER = await ethers.getContractFactory("SEER");
    seer = await upgrades.deployProxy(SEER, [foundation.address, nodePool.address], {
      initializer: "initialize",
      unsafeAllow: ["constructor", "state-variable-assignment"],
    });
    await seer.waitForDeployment();

    // ─── Deploy MockRouter (simulates Uniswap V2 Router) ───
    // We'll use a simple mock that just does 1:1 swaps for testing
    const MockRouter = await ethers.getContractFactory("MockUniswapV2Router");
    router = await MockRouter.deploy(await seer.getAddress(), await usdt.getAddress());
    await router.waitForDeployment();

    // ─── Deploy SwapPoolManager ───
    const SwapPoolManager = await ethers.getContractFactory("SwapPoolManager");
    manager = await upgrades.deployProxy(
      SwapPoolManager,
      [
        await seer.getAddress(),
        await usdt.getAddress(),
        await router.getAddress(),
        foundation.address,
        nodePool.address,
      ],
      {
        initializer: "initialize",
        unsafeAllow: ["constructor"],
      }
    );
    await manager.waitForDeployment();

    // ─── SEER whitelist: Manager can interact with pair ───
    await seer.setTaxExemption(await manager.getAddress(), true);

    // ─── Seed: give user1 some SEER and USDT ───
    const seerAddr = await seer.getAddress();
    await seer.transfer(user1.address, ethers.parseEther("10000"));
    await usdt.mint(user1.address, ethers.parseEther("10000"));

    // Seed router with liquidity for mock swaps
    await seer.transfer(await router.getAddress(), ethers.parseEther("100000"));
    await usdt.mint(await router.getAddress(), ethers.parseEther("100000"));
  });

  it("should have correct initial tax config", async function () {
    expect(await manager.buyTaxBP()).to.equal(200n);
    expect(await manager.sellTaxBP()).to.equal(200n);
    expect(await manager.burnShareBP()).to.equal(5000n);
    expect(await manager.nodeShareBP()).to.equal(2500n);
  });

  it("should swap SEER → USDT with tax deduction", async function () {
    const amountIn = ethers.parseEther("1000");

    // Approve Manager
    await seer.connect(user1).approve(await manager.getAddress(), amountIn);

    const usdtBefore = await usdt.balanceOf(user1.address);
    const tx = await manager.connect(user1).swapSEERForUSDT(amountIn, 0, user1.address);
    await tx.wait();

    // Verify tax was collected: 2% of 1000 = 20 SEER
    const totalTax = await manager.totalTaxCollected();
    expect(totalTax).to.equal(ethers.parseEther("20"));

    // Verify distribution: 50% burn, 25% node, 25% foundation
    expect(await manager.totalBurned()).to.equal(ethers.parseEther("10"));
    expect(await manager.totalNodeRewards()).to.equal(ethers.parseEther("5"));
    expect(await manager.totalFoundationFees()).to.equal(ethers.parseEther("5"));

    // User got USDT for 980 SEER worth (mock router is 1:1)
    const usdtAfter = await usdt.balanceOf(user1.address);
    expect(usdtAfter - usdtBefore).to.equal(ethers.parseEther("980"));
  });

  it("should swap USDT → SEER with tax deduction", async function () {
    const amountIn = ethers.parseEther("1000");

    // Approve Manager
    await usdt.connect(user1).approve(await manager.getAddress(), amountIn);

    const seerBefore = await seer.balanceOf(user1.address);
    await manager.connect(user1).swapUSDTForSEER(amountIn, 0, user1.address);

    // Router returns 1000 SEER, then 2% tax = 20 SEER taken
    const seerAfter = await seer.balanceOf(user1.address);
    expect(seerAfter - seerBefore).to.equal(ethers.parseEther("980"));
    expect(await manager.totalTaxCollected()).to.equal(ethers.parseEther("20"));
  });

  it("should allow owner to change tax rates", async function () {
    await manager.setTaxRates(500, 300); // 5% buy, 3% sell
    expect(await manager.buyTaxBP()).to.equal(500n);
    expect(await manager.sellTaxBP()).to.equal(300n);
  });

  it("should reject tax rate above 20%", async function () {
    await expect(manager.setTaxRates(2001, 200)).to.be.revertedWithCustomError(manager, "InvalidTaxRate");
  });

  it("should allow owner to change tax distribution", async function () {
    await manager.setTaxDistribution(6000, 3000); // 60% burn, 30% node, 10% foundation
    expect(await manager.burnShareBP()).to.equal(6000n);
    expect(await manager.nodeShareBP()).to.equal(3000n);
  });

  it("should reject distribution exceeding 100%", async function () {
    await expect(manager.setTaxDistribution(6000, 5000)).to.be.revertedWithCustomError(manager, "InvalidDistribution");
  });

  it("should provide accurate quotes", async function () {
    const amountIn = ethers.parseEther("1000");

    // Sell quote: 2% tax on 1000 = 20, router gets 980 → 980 USDT
    const sellQuote = await manager.quoteSEERForUSDT(amountIn);
    expect(sellQuote.taxAmount).to.equal(ethers.parseEther("20"));
    expect(sellQuote.afterTaxInput).to.equal(ethers.parseEther("980"));
    expect(sellQuote.amountOut).to.equal(ethers.parseEther("980"));

    // Buy quote: router returns 1000 SEER, 2% tax = 20, user gets 980
    const buyQuote = await manager.quoteUSDTForSEER(amountIn);
    expect(buyQuote.taxAmount).to.equal(ethers.parseEther("20"));
    expect(buyQuote.rawSeerOut).to.equal(ethers.parseEther("1000"));
    expect(buyQuote.amountOut).to.equal(ethers.parseEther("980"));
  });

  it("should revert if non-owner changes rates", async function () {
    await expect(
      manager.connect(user1).setTaxRates(100, 100)
    ).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
  });

  it("should emit SwapSEERForUSDT event", async function () {
    const amountIn = ethers.parseEther("100");
    await seer.connect(user1).approve(await manager.getAddress(), amountIn);

    await expect(manager.connect(user1).swapSEERForUSDT(amountIn, 0, user1.address))
      .to.emit(manager, "SwapSEERForUSDT");
  });

  it("should revert swapUSDTForSEER if slippage exceeded", async function () {
    const amountIn = ethers.parseEther("100");
    await usdt.connect(user1).approve(await manager.getAddress(), amountIn);

    // Asking for more than possible (100 USDT → at most 98 SEER after tax)
    await expect(
      manager.connect(user1).swapUSDTForSEER(amountIn, ethers.parseEther("99"), user1.address)
    ).to.be.revertedWithCustomError(manager, "InsufficientOutput");
  });
});

describe("SEER Transfer Restriction", function () {
  let seer, owner, user1, fakePair;

  beforeEach(async function () {
    [owner, , , user1, fakePair] = await ethers.getSigners();

    const SEER = await ethers.getContractFactory("SEER");
    seer = await upgrades.deployProxy(SEER, [owner.address, owner.address], {
      initializer: "initialize",
      unsafeAllow: ["constructor", "state-variable-assignment"],
    });
    await seer.waitForDeployment();

    // Mark fakePair as a taxed pair
    await seer.setTaxedPair(fakePair.address, true);

    // Enable transfer restriction
    await seer.setTaxEnabled(true);
    
    // Give user1 some SEER
    await seer.transfer(user1.address, ethers.parseEther("1000"));
  });

  it("should block direct transfer to DEX pair", async function () {
    await expect(
      seer.connect(user1).transfer(fakePair.address, ethers.parseEther("100"))
    ).to.be.reverted;
  });

  it("should block direct transfer from DEX pair", async function () {
    // Owner is exempt, so give pair some tokens first
    await seer.transfer(fakePair.address, ethers.parseEther("100"));

    // Pair trying to send to non-exempt user
    await expect(
      seer.connect(fakePair).transfer(user1.address, ethers.parseEther("10"))
    ).to.be.reverted;
  });

  it("should allow exempt address to transfer to/from pair", async function () {
    // Owner is exempt by default
    await seer.transfer(fakePair.address, ethers.parseEther("100"));
    // This should succeed since owner is exempt
    expect(await seer.balanceOf(fakePair.address)).to.equal(ethers.parseEther("100"));
  });

  it("should allow normal transfers between non-pair addresses", async function () {
    const [, , , , , receiver] = await ethers.getSigners();
    await seer.connect(user1).transfer(receiver.address, ethers.parseEther("50"));
    expect(await seer.balanceOf(receiver.address)).to.equal(ethers.parseEther("50"));
  });

  it("should allow transfers when restriction is disabled", async function () {
    await seer.setTaxEnabled(false);
    // Now even direct pair transfer should work
    await seer.connect(user1).transfer(fakePair.address, ethers.parseEther("100"));
    expect(await seer.balanceOf(fakePair.address)).to.equal(ethers.parseEther("100"));
  });
});
