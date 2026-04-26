const hre = require("hardhat");
require("dotenv").config();
require("dotenv").config({ path: ".env.production" });

/**
 * Upgrade SeerProtocol proxy to V3
 * - Wraps airdropManager.unlockAirdrop() in try/catch
 *   so that users who already unlocked their airdrop can still purchase nodes/miners.
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const PROTOCOL_PROXY =
    process.env.VITE_PROTOCOL_ADDRESS || process.env.PROTOCOL_ADDRESS;
  if (!PROTOCOL_PROXY)
    throw new Error("VITE_PROTOCOL_ADDRESS not set in .env / .env.production");

  console.log("\nProtocol proxy:", PROTOCOL_PROXY);

  // ── 1. Upgrade implementation ──
  console.log("\n[1/2] Upgrading SeerProtocol to V3...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol");
  const upgraded = await hre.upgrades.upgradeProxy(PROTOCOL_PROXY, SeerProtocol, {
    unsafeAllow: ["constructor", "state-variable-assignment"],
    call: { fn: "initializeV3", args: [] },
  });
  await upgraded.waitForDeployment();

  console.log("  Proxy address (unchanged):", await upgraded.getAddress());

  // ── 2. Smoke-test: nodeSaleOpen & minerSaleOpen still true ──
  console.log("\n[2/2] Verifying state...");
  const nodeSaleOpen = await upgraded.nodeSaleOpen();
  const minerSaleOpen = await upgraded.minerSaleOpen();
  console.log("  nodeSaleOpen :", nodeSaleOpen);
  console.log("  minerSaleOpen:", minerSaleOpen);

  console.log("\n✅ Protocol upgraded to V3 — unlockAirdrop is now try/catch safe");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
