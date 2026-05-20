const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ERC1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const DEFAULTS = {
  foundationWallet: "0x994eCC3CD33257Ea0f083Dbc4E8ff5a38E6e8C34",
  dexSettlementWallet: "0xab7c362C30afCdB5808378a213102656dc8056a8",
  projectSinkWallet: "0x994eCC3CD33257Ea0f083Dbc4E8ff5a38E6e8C34",
  ecosystemWallet: "0xab7c362C30afCdB5808378a213102656dc8056a8",
  pancakeRouter: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  pancakeProxy: "0xc0F1Ef7FE2ae3AAD0175af192713d36eD151755a",
  usdtToken: "0x55d398326f99059fF775485246999027B3197955",
  labubuToken: "0x3494dfE19b721DAC6c5c8d7470c8F89548177777",
  wbnbToken: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
};

const ROUTER_ABI = [
  "function factory() external view returns (address)",
  "function addLiquidity(address tokenA,address tokenB,uint amountADesired,uint amountBDesired,uint amountAMin,uint amountBMin,address to,uint deadline) external returns (uint amountA,uint amountB,uint liquidity)",
];

const FACTORY_ABI = [
  "function getPair(address tokenA,address tokenB) external view returns (address pair)",
];

const ERC20_ABI = [
  "function approve(address spender,uint256 value) returns(bool)",
  "function balanceOf(address account) view returns(uint256)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function totalSupply() view returns(uint256)",
];

function ether(value) {
  return hre.ethers.parseEther(value);
}

function fmt(value) {
  return hre.ethers.formatEther(value);
}

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function addressList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => hre.ethers.getAddress(item));
}

function proxyAdminFromStorage(rawStorage) {
  return hre.ethers.getAddress(`0x${rawStorage.slice(-40)}`);
}

async function wait(txPromise, label) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label}: ${receipt.hash}`);
  return receipt;
}

async function requireContract(address, label) {
  const code = await hre.ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label} has no contract code at ${address}`);
}

async function readToken(tokenAddress, label, signerOrProvider) {
  await requireContract(tokenAddress, label);
  const token = new hre.ethers.Contract(tokenAddress, ERC20_ABI, signerOrProvider);
  const [symbol, decimals, totalSupply] = await Promise.all([
    token.symbol(),
    token.decimals(),
    token.totalSupply(),
  ]);
  if (Number(decimals) !== 18) throw new Error(`${label} must have 18 decimals, got ${decimals}`);
  return { token, symbol, decimals: Number(decimals), totalSupply };
}

