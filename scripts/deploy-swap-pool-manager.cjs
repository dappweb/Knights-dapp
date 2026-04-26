/**
 * deploy-swap-pool-manager.cjs
 * ─────────────────────────────────────────────────────
 * 1. 升级 SEER 代币合约 (移除内置税逻辑, 改为 transfer restriction)
 * 2. 部署 SwapPoolManager (UUPS proxy)
 * 3. 将 Manager 设为 SEER 白名单地址 (isExemptFromTax)
 * 4. 验证配置
 *
 * 用法:
 *   npx hardhat run scripts/deploy-swap-pool-manager.cjs --network cncMainnet --config config/hardhat.config.cjs
 */

const hre = require("hardhat");
require("dotenv").config();
require("dotenv").config({ path: ".env.production" });

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddr = await deployer.getAddress();

  const seerProxy = process.env.VITE_SEER_TOKEN_ADDRESS;
  const usdtAddr = process.env.VITE_USDT_ADDRESS;
  const dexRouter = process.env.VITE_DEX_ROUTER_ADDRESS;
  const minerNodeAddr = process.env.VITE_MINER_NODE_ADDRESS;

  if (!seerProxy || !usdtAddr || !dexRouter) {
    throw new Error("Missing env: VITE_SEER_TOKEN_ADDRESS, VITE_USDT_ADDRESS, VITE_DEX_ROUTER_ADDRESS");
  }

  console.log("Deployer:", deployerAddr);
  console.log("SEER proxy:", seerProxy);
  console.log("USDT:", usdtAddr);
  console.log("DEX Router:", dexRouter);
  console.log("MinerNode:", minerNodeAddr || "N/A");

  // ─── Step 1: 升级 SEER ────────────────────────────────────────
  console.log("\n[1/4] Upgrading SEER token (remove embedded tax, add transfer restriction)...");
  const SEER = await hre.ethers.getContractFactory("SEER");
  const upgradedSeer = await hre.upgrades.upgradeProxy(seerProxy, SEER, {
    unsafeAllow: ["constructor", "state-variable-assignment"],
  });
  await upgradedSeer.waitForDeployment();
  console.log("  SEER upgraded at:", await upgradedSeer.getAddress());

  // ─── Step 2: 部署 SwapPoolManager ─────────────────────────────
  console.log("\n[2/4] Deploying SwapPoolManager...");
  const foundationWallet = await upgradedSeer.foundationWallet();
  const nodeRewardPool = await upgradedSeer.nodeRewardPool();

  console.log("  foundationWallet:", foundationWallet);
  console.log("  nodeRewardPool:", nodeRewardPool);

  const SwapPoolManager = await hre.ethers.getContractFactory("SwapPoolManager");
  const manager = await hre.upgrades.deployProxy(
    SwapPoolManager,
    [seerProxy, usdtAddr, dexRouter, foundationWallet, nodeRewardPool],
    {
      initializer: "initialize",
      unsafeAllow: ["constructor"],
    }
  );
  await manager.waitForDeployment();
  const managerAddr = await manager.getAddress();
  console.log("  SwapPoolManager deployed at:", managerAddr);

  // ─── Step 3: 白名单设置 ───────────────────────────────────────
  console.log("\n[3/4] Setting Manager as exempt in SEER...");
  const tx = await upgradedSeer.setTaxExemption(managerAddr, true);
  await tx.wait();
  console.log("  Manager added to SEER whitelist (isExemptFromTax)");

  // ─── Step 4: 验证 ─────────────────────────────────────────────
  console.log("\n[4/4] Verification...");
  const buyTax = await manager.buyTaxBP();
  const sellTax = await manager.sellTaxBP();
  const isExempt = await upgradedSeer.isExemptFromTax(managerAddr);
  console.log("  buyTaxBP:", buyTax.toString());
  console.log("  sellTaxBP:", sellTax.toString());
  console.log("  Manager exempt in SEER:", isExempt);

  console.log("\n" + "=".repeat(60));
  console.log("✅ Deployment complete!");
  console.log("=".repeat(60));
  console.log("\nSwapPoolManager:", managerAddr);
  console.log("\nNext steps:");
  console.log("  1. Add to .env:  VITE_SWAP_POOL_MANAGER_ADDRESS=" + managerAddr);
  console.log("  2. Rebuild frontend:  npm run build");
  console.log("  3. Redeploy:  bash scripts/deploy-caddy.sh");
}

main().catch((error) => {
  console.error("\n❌ Deploy failed:", error);
  process.exit(1);
});
