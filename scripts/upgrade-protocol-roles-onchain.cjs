const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
require("dotenv").config();
require("dotenv").config({ path: ".env.production" });

function readLatestProtocolFromDeployment() {
  try {
    const latestPath = path.resolve(process.cwd(), "deployments", `${hre.network.name}.latest.json`);
    if (!fs.existsSync(latestPath)) return "";
    const payload = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    return payload?.contracts?.protocol || "";
  } catch {
    return "";
  }
}

function ensureAddress(value, name) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${name}`);
  }
  const addr = String(value).trim();
  if (!hre.ethers.isAddress(addr)) {
    throw new Error(`Invalid ${name}: ${addr}`);
  }
  return addr;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddr = await deployer.getAddress();

  const protocolProxy = ensureAddress(
    process.env.VITE_PROTOCOL_ADDRESS ||
      process.env.PROTOCOL_ADDRESS ||
      process.env.PROTOCOL_PROXY ||
      readLatestProtocolFromDeployment(),
    "PROTOCOL_PROXY"
  );

  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployerAddr);
  console.log("Protocol proxy:", protocolProxy);

  console.log("\n[1/2] Upgrading SeerProtocol implementation (on-chain roles)...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol");
  const upgraded = await hre.upgrades.upgradeProxy(protocolProxy, SeerProtocol, {
    kind: "uups",
    unsafeAllow: ["constructor", "state-variable-assignment"],
  });
  await upgraded.waitForDeployment();

  console.log("\n[2/2] Verifying on-chain role methods...");
  const checks = [
    "isSuperAdmin",
    "isManager",
    "getSuperAdmins",
    "getManagers",
    "addSuperAdmin",
    "removeSuperAdmin",
    "addManager",
    "removeManager",
  ];

  for (const fn of checks) {
    const ok = typeof upgraded[fn] === "function";
    console.log(`  ${fn}:`, ok ? "OK" : "MISSING");
    if (!ok) {
      throw new Error(`Function missing after upgrade: ${fn}`);
    }
  }

  const [superAdmins, managers] = await Promise.all([
    upgraded.getSuperAdmins(),
    upgraded.getManagers(),
  ]);

  console.log("  superAdmins count:", superAdmins.length);
  console.log("  managers count   :", managers.length);
  console.log("\n✅ Protocol upgraded for on-chain role management.");
}

main().catch((error) => {
  console.error("\n❌ On-chain role upgrade failed:", error);
  process.exit(1);
});