async function main() {
  if (process.env.CONFIRM_BSC_MAINNET_DEPLOY !== "YES") {
    throw new Error("Set CONFIRM_BSC_MAINNET_DEPLOY=YES to deploy to BSC Mainnet");
  }
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required");

  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 56n) throw new Error(`Expected BSC Mainnet chainId 56, got ${network.chainId}`);

  const foundationWallet = hre.ethers.getAddress(process.env.FOUNDATION_WALLET || DEFAULTS.foundationWallet);
  const dexSettlementWallet = hre.ethers.getAddress(process.env.DEX_SETTLEMENT_WALLET || DEFAULTS.dexSettlementWallet);
  const projectSinkWallet = hre.ethers.getAddress(process.env.PROJECT_SINK_WALLET || DEFAULTS.projectSinkWallet);
  const ecosystemWallet = hre.ethers.getAddress(process.env.ECOSYSTEM_WALLET || DEFAULTS.ecosystemWallet);
  const routerAddress = hre.ethers.getAddress(process.env.PANCAKE_V2_ROUTER || DEFAULTS.pancakeRouter);
  const pancakeProxyAddress = hre.ethers.getAddress(process.env.PANCAKE_PROXY || process.env.MAINNET_PANCAKE_PROXY || DEFAULTS.pancakeProxy);
  const usdtAddress = hre.ethers.getAddress(process.env.USDT_TOKEN || process.env.USDT_TOKEN_ADDRESS || DEFAULTS.usdtToken);
  const labubuAddress = hre.ethers.getAddress(process.env.LABUBU_TOKEN || process.env.LABUBU_TOKEN_ADDRESS || DEFAULTS.labubuToken);
  const labubuSwapIntermediateToken = hre.ethers.getAddress(
    process.env.LABUBU_SWAP_INTERMEDIATE_TOKEN || DEFAULTS.wbnbToken
  );
  const adminWallets = addressList(process.env.ADMIN_WALLETS || process.env.ADMIN_WALLET);
  const managerWallets = addressList(process.env.MANAGER_WALLETS || process.env.MANAGER_WALLET);
  const keeperWallets = addressList(process.env.KEEPER_WALLETS || process.env.KEEPER_WALLET);
  const rewardPeriodSeconds = BigInt(process.env.KNT_REWARD_PERIOD_SECONDS || "600");
  const initialRewardFund = ether(process.env.KNT_INITIAL_REWARD_FUND || "189000000");
  const kntLabubuLiquidityAmount = ether(process.env.KNT_UPGRADEABLE_LP_KNT_AMOUNT || "1");
  const labubuLiquidityAmount = ether(process.env.KNT_UPGRADEABLE_LP_LABUBU_AMOUNT || "1.293");
  const slippageBP = BigInt(process.env.LP_SLIPPAGE_BP || "50");
  const skipInitialLp = String(process.env.SKIP_INITIAL_LP || "false").toLowerCase() === "true";

  if (!skipInitialLp && (kntLabubuLiquidityAmount === 0n || labubuLiquidityAmount === 0n)) {
    throw new Error("Initial LP amounts must be greater than zero");
  }
  if (slippageBP > 1_000n) throw new Error("LP_SLIPPAGE_BP is too high");

  await requireContract(routerAddress, "Pancake V2 Router");
  await requireContract(pancakeProxyAddress, "Pancake proxy");
  await requireContract(labubuSwapIntermediateToken, "LABUBU swap intermediate token");
  const { token: labubu, symbol: labubuSymbol } = await readToken(labubuAddress, "LABUBU token", deployer);
  const { symbol: usdtSymbol } = await readToken(usdtAddress, "USDT token", hre.ethers.provider);

  const bnbBalance = await hre.ethers.provider.getBalance(deployerAddress);
  if (bnbBalance === 0n) throw new Error(`Deployer ${deployerAddress} has no BNB for gas`);

  const labubuBalance = await labubu.balanceOf(deployerAddress);
  if (!skipInitialLp && labubuBalance < labubuLiquidityAmount) {
    throw new Error(`Insufficient LABUBU. Need ${fmt(labubuLiquidityAmount)}, have ${fmt(labubuBalance)}`);
  }

  const router = new hre.ethers.Contract(routerAddress, ROUTER_ABI, deployer);
  const factoryAddress = await router.factory();
  const factory = new hre.ethers.Contract(factoryAddress, FACTORY_ABI, deployer);
  await requireContract(factoryAddress, "Pancake V2 Factory");

  const labubuWbnbPair = await factory.getPair(labubuAddress, labubuSwapIntermediateToken);
  if (labubuWbnbPair === ZERO_ADDRESS) {
    throw new Error("LABUBU/intermediate pair does not exist on Pancake V2");
  }
  const labubuUsdtPair = await factory.getPair(labubuAddress, usdtAddress);

  console.log(`Deploying KNTAllInOneUpgradeable to ${hre.network.name}`);
  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Deployer BNB: ${fmt(bnbBalance)}`);
  console.log(`${labubuSymbol} balance: ${fmt(labubuBalance)}`);
  console.log(`${usdtSymbol}: ${usdtAddress}`);
  console.log(
    skipInitialLp
      ? "Initial KNT/LABUBU LP: skipped"
      : `Initial KNT/LABUBU LP: ${fmt(kntLabubuLiquidityAmount)} KNT / ${fmt(labubuLiquidityAmount)} LABUBU`
  );

  const KNTUpgradeable = await hre.ethers.getContractFactory("KNTAllInOneUpgradeable");
  const implementation = await KNTUpgradeable.deploy();
  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();
  const implementationReceipt = await implementation.deploymentTransaction().wait();
  console.log(`KNTAllInOneUpgradeable implementation: ${implementationAddress}`);

  const initData = KNTUpgradeable.interface.encodeFunctionData("initialize", [
    deployerAddress,
    foundationWallet,
    dexSettlementWallet,
    routerAddress,
    usdtAddress,
    labubuAddress,
  ]);
  const TransparentUpgradeableProxy = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");
  const proxy = await TransparentUpgradeableProxy.deploy(implementationAddress, deployerAddress, initData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  const proxyReceipt = await proxy.deploymentTransaction().wait();
  const proxyAdmin = proxyAdminFromStorage(await hre.ethers.provider.getStorage(proxyAddress, ERC1967_ADMIN_SLOT));
  console.log(`KNT proxy: ${proxyAddress}`);
  console.log(`ProxyAdmin: ${proxyAdmin}`);

  const knt = KNTUpgradeable.attach(proxyAddress).connect(deployer);
  if (projectSinkWallet.toLowerCase() !== foundationWallet.toLowerCase()) {
    await wait(knt.setProjectSinkWallet(projectSinkWallet), "set project sink wallet");
  }
  if (ecosystemWallet.toLowerCase() !== foundationWallet.toLowerCase()) {
    await wait(knt.setEcosystemWallet(ecosystemWallet), "set ecosystem wallet");
  }
  for (const adminWallet of adminWallets) await wait(knt.setAdmin(adminWallet, true), `set admin ${adminWallet}`);
  for (const managerWallet of managerWallets) await wait(knt.setManager(managerWallet, true), `set manager ${managerWallet}`);
  for (const keeperWallet of keeperWallets) await wait(knt.setKeeper(keeperWallet, true), `set keeper ${keeperWallet}`);
  if (rewardPeriodSeconds !== 86400n) {
    await wait(knt.setRewardPeriodSeconds(rewardPeriodSeconds), `set reward period ${rewardPeriodSeconds}s`);
  }
  if (initialRewardFund > 0n) await wait(knt.fundRewardPool(initialRewardFund), "fund reward pool");

  let lpReceipt = null;
  let labubuPairAddress = ZERO_ADDRESS;
  if (!skipInitialLp) {
    await wait(knt.approve(routerAddress, kntLabubuLiquidityAmount), "approve KNT to router");
    await wait(labubu.approve(routerAddress, labubuLiquidityAmount), "approve LABUBU to router");
    const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
    const minKnt = (kntLabubuLiquidityAmount * (10_000n - slippageBP)) / 10_000n;
    const minLabubu = (labubuLiquidityAmount * (10_000n - slippageBP)) / 10_000n;
    lpReceipt = await wait(
      router.addLiquidity(
        proxyAddress,
        labubuAddress,
        kntLabubuLiquidityAmount,
        labubuLiquidityAmount,
        minKnt,
        minLabubu,
        deployerAddress,
        deadline
      ),
      "add KNT/LABUBU liquidity"
    );

    labubuPairAddress = await factory.getPair(proxyAddress, labubuAddress);
    if (labubuPairAddress === ZERO_ADDRESS) throw new Error("KNT/LABUBU pair was not created");
  }
  const liquidityConfigReceipt = await wait(
    knt.setLiquidityConfig(routerAddress, usdtAddress, labubuAddress, labubuPairAddress),
    "set liquidity config"
  );
  const pancakeProxyReceipt = await wait(knt.setPancakeProxy(pancakeProxyAddress), "set Pancake proxy");
  const labubuSwapIntermediateReceipt = await wait(
    knt.setLabubuSwapIntermediateToken(labubuSwapIntermediateToken),
    "set LABUBU swap intermediate"
  );

  const output = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    contractVerification: {
      enabled: false,
      sourceCodeVerification: "disabled",
    },
    upgradeability: {
      pattern: "transparent",
      implementation: implementationAddress,
      proxy: proxyAddress,
      proxyAdmin,
      proxyAdminOwner: deployerAddress,
    },
    router: routerAddress,
    pancakeProxy: pancakeProxyAddress,
    factory: factoryAddress,
    KNTAllInOne: proxyAddress,
    KNTImplementation: implementationAddress,
    ProxyAdmin: proxyAdmin,
    LABUBU: labubuAddress,
    USDT: usdtAddress,
    WBNB: labubuSwapIntermediateToken,
    deployedAtBlock: proxyReceipt.blockNumber,
    pair: labubuPairAddress,
    labubuPair: labubuPairAddress,
    labubuUsdtPair: labubuUsdtPair === ZERO_ADDRESS ? "" : labubuUsdtPair,
    labubuWbnbPair,
    labubuSwapIntermediateToken,
    rewardPeriodSeconds: rewardPeriodSeconds.toString(),
    liquidity: {
      KNT_LABUBU: {
        KNT: fmt(kntLabubuLiquidityAmount),
        LABUBU: fmt(labubuLiquidityAmount),
        skipped: skipInitialLp,
        tx: lpReceipt?.hash || "",
      },
    },
    wallets: { foundationWallet, dexSettlementWallet, projectSinkWallet, ecosystemWallet },
    roles: { admins: adminWallets, managers: managerWallets, keepers: keeperWallets },
    transactions: {
      implementationDeploy: implementationReceipt.hash,
      proxyDeploy: proxyReceipt.hash,
      addLiquidity: lpReceipt?.hash || "",
      setLiquidityConfig: liquidityConfigReceipt.hash,
      setPancakeProxy: pancakeProxyReceipt.hash,
      setLabubuSwapIntermediateToken: labubuSwapIntermediateReceipt.hash,
    },
  };

  const outDir = path.join(__dirname, "..", "deployments", "bscMainnet");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "knt-upgradeable-mainnet.json");
  fs.writeFileSync(outPath, JSON.stringify(output, jsonReplacer, 2));

  console.log(`Deployment written to ${outPath}`);
  console.log(JSON.stringify({
    proxy: proxyAddress,
    implementation: implementationAddress,
    proxyAdmin,
    labubuPair: labubuPairAddress,
    deployedAtBlock: proxyReceipt.blockNumber,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
