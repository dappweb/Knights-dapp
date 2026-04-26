const hre = require("hardhat");
require("dotenv").config();
require("dotenv").config({ path: ".env.production" });

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddr = await deployer.getAddress();

  const protocolProxy =
    process.env.VITE_PROTOCOL_ADDRESS || process.env.PROTOCOL_ADDRESS;

  if (!protocolProxy) {
    throw new Error("VITE_PROTOCOL_ADDRESS / PROTOCOL_ADDRESS is missing");
  }

  console.log("Deployer:", deployerAddr);
  console.log("Protocol proxy:", protocolProxy);

  console.log("\n[1/2] Upgrading SeerProtocol implementation...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol");
  const upgraded = await hre.upgrades.upgradeProxy(protocolProxy, SeerProtocol, {
    unsafeAllow: ["constructor", "state-variable-assignment"],
  });
  await upgraded.waitForDeployment();

  console.log("Upgraded proxy:", await upgraded.getAddress());

  console.log("\n[2/2] Verifying admin edit methods...");
  const checks = [
    "deactivateMiner",
    "activateMiner",
    "removeMiner",
    "adminDeactivateNodeLot",
  ];

  for (const fn of checks) {
    const ok = typeof upgraded[fn] === "function";
    console.log(`  ${fn}:`, ok ? "OK" : "MISSING");
  }

  console.log("\n✅ Protocol admin-edit upgrade completed.");
}

main().catch((error) => {
  console.error("\n❌ Upgrade failed:", error);
  process.exit(1);
});
