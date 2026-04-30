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

async function wait(txPromise, label) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label}: ${receipt.hash}`);
  return receipt;
}

async function requireContract(address, label) {
  const code = await hre.ethers.provider.getCode(address);
  if (code === "0x") {
    throw new Error(`${label} has no contract code at ${address}`);
  }
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
  const initialRewardFund = hre.ethers.parseEther(process.env.KNT_INITIAL_REWARD_FUND || "189000000");
  const kntLiquidityAmount = hre.ethers.parseEther(process.env.KNT_LP_AMOUNT || "200000");
  const labubuLiquidityAmount = hre.ethers.parseEther(process.env.LABUBU_LP_AMOUNT || "600000");
  const labubuMintAmount = hre.ethers.parseEther(process.env.LABUBU_MINT_AMOUNT || "1000000");

  console.log(`Deploying KNT/LABUBU Pancake test pool to ${hre.network.name} from ${deployerAddress}`);
  console.log(`Router: ${routerAddress}`);

  const KNTAllInOne = await hre.ethers.getContractFactory("KNTAllInOne");
  const knt = await KNTAllInOne.deploy(deployerAddress, foundationWallet, dexSettlementWallet);
  await knt.waitForDeployment();
  const kntAddress = await knt.getAddress();
  console.log(`KNTAllInOne: ${kntAddress}`);

  const TestToken = await hre.ethers.getContractFactory("TestToken");
  const labubu = await TestToken.deploy("LABUBU Test Token", "LABUBU", 18, deployerAddress);
  await labubu.waitForDeployment();
  const labubuAddress = await labubu.getAddress();
  console.log(`LABUBU Test Token: ${labubuAddress}`);

  if (initialRewardFund > 0n) {
    await wait(knt.fundRewardPool(initialRewardFund), "fund KNT reward pool");
  }

  if (labubuMintAmount > 0n) {
    await wait(labubu.mint(deployerAddress, labubuMintAmount), "mint LABUBU");
  }

  if (isLocalNetwork) {
    console.log("Skipping Pancake addLiquidity on local hardhat network.");
    return;
  }

  const router = new hre.ethers.Contract(routerAddress, ROUTER_ABI, deployer);
  const factoryAddress = await router.factory();
  await requireContract(factoryAddress, "Pancake V2 Factory");
  console.log(`Factory: ${factoryAddress}`);

  await wait(knt.approve(routerAddress, kntLiquidityAmount), "approve KNT to router");
  await wait(labubu.approve(routerAddress, labubuLiquidityAmount), "approve LABUBU to router");

  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const slippageBP = BigInt(process.env.LP_SLIPPAGE_BP || "50");
  const amountKntMin = (kntLiquidityAmount * (10_000n - slippageBP)) / 10_000n;
  const amountLabubuMin = (labubuLiquidityAmount * (10_000n - slippageBP)) / 10_000n;

  const addReceipt = await wait(
    router.addLiquidity(
      kntAddress,
      labubuAddress,
      kntLiquidityAmount,
      labubuLiquidityAmount,
      amountKntMin,
      amountLabubuMin,
      deployerAddress,
      deadline
    ),
    "add KNT/LABUBU liquidity"
  );

  const factory = new hre.ethers.Contract(factoryAddress, FACTORY_ABI, deployer);
  const pairAddress = await factory.getPair(kntAddress, labubuAddress);
  if (pairAddress === ZERO_ADDRESS) {
    throw new Error("Pair was not created");
  }
  console.log(`KNT/LABUBU Pair: ${pairAddress}`);

  const output = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    router: routerAddress,
    factory: factoryAddress,
    KNTAllInOne: kntAddress,
    LABUBU: labubuAddress,
    pair: pairAddress,
    liquidity: {
      KNT: hre.ethers.formatEther(kntLiquidityAmount),
      LABUBU: hre.ethers.formatEther(labubuLiquidityAmount),
      tx: addReceipt.hash,
    },
    wallets: {
      foundationWallet,
      dexSettlementWallet,
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
  console.log(`VITE_PANCAKE_V2_ROUTER=${routerAddress}`);
  console.log(`VITE_PANCAKE_V2_FACTORY=${factoryAddress}`);
  console.log(`VITE_KNT_LABUBU_PAIR=${pairAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
