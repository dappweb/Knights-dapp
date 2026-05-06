const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const ERC1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const ERC1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const PROXY_ADMIN_ABI = [
  "function owner() view returns(address)",
  "function upgradeAndCall(address proxy,address implementation,bytes data) payable",
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

async function main() {
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required");

  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 97n) throw new Error(`Expected BSC Testnet chainId 97, got ${network.chainId}`);

  const deploymentsDir = path.join(__dirname, "..", "deployments", "bscTestnet");
  const activePath = path.join(deploymentsDir, "knt-pancake-test-pool.json");
  const upgradeablePath = path.join(deploymentsDir, "knt-upgradeable-test-pool.json");
  const active = readJson(activePath);
  const upgradeable = fs.existsSync(upgradeablePath) ? readJson(upgradeablePath) : active;

  const proxyAddress = process.env.KNT_PROXY_ADDRESS || active.upgradeability?.proxy || active.KNTAllInOne;
  if (!hre.ethers.isAddress(proxyAddress)) throw new Error(`Invalid proxy address: ${proxyAddress}`);

  const proxyAdminFromFile = active.upgradeability?.proxyAdmin || active.ProxyAdmin;
  const proxyAdminFromChain = addressFromStorage(await hre.ethers.provider.getStorage(proxyAddress, ERC1967_ADMIN_SLOT));
  const proxyAdminAddress = proxyAdminFromFile || proxyAdminFromChain;
  if (proxyAdminAddress.toLowerCase() !== proxyAdminFromChain.toLowerCase()) {
    throw new Error(`ProxyAdmin mismatch. file=${proxyAdminAddress}, chain=${proxyAdminFromChain}`);
  }

  const oldImplementation = addressFromStorage(await hre.ethers.provider.getStorage(proxyAddress, ERC1967_IMPLEMENTATION_SLOT));
  const proxyAdmin = new hre.ethers.Contract(proxyAdminAddress, PROXY_ADMIN_ABI, deployer);
  const owner = await proxyAdmin.owner();
  if (owner.toLowerCase() !== deployerAddress.toLowerCase()) {
    throw new Error(`Deployer is not ProxyAdmin owner. deployer=${deployerAddress}, owner=${owner}`);
  }

  const KNT = await hre.ethers.getContractFactory("KNTAllInOneUpgradeable");
  const implementation = await KNT.deploy();
  await implementation.waitForDeployment();
  const newImplementation = await implementation.getAddress();
  console.log(`New implementation: ${newImplementation}`);
  console.log(`Proxy: ${proxyAddress}`);
  console.log(`ProxyAdmin: ${proxyAdminAddress}`);
  console.log(`Old implementation: ${oldImplementation}`);

  const tx = await proxyAdmin.upgradeAndCall(proxyAddress, newImplementation, "0x");
  const receipt = await tx.wait();
  console.log(`upgradeAndCall: ${receipt.hash}`);

  const chainImplementation = addressFromStorage(await hre.ethers.provider.getStorage(proxyAddress, ERC1967_IMPLEMENTATION_SLOT));
  if (chainImplementation.toLowerCase() !== newImplementation.toLowerCase()) {
    throw new Error(`Upgrade verification failed. chain=${chainImplementation}, expected=${newImplementation}`);
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
    contractVerification: {
      enabled: false,
      sourceCodeVerification: "disabled",
    },
  };

  for (const [filePath, json] of [[activePath, active], [upgradeablePath, upgradeable]]) {
    json.upgradedAt = upgradedAt;
    json.KNTAllInOne = proxyAddress;
    json.KNTImplementation = newImplementation;
    json.ProxyAdmin = proxyAdminAddress;
    json.contractVerification = {
      enabled: false,
      sourceCodeVerification: "disabled",
    };
    json.upgradeability = {
      ...(json.upgradeability || {}),
      pattern: "transparent",
      implementation: newImplementation,
      proxy: proxyAddress,
      proxyAdmin: proxyAdminAddress,
      proxyAdminOwner: owner,
    };
    json.upgrades = [...(json.upgrades || []), upgradeRecord];
    writeJson(filePath, json);
  }

  console.log(JSON.stringify(upgradeRecord, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
