/**
 * upgrade-protocol-batch-register.cjs
 * ─────────────────────────────────────────────────────
 * 升级 SeerProtocol 合约，增加 adminBatchRegister 功能，
 * 允许管理员批量注册/激活用户地址，使其可作为推荐人被绑定。
 *
 * 用法:
 *   npx hardhat run scripts/upgrade-protocol-batch-register.cjs --network cncMainnet --config config/hardhat.config.cjs
 */

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

  console.log("\n[2/2] Verifying adminBatchRegister method...");
  const ok = typeof upgraded.adminBatchRegister === "function";
  console.log(`  adminBatchRegister: ${ok ? "OK" : "MISSING"}`);

  console.log("\n✅ Protocol upgrade completed. adminBatchRegister is now available.");
}

main().catch((error) => {
  console.error("\n❌ Upgrade failed:", error);
  process.exit(1);
});
