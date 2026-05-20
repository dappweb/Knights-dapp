const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const ERC1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ERC1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const PROXY_ADMIN_ABI = [
  "function owner() view returns(address)",
  "function upgradeAndCall(address proxy,address implementation,bytes data) payable",
];

const KNT_ADMIN_ABI = [
  "function pancakeProxy() view returns(address)",
  "function setPancakeProxy(address)",
  "function keeperSyncNodeUnits(address[])",
  "function nodeCount() view returns(uint256)",
  "function nodes() view returns(address[])",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function addressFromStorage(rawStorage) {
  return hre.ethers.getAddress(`0x${rawStorage.slice(-40)}`);
}

async function readNodeListFromStorage(provider, proxyAddress) {
  const nodeListSlot = 46n;
  const length = BigInt(await provider.getStorage(proxyAddress, nodeListSlot));
  const base = BigInt(hre.ethers.keccak256(hre.ethers.toBeHex(nodeListSlot, 32)));
  const nodes = [];
  for (let i = 0n; i < length; i++) {
    const raw = await provider.getStorage(proxyAddress, hre.ethers.toBeHex(base + i, 32));
    nodes.push(addressFromStorage(raw));
  }
  return nodes;
}

async function main() {
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required");

  // Use plain ethers Wallet to avoid hardhat-ethers checkTx BAD_DATA bug on BSC
  const provider = new hre.ethers.JsonRpcProvider(hre.network.config.url);
  const rawKey = process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`;
  const deployer = new hre.ethers.Wallet(rawKey, provider);
  const deployerAddress = deployer.address;
  const network = await provider.getNetwork();
  if (network.chainId !== 56n) throw new Error(`Expected BSC Mainnet chainId 56, got ${network.chainId}`);

  const deploymentsDir = path.join(__dirname, "..", "deployments", "bscMainnet");
  const mainnetPath = path.join(deploymentsDir, "knt-upgradeable-mainnet.json");
  const mainnet = readJson(mainnetPath);

  const proxyAddress = process.env.KNT_PROXY_ADDRESS || mainnet.upgradeability?.proxy || mainnet.KNTAllInOne;
  if (!hre.ethers.isAddress(proxyAddress)) throw new Error(`Invalid proxy address: ${proxyAddress}`);

  const proxyAdminFromFile = mainnet.upgradeability?.proxyAdmin || mainnet.ProxyAdmin;
  const proxyAdminFromChain = addressFromStorage(await provider.getStorage(proxyAddress, ERC1967_ADMIN_SLOT));
  const proxyAdminAddress = proxyAdminFromFile || proxyAdminFromChain;
  if (proxyAdminAddress.toLowerCase() !== proxyAdminFromChain.toLowerCase()) {
    throw new Error(`ProxyAdmin mismatch. file=${proxyAdminAddress}, chain=${proxyAdminFromChain}`);
  }

  const oldImplementation = addressFromStorage(await provider.getStorage(proxyAddress, ERC1967_IMPLEMENTATION_SLOT));
  const proxyAdmin = new hre.ethers.Contract(proxyAdminAddress, PROXY_ADMIN_ABI, deployer);
  const owner = await proxyAdmin.owner();
  if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
    throw new Error(`Deployer is not ProxyAdmin owner. deployer=${deployerAddress}, owner=${owner}`);
  }

  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Proxy: ${proxyAddress}`);
  console.log(`ProxyAdmin: ${proxyAdminAddress}`);
  console.log(`Old implementation: ${oldImplementation}`);

  let legacyNodes = [];
  try {
    const legacyKnt = new hre.ethers.Contract(proxyAddress, KNT_ADMIN_ABI, provider);
    legacyNodes = Array.from(await legacyKnt.nodes());
    console.log(`Legacy nodes found before upgrade: ${legacyNodes.length}`);
  } catch (error) {
    console.log(`Legacy node list unavailable before upgrade: ${error.message}`);
    legacyNodes = await readNodeListFromStorage(provider, proxyAddress);
    console.log(`Legacy nodes recovered from storage: ${legacyNodes.length}`);
  }

  console.log("Deploying new implementation...");

  // Use legacy (type 0) transactions to avoid ethers v6 BAD_DATA parsing issue on BSC
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || hre.ethers.parseUnits("3", "gwei");
  let nextNonce = await provider.getTransactionCount(deployerAddress, "pending");
  const nextOverrides = () => ({ type: 0, gasPrice, nonce: nextNonce++ });

  const KNT = await hre.ethers.getContractFactory("KNTAllInOneUpgradeable");
  const connectedKNT = KNT.connect(deployer);
  const implementation = await connectedKNT.deploy(nextOverrides());
  await implementation.waitForDeployment();
  const newImplementation = await implementation.getAddress();
  console.log(`New implementation: ${newImplementation}`);

  console.log("Calling upgradeAndCall...");
  const tx = await proxyAdmin.upgradeAndCall(proxyAddress, newImplementation, "0x", nextOverrides());
  const receipt = await tx.wait();
  console.log(`upgradeAndCall tx: ${receipt.hash}`);

  const chainImplementation = addressFromStorage(await provider.getStorage(proxyAddress, ERC1967_IMPLEMENTATION_SLOT));
  if (chainImplementation.toLowerCase() !== newImplementation.toLowerCase()) {
    throw new Error(`Upgrade verification failed. chain=${chainImplementation}, expected=${newImplementation}`);
  }
  console.log("Upgrade verified on-chain.");

  let setPancakeProxyReceipt = null;
  const syncNodeReceipts = [];
  let syncedNodeUnitCount = "";
  const configuredPancakeProxy = process.env.MAINNET_PANCAKE_PROXY || process.env.PANCAKE_PROXY || mainnet.pancakeProxy;
  const knt = new hre.ethers.Contract(proxyAddress, KNT_ADMIN_ABI, deployer);
  if (configuredPancakeProxy && hre.ethers.isAddress(configuredPancakeProxy)) {
    const pancakeProxyAddress = hre.ethers.getAddress(configuredPancakeProxy);
    const currentPancakeProxy = await knt.pancakeProxy();
    if (currentPancakeProxy.toLowerCase() !== pancakeProxyAddress.toLowerCase()) {
      console.log(`Setting Pancake proxy: ${pancakeProxyAddress}`);
      const setPancakeProxyTx = await knt.setPancakeProxy(pancakeProxyAddress, nextOverrides());
      setPancakeProxyReceipt = await setPancakeProxyTx.wait();
      console.log(`setPancakeProxy tx: ${setPancakeProxyReceipt.hash}`);
      mainnet.pancakeProxy = pancakeProxyAddress;
    } else {
      console.log(`Pancake proxy already configured: ${currentPancakeProxy}`);
    }
  }

  if (legacyNodes.length > 0 && process.env.SKIP_NODE_UNIT_SYNC !== "1") {
    const batchSize = Number(process.env.NODE_UNIT_SYNC_BATCH_SIZE || 50);
    for (let i = 0; i < legacyNodes.length; i += batchSize) {
      const batch = legacyNodes.slice(i, i + batchSize);
      console.log(`Syncing node units ${i + 1}-${i + batch.length}/${legacyNodes.length}`);
      const syncTx = await knt.keeperSyncNodeUnits(batch, nextOverrides());
      const syncReceipt = await syncTx.wait();
      syncNodeReceipts.push(syncReceipt.hash);
      console.log(`keeperSyncNodeUnits tx: ${syncReceipt.hash}`);
    }
    syncedNodeUnitCount = (await knt.nodeCount()).toString();
    console.log(`Synced node unit count: ${syncedNodeUnitCount}`);
  }

  const upgradedAt = new Date().toISOString();
  const upgradeRecord = {
    upgradedAt,
    tx: receipt.hash,
    blockNumber: receipt.blockNumber,
    oldImplementation,
    newImplementation,
    proxy: proxyAddress,
    proxyAdmin: proxyAdminAddress,
    operator: deployerAddress,
    setPancakeProxyTx: setPancakeProxyReceipt?.hash || "",
    legacyNodeCountBeforeUpgrade: legacyNodes.length,
    syncNodeUnitTxs: syncNodeReceipts,
    syncedNodeUnitCount,
    contractVerification: {
      enabled: false,
      sourceCodeVerification: "disabled",
    },
  };

  mainnet.upgradedAt = upgradedAt;
  mainnet.KNTAllInOne = proxyAddress;
  mainnet.KNTImplementation = newImplementation;
  mainnet.ProxyAdmin = proxyAdminAddress;
  mainnet.contractVerification = {
    enabled: false,
    sourceCodeVerification: "disabled",
  };
  mainnet.upgradeability = {
    ...(mainnet.upgradeability || {}),
    pattern: "transparent",
    implementation: newImplementation,
    proxy: proxyAddress,
    proxyAdmin: proxyAdminAddress,
    proxyAdminOwner: owner,
  };
  if (setPancakeProxyReceipt) {
    mainnet.transactions = {
      ...(mainnet.transactions || {}),
      setPancakeProxy: setPancakeProxyReceipt.hash,
    };
  }
  mainnet.upgrades = [...(mainnet.upgrades || []), upgradeRecord];
  writeJson(mainnetPath, mainnet);

  console.log(JSON.stringify(upgradeRecord, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
