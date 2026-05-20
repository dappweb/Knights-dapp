const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_PANCAKE_PROXY = "0xc0F1Ef7FE2ae3AAD0175af192713d36eD151755a";

const FACTORY_ABI = [
  "function getPair(address tokenA,address tokenB) external view returns (address pair)",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

async function wait(txPromise, label) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label}: ${receipt.hash}`);
  return receipt;
}

async function requireContract(address, label) {
  if (address === ZERO_ADDRESS) return;
  const code = await hre.ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label} has no contract code at ${address}`);
}

async function main() {
  if (process.env.CONFIRM_BSC_MAINNET_CONFIG !== "YES") {
    throw new Error("Set CONFIRM_BSC_MAINNET_CONFIG=YES to update BSC Mainnet liquidity config");
  }
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required");

  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 56n) throw new Error(`Expected BSC Mainnet chainId 56, got ${network.chainId}`);

  const deploymentPath = path.join(__dirname, "..", "deployments", "bscMainnet", "knt-upgradeable-mainnet.json");
  const deployment = readJson(deploymentPath);

  const kntAddress = hre.ethers.getAddress(process.env.KNT_PROXY_ADDRESS || deployment.KNTAllInOne);
  const routerAddress = hre.ethers.getAddress(
    process.env.MAINNET_PANCAKE_V2_ROUTER || deployment.router || process.env.PANCAKE_V2_ROUTER
  );
  const factoryAddress = hre.ethers.getAddress(deployment.factory);
  const usdtAddress = hre.ethers.getAddress(
    process.env.MAINNET_USDT_TOKEN || deployment.USDT || process.env.USDT_TOKEN || process.env.USDT_TOKEN_ADDRESS
  );
  const labubuAddress = hre.ethers.getAddress(
    process.env.MAINNET_LABUBU_TOKEN || deployment.LABUBU || process.env.LABUBU_TOKEN || process.env.LABUBU_TOKEN_ADDRESS
  );
  const pairAddress = hre.ethers.getAddress(
    process.env.MAINNET_KNT_LABUBU_PAIR || deployment.labubuPair || deployment.pair || process.env.KNT_LABUBU_PAIR
  );
  const pancakeProxyAddress = hre.ethers.getAddress(
    process.env.MAINNET_PANCAKE_PROXY || deployment.pancakeProxy || process.env.PANCAKE_PROXY || DEFAULT_PANCAKE_PROXY
  );

  if (pairAddress === ZERO_ADDRESS) throw new Error("KNT/LABUBU pair is not configured");
  await requireContract(pancakeProxyAddress, "Pancake proxy");

  const factory = new hre.ethers.Contract(factoryAddress, FACTORY_ABI, hre.ethers.provider);
  const factoryPair = await factory.getPair(kntAddress, labubuAddress);
  if (factoryPair.toLowerCase() !== pairAddress.toLowerCase()) {
    throw new Error(`Pair mismatch. deployment=${pairAddress}, factory=${factoryPair}`);
  }

  const [admin] = await hre.ethers.getSigners();
  const KNTUpgradeable = await hre.ethers.getContractFactory("KNTAllInOneUpgradeable");
  const knt = KNTUpgradeable.attach(kntAddress).connect(admin);

  const currentPair = await knt.labubuKntPair();
  const currentRouter = await knt.pancakeRouter();
  const currentUsdt = await knt.usdtToken();
  const currentLabubu = await knt.labubuToken();
  const currentPancakeProxy = await knt.pancakeProxy().catch(() => ZERO_ADDRESS);
  const pairEnabled = await knt.ammPairs(pairAddress);
  const liquidityConfigured =
    currentPair.toLowerCase() === pairAddress.toLowerCase() &&
    currentRouter.toLowerCase() === routerAddress.toLowerCase() &&
    currentUsdt.toLowerCase() === usdtAddress.toLowerCase() &&
    currentLabubu.toLowerCase() === labubuAddress.toLowerCase() &&
    pairEnabled;
  const proxyConfigured = currentPancakeProxy.toLowerCase() === pancakeProxyAddress.toLowerCase();

  if (liquidityConfigured && proxyConfigured) {
    console.log("BSC Mainnet liquidity config already matches deployment.");
    return;
  }

  const transactions = {};
  if (!liquidityConfigured) {
    const receipt = await wait(
      knt.setLiquidityConfig(routerAddress, usdtAddress, labubuAddress, pairAddress),
      "set mainnet liquidity config"
    );
    transactions.setMainnetLiquidityConfig = receipt.hash;
  }
  if (!proxyConfigured) {
    const receipt = await wait(knt.setPancakeProxy(pancakeProxyAddress), "set Pancake proxy");
    transactions.setPancakeProxy = receipt.hash;
  }

  deployment.pair = pairAddress;
  deployment.labubuPair = pairAddress;
  deployment.pancakeProxy = pancakeProxyAddress === ZERO_ADDRESS ? "" : pancakeProxyAddress;
  deployment.transactions = {
    ...(deployment.transactions || {}),
    ...transactions,
  };
  deployment.liquidityConfigUpdatedAt = new Date().toISOString();
  writeJson(deploymentPath, deployment);

  console.log(JSON.stringify({
    contract: kntAddress,
    admin: await admin.getAddress(),
    router: routerAddress,
    usdt: usdtAddress,
    labubu: labubuAddress,
    labubuPair: pairAddress,
    pancakeProxy: pancakeProxyAddress,
    transactions,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
