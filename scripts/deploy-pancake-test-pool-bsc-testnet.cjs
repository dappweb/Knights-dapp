const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const DEFAULT_BSC_TESTNET_PANCAKE_V2_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ROUTER_ABI = [
  "function factory() external pure returns (address)",
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
];

async function wait(txPromise, label) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label}: ${receipt.hash}`);
  return receipt;
}

function addressList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function requireContract(address, label) {
  const code = await hre.ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(`${label} has no contract code at ${address}`);
  }
}

async function readTokenMeta(token, fallbackSymbol = "TOKEN") {
  let symbol = fallbackSymbol;
  let decimals = 18;
  try {
    symbol = await token.symbol();
  } catch (_error) {
    symbol = fallbackSymbol;
  }
  try {
    decimals = Number(await token.decimals());
  } catch (_error) {
    decimals = 18;
  }
  return { symbol, decimals };
}

async function main() {
  const isLocalNetwork = hre.network.name === "hardhat" || hre.network.name === "localhost";
  if (!isLocalNetwork && !process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required to deploy to BSC Testnet");
  }

  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const network = await hre.ethers.provider.getNetwork();

  if (!isLocalNetwork && network.chainId !== 97n) {
    throw new Error(`Expected BSC Testnet chainId 97, got ${network.chainId.toString()}`);
  }

  const routerAddress = process.env.PANCAKE_V2_ROUTER || DEFAULT_BSC_TESTNET_PANCAKE_V2_ROUTER;
  if (!isLocalNetwork) {
    await requireContract(routerAddress, "Pancake V2 Router");
  }

  const foundationWallet = process.env.FOUNDATION_WALLET || deployerAddress;
  const dexSettlementWallet = process.env.DEX_SETTLEMENT_WALLET || deployerAddress;
  const projectSinkWallet = process.env.PROJECT_SINK_WALLET || foundationWallet;
  const ecosystemWallet = process.env.ECOSYSTEM_WALLET || foundationWallet;
  const adminWallets = addressList(process.env.ADMIN_WALLETS || process.env.ADMIN_WALLET);
  const managerWallets = addressList(process.env.MANAGER_WALLETS || process.env.MANAGER_WALLET);
  const keeperWallets = addressList(process.env.KEEPER_WALLETS || process.env.KEEPER_WALLET);
  const configuredUsdtAddress = process.env.USDT_TOKEN || process.env.USDT_TOKEN_ADDRESS || "";
  const initialRewardFund = hre.ethers.parseEther(process.env.KNT_INITIAL_REWARD_FUND || "189000000");
  const kntLabubuLiquidityAmount = hre.ethers.parseEther(process.env.KNT_LABUBU_LP_KNT_AMOUNT || process.env.KNT_LP_AMOUNT || "200000");
  const labubuLiquidityAmount = hre.ethers.parseEther(process.env.KNT_LABUBU_LP_LABUBU_AMOUNT || process.env.LABUBU_LP_AMOUNT || "600000");
  const labubuUsdtLiquidityAmount = hre.ethers.parseEther(process.env.LABUBU_USDT_LP_LABUBU_AMOUNT || "600000");
  const labubuUsdtUsdtLiquidityAmount = hre.ethers.parseEther(process.env.LABUBU_USDT_LP_USDT_AMOUNT || "600000");
  const labubuMintAmount = hre.ethers.parseEther(process.env.LABUBU_MINT_AMOUNT || "1500000");
  const usdtMintAmount = hre.ethers.parseEther(process.env.USDT_MINT_AMOUNT || "1500000");
  const neededLabubu = labubuLiquidityAmount + labubuUsdtLiquidityAmount;
  const neededUsdt = labubuUsdtUsdtLiquidityAmount;

  if (labubuMintAmount < neededLabubu) {
    throw new Error(`LABUBU_MINT_AMOUNT is insufficient. Need ${hre.ethers.formatEther(neededLabubu)}, configured ${hre.ethers.formatEther(labubuMintAmount)}`);
  }
  if (!configuredUsdtAddress && usdtMintAmount < neededUsdt) {
    throw new Error(`USDT_MINT_AMOUNT is insufficient. Need ${hre.ethers.formatEther(neededUsdt)}, configured ${hre.ethers.formatEther(usdtMintAmount)}`);
  }

  console.log(`Deploying KNT/LABUBU and LABUBU/USDT Pancake test pools to ${hre.network.name} from ${deployerAddress}`);
  console.log(`Router: ${routerAddress}`);

  const TestToken = await hre.ethers.getContractFactory("TestToken");
  const labubu = await TestToken.deploy("LABUBU Test Token", "LABUBU", 18, deployerAddress);
  await labubu.waitForDeployment();
  const labubuAddress = await labubu.getAddress();
  console.log(`LABUBU Test Token: ${labubuAddress}`);

  let usdt;
  let usdtAddress;
  let usdtSource;
  if (configuredUsdtAddress) {
    usdtAddress = hre.ethers.getAddress(configuredUsdtAddress);
    await requireContract(usdtAddress, "Configured USDT token");
    usdt = new hre.ethers.Contract(usdtAddress, ERC20_ABI, deployer);
    const meta = await readTokenMeta(usdt, "USDT");
    if (meta.decimals !== 18) {
      throw new Error(`Configured USDT ${usdtAddress} has ${meta.decimals} decimals; this script expects 18`);
    }
    usdtSource = "configured";
    console.log(`USDT Token (${meta.symbol}, configured): ${usdtAddress}`);
  } else {
    usdt = await TestToken.deploy("Tether USD Test Token", "USDT", 18, deployerAddress);
    await usdt.waitForDeployment();
    usdtAddress = await usdt.getAddress();
    usdtSource = "deployed";
    console.log(`USDT Test Token: ${usdtAddress}`);
  }

  const KNTAllInOne = await hre.ethers.getContractFactory("KNTAllInOne");
  const knt = await KNTAllInOne.deploy(deployerAddress, foundationWallet, dexSettlementWallet, routerAddress, usdtAddress, labubuAddress);
  await knt.waitForDeployment();
  const kntAddress = await knt.getAddress();
  const kntDeployTx = knt.deploymentTransaction();
  const kntDeployReceipt = kntDeployTx ? await kntDeployTx.wait() : null;
  console.log(`KNTAllInOne: ${kntAddress}`);

  if (projectSinkWallet.toLowerCase() !== foundationWallet.toLowerCase()) {
    await wait(knt.setProjectSinkWallet(projectSinkWallet), "set project sink wallet");
  }

  if (ecosystemWallet.toLowerCase() !== foundationWallet.toLowerCase()) {
    await wait(knt.setEcosystemWallet(ecosystemWallet), "set ecosystem wallet");
  }

  for (const adminWallet of adminWallets) {
    await wait(knt.setAdmin(adminWallet, true), `set admin ${adminWallet}`);
  }

  for (const managerWallet of managerWallets) {
    await wait(knt.setManager(managerWallet, true), `set manager ${managerWallet}`);
  }

  for (const keeperWallet of keeperWallets) {
    await wait(knt.setKeeper(keeperWallet, true), `set keeper ${keeperWallet}`);
  }

  if (initialRewardFund > 0n) {
    await wait(knt.fundRewardPool(initialRewardFund), "fund KNT reward pool");
  }

  if (labubuMintAmount > 0n) {
    await wait(labubu.mint(deployerAddress, labubuMintAmount), "mint LABUBU");
  }

  if (usdtSource === "deployed" && usdtMintAmount > 0n) {
    await wait(usdt.mint(deployerAddress, usdtMintAmount), "mint USDT");
  } else if (usdtSource === "configured") {
    const availableUsdt = await usdt.balanceOf(deployerAddress);
    if (availableUsdt < neededUsdt) {
      throw new Error(`Configured USDT balance is insufficient. Need ${hre.ethers.formatEther(neededUsdt)}, have ${hre.ethers.formatEther(availableUsdt)}`);
    }
    console.log(`Configured USDT balance: ${hre.ethers.formatEther(availableUsdt)}`);
  }

  if (isLocalNetwork) {
    console.log("Skipping Pancake addLiquidity on local hardhat network.");
    return;
  }

  const router = new hre.ethers.Contract(routerAddress, ROUTER_ABI, deployer);
  const factoryAddress = await router.factory();
  await requireContract(factoryAddress, "Pancake V2 Factory");
  console.log(`Factory: ${factoryAddress}`);

  await wait(knt.approve(routerAddress, kntLabubuLiquidityAmount), "approve KNT to router");
  await wait(labubu.approve(routerAddress, labubuLiquidityAmount + labubuUsdtLiquidityAmount), "approve LABUBU to router");
  await wait(usdt.approve(routerAddress, labubuUsdtUsdtLiquidityAmount), "approve USDT to router");

  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const slippageBP = BigInt(process.env.LP_SLIPPAGE_BP || "50");
  const amountKntLabubuMin = (kntLabubuLiquidityAmount * (10_000n - slippageBP)) / 10_000n;
  const amountLabubuMin = (labubuLiquidityAmount * (10_000n - slippageBP)) / 10_000n;
  const amountLabubuUsdtMin = (labubuUsdtLiquidityAmount * (10_000n - slippageBP)) / 10_000n;
  const amountLabubuUsdtUsdtMin = (labubuUsdtUsdtLiquidityAmount * (10_000n - slippageBP)) / 10_000n;

  const addLabubuReceipt = await wait(
    router.addLiquidity(
      kntAddress,
      labubuAddress,
      kntLabubuLiquidityAmount,
      labubuLiquidityAmount,
      amountKntLabubuMin,
      amountLabubuMin,
      deployerAddress,
      deadline
    ),
    "add KNT/LABUBU liquidity"
  );

  const factory = new hre.ethers.Contract(factoryAddress, FACTORY_ABI, deployer);
  const labubuPairAddress = await factory.getPair(kntAddress, labubuAddress);
  if (labubuPairAddress === ZERO_ADDRESS) {
    throw new Error("KNT/LABUBU pair was not created");
  }
  console.log(`KNT/LABUBU Pair: ${labubuPairAddress}`);
  await wait(knt.setLiquidityConfig(routerAddress, usdtAddress, labubuAddress, labubuPairAddress), "set KNT liquidity config");

  const addLabubuUsdtReceipt = await wait(
    router.addLiquidity(
      labubuAddress,
      usdtAddress,
      labubuUsdtLiquidityAmount,
      labubuUsdtUsdtLiquidityAmount,
      amountLabubuUsdtMin,
      amountLabubuUsdtUsdtMin,
      deployerAddress,
      deadline
    ),
    "add LABUBU/USDT liquidity"
  );

  const labubuUsdtPairAddress = await factory.getPair(labubuAddress, usdtAddress);
  if (labubuUsdtPairAddress === ZERO_ADDRESS) {
    throw new Error("LABUBU/USDT pair was not created");
  }
  console.log(`LABUBU/USDT Pair: ${labubuUsdtPairAddress}`);

  if (dexSettlementWallet.toLowerCase() === deployerAddress.toLowerCase()) {
    await wait(knt.approve(kntAddress, hre.ethers.MaxUint256), "approve KNT to KNT contract for deposit swaps");
  } else {
    console.log(`WARNING: dexSettlementWallet ${dexSettlementWallet} must approve ${kntAddress} for KNT before processUsdtDeposit can add LP.`);
  }

  const output = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    contractVerification: {
      enabled: false,
      sourceCodeVerification: "disabled",
    },
    router: routerAddress,
    factory: factoryAddress,
    KNTAllInOne: kntAddress,
    LABUBU: labubuAddress,
    USDT: usdtAddress,
    usdtSource,
    deployedAtBlock: kntDeployReceipt?.blockNumber || null,
    pair: labubuPairAddress,
    labubuPair: labubuPairAddress,
    labubuUsdtPair: labubuUsdtPairAddress,
    liquidity: {
      KNT_LABUBU: {
        KNT: hre.ethers.formatEther(kntLabubuLiquidityAmount),
        LABUBU: hre.ethers.formatEther(labubuLiquidityAmount),
        tx: addLabubuReceipt.hash,
      },
      LABUBU_USDT: {
        LABUBU: hre.ethers.formatEther(labubuUsdtLiquidityAmount),
        USDT: hre.ethers.formatEther(labubuUsdtUsdtLiquidityAmount),
        tx: addLabubuUsdtReceipt.hash,
      },
    },
    wallets: {
      foundationWallet,
      dexSettlementWallet,
      projectSinkWallet,
      ecosystemWallet,
    },
    roles: {
      admins: adminWallets,
      managers: managerWallets,
      keepers: keeperWallets,
    },
  };

  const outDir = path.join(__dirname, "..", "deployments", hre.network.name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "knt-pancake-test-pool.json"), JSON.stringify(output, null, 2));

  console.log(`\nDeployment written to deployments/${hre.network.name}/knt-pancake-test-pool.json`);
  console.log("\nFrontend env:");
  console.log("VITE_CHAIN_ID=97");
  console.log("VITE_CHAIN_NAME=BSC Testnet");
  console.log(`VITE_KNT_TOKEN_ADDRESS=${kntAddress}`);
  console.log(`VITE_LABUBU_TOKEN_ADDRESS=${labubuAddress}`);
  console.log(`VITE_USDT_TOKEN_ADDRESS=${usdtAddress}`);
  console.log(`VITE_PANCAKE_V2_ROUTER=${routerAddress}`);
  console.log(`VITE_PANCAKE_V2_FACTORY=${factoryAddress}`);
  console.log(`VITE_KNT_LABUBU_PAIR=${labubuPairAddress}`);
  console.log(`VITE_LABUBU_USDT_PAIR=${labubuUsdtPairAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
