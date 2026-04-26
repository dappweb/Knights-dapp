const hre = require("hardhat");
require("dotenv").config();
require("dotenv").config({ path: ".env.production" });

const PROTOCOL_PROXY = process.env.VITE_PROTOCOL_ADDRESS || process.env.PROTOCOL_PROXY || process.env.PROTOCOL_ADDRESS;
const MINERNODE_PROXY = process.env.VITE_MINER_NODE_ADDRESS || process.env.MINERNODE_PROXY || process.env.MINER_NODE_ADDRESS;

function ensureAddress(name, value) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing env: ${name}`);
  }
  return value.trim();
}

async function maybeInitializeProtocol(protocol) {
  const config = await protocol.getMinerTierConfig(0).catch(() => null);
  const costUsdt = BigInt(config?.costUsdt ?? config?.[0] ?? 0);

  if (costUsdt > 0n) {
    console.log("SeerProtocol tier config already initialized, skip initializeV4()");
    return;
  }

  const tx = await protocol.initializeV4();
  await tx.wait();
  console.log("SeerProtocol initializeV4() executed");
}

async function maybeInitializeMinerNode(minerNode) {
  const config = await minerNode.getNodeTierConfig(1).catch(() => null);
  const weight = BigInt(config?.weight ?? config?.[0] ?? 0);

  if (weight > 0n) {
    console.log("MinerNode tier config already initialized, skip initializeV2()");
    return;
  }

  const tx = await minerNode.initializeV2();
  await tx.wait();
  console.log("MinerNode initializeV2() executed");
}

async function main() {
  const protocolProxy = ensureAddress("VITE_PROTOCOL_ADDRESS", PROTOCOL_PROXY);
  const minerNodeProxy = ensureAddress("VITE_MINER_NODE_ADDRESS", MINERNODE_PROXY);

  const [deployer] = await hre.ethers.getSigners();
  console.log("Network:", hre.network.name);
  console.log("Deployer:", await deployer.getAddress());
  console.log("Protocol proxy:", protocolProxy);
  console.log("MinerNode proxy:", minerNodeProxy);

  console.log("\n[1/4] Upgrading SeerProtocol...");
  const SeerProtocol = await hre.ethers.getContractFactory("SeerProtocol");
  const protocol = await hre.upgrades.upgradeProxy(protocolProxy, SeerProtocol, {
    kind: "uups",
    unsafeAllow: ["constructor", "state-variable-assignment"],
  });
  await protocol.waitForDeployment();

  console.log("\n[2/4] Upgrading MinerNode...");
  const MinerNode = await hre.ethers.getContractFactory("MinerNode");
  const minerNode = await hre.upgrades.upgradeProxy(minerNodeProxy, MinerNode, {
    kind: "uups",
    unsafeAllow: ["constructor", "state-variable-assignment"],
  });
  await minerNode.waitForDeployment();

  console.log("\n[3/4] Running reinitializers if needed...");
  await maybeInitializeProtocol(protocol);
  await maybeInitializeMinerNode(minerNode);

  console.log("\n[4/4] Verifying tier config access...");
  const [basicMiner, v1Node] = await Promise.all([
    protocol.getMinerTierConfig(0),
    minerNode.getNodeTierConfig(1),
  ]);

  console.log("Protocol Basic tier cost:", basicMiner.costUsdt?.toString?.() ?? String(basicMiner[0]));
  console.log("Protocol Basic tier enabled:", basicMiner.enabled ?? basicMiner[6]);
  console.log("MinerNode V1 weight:", v1Node.weight?.toString?.() ?? String(v1Node[0]));
  console.log("MinerNode V1 enabled:", v1Node.enabled ?? v1Node[4]);
  console.log("\n✅ Tier config upgrade completed.");
}

main().catch((error) => {
  console.error("\n❌ Tier config upgrade failed:", error);
  process.exit(1);
});