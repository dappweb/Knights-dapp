const hre = require("hardhat");
require("dotenv").config();

/**
 * Upgrade SeerProtocol proxy to V2
 * - Adds nodeSaleOpen / minerSaleOpen state variables
 * - Calls initializeV2() to set defaults (both true)
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const PROTOCOL_PROXY = process.env.VITE_PROTOCOL_ADDRESS;
  if (!PROTOCOL_PROXY) throw new Error("VITE_PROTOCOL_ADDRESS not set in .env");

  console.log("\nProtocol proxy:", PROTOCOL_PROXY);

  // ── 1. Upgrade implementation ──
  console.log("\n[1/2] Upgrading SeerProtocol implementation...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol");
  const upgraded = await hre.upgrades.upgradeProxy(PROTOCOL_PROXY, SeerProtocol, {
    unsafeAllow: ["constructor", "state-variable-assignment"],
    call: { fn: "initializeV2", args: [] },
  });
  await upgraded.waitForDeployment();
  const addr = await upgraded.getAddress();
  console.log("  Proxy address (unchanged):", addr);

  // ── 2. Verify new state ──
  console.log("\n[2/2] Verifying new state...");
  const nodeSaleOpen = await upgraded.nodeSaleOpen();
  const minerSaleOpen = await upgraded.minerSaleOpen();
  console.log("  nodeSaleOpen:", nodeSaleOpen);
  console.log("  minerSaleOpen:", minerSaleOpen);

  if (!nodeSaleOpen || !minerSaleOpen) {
    throw new Error("initializeV2 did not set defaults correctly!");
  }

  console.log("\n✅ Protocol upgraded to V2 successfully");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
