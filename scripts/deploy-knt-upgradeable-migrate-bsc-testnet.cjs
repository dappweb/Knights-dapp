const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const DEFAULT_BSC_TESTNET_PANCAKE_V2_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ERC1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const ROUTER_ABI = [
  "function factory() external view returns (address)",
  "function addLiquidity(address tokenA,address tokenB,uint amountADesired,uint amountBDesired,uint amountAMin,uint amountBMin,address to,uint deadline) external returns (uint amountA,uint amountB,uint liquidity)",
];

const FACTORY_ABI = ["function getPair(address tokenA,address tokenB) external view returns (address pair)"];

const ERC20_ABI = [
  "function approve(address spender,uint256 value) returns(bool)",
  "function balanceOf(address account) view returns(uint256)",
  "function transfer(address to,uint256 value) returns(bool)",
  "function symbol() view returns(string)",
  "function decimals() view returns(uint8)",
];

const OLD_KNT_ABI = [
  "event Deposited(address indexed user,uint256 amount,uint256 lpValueUsdt,uint256 addedPower)",
  "event UsdtDeposited(address indexed user,uint256 usdtAmount,uint256 kntUsed,uint256 labubuUsed,uint256 lpAmount,uint256 lpValueUsdt)",
  "event ReferrerBound(address indexed user,address indexed referrer)",
  "function balanceOf(address account) view returns(uint256)",
  "function referrerOf(address account) view returns(address)",
  "function users(address account) view returns(bool registered,address referrer,uint256 depositAmount,uint256 lpValueUsdt,uint256 power,uint256 lastPowerUpdateDay,uint256 rewardDebt,uint256 pendingKnt,uint256 directLpValueUsdt,uint256 directEffectiveCount,bool isNode,uint256 nodeRewardDebt,uint256 totalStaticReward,uint256 totalDynamicReward,uint256 totalNodeReward)",
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

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, jsonReplacer, 2));
}

function addressList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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

function collectKnownAccounts(deploymentsDir) {
  const accounts = new Set();
  const files = fs.readdirSync(deploymentsDir).filter((name) => name.endsWith(".json"));
  for (const file of files) {
    const json = readJson(path.join(deploymentsDir, file));
    if (!json || !json.testAccounts) continue;
    for (const address of Object.values(json.testAccounts)) {
      if (hre.ethers.isAddress(address)) accounts.add(hre.ethers.getAddress(address));
    }
  }
  return [...accounts];
}

async function collectEventAccounts(contractAddress, fromBlock, toBlock, chunkSize) {
  const iface = new hre.ethers.Interface(OLD_KNT_ABI);
  const eventNames = ["Deposited", "UsdtDeposited", "ReferrerBound"];
  const accounts = new Set();

  for (const eventName of eventNames) {
    const topic = iface.getEvent(eventName).topicHash;
    for (let from = fromBlock; from <= toBlock; from += chunkSize) {
      const to = Math.min(toBlock, from + chunkSize - 1);
      const logs = await hre.ethers.provider.getLogs({
        address: contractAddress,
        fromBlock: from,
        toBlock: to,
        topics: [topic],
      });
      for (const log of logs) {
        const parsed = iface.parseLog(log);
        if (parsed?.args?.user && hre.ethers.isAddress(parsed.args.user)) {
          accounts.add(hre.ethers.getAddress(parsed.args.user));
        }
        if (parsed?.args?.referrer && hre.ethers.isAddress(parsed.args.referrer)) {
          accounts.add(hre.ethers.getAddress(parsed.args.referrer));
        }
      }
    }
  }

  return [...accounts];
}

function proxyAdminFromStorage(rawStorage) {
  return hre.ethers.getAddress(`0x${rawStorage.slice(-40)}`);
}

async function main() {
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required");

  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 97n) throw new Error(`Expected BSC Testnet chainId 97, got ${network.chainId}`);

  const deploymentsDir = path.join(__dirname, "..", "deployments", "bscTestnet");
  const oldDeploymentPath = path.join(deploymentsDir, "knt-pancake-test-pool.json");
  const oldDeployment = readJson(oldDeploymentPath);
  if (!oldDeployment?.KNTAllInOne || !oldDeployment?.LABUBU || !oldDeployment?.USDT) {
    throw new Error(`Missing old deployment at ${oldDeploymentPath}`);
  }

  const routerAddress = process.env.PANCAKE_V2_ROUTER || oldDeployment.router || DEFAULT_BSC_TESTNET_PANCAKE_V2_ROUTER;
  const foundationWallet = process.env.FOUNDATION_WALLET || oldDeployment.wallets?.foundationWallet || deployerAddress;
  const dexSettlementWallet = process.env.DEX_SETTLEMENT_WALLET || oldDeployment.wallets?.dexSettlementWallet || deployerAddress;
  const projectSinkWallet = process.env.PROJECT_SINK_WALLET || oldDeployment.wallets?.projectSinkWallet || foundationWallet;
  const ecosystemWallet = process.env.ECOSYSTEM_WALLET || oldDeployment.wallets?.ecosystemWallet || foundationWallet;
  const adminWallets = addressList(process.env.ADMIN_WALLETS || process.env.ADMIN_WALLET);
  const managerWallets = addressList(process.env.MANAGER_WALLETS || process.env.MANAGER_WALLET);
  const keeperWallets = addressList(process.env.KEEPER_WALLETS || process.env.KEEPER_WALLET);
  const configuredSwapIntermediate = process.env.LABUBU_SWAP_INTERMEDIATE_TOKEN || oldDeployment.labubuSwapIntermediateToken || "";
  const labubuSwapIntermediateToken = configuredSwapIntermediate ? hre.ethers.getAddress(configuredSwapIntermediate) : ZERO_ADDRESS;
  const rewardPeriodSeconds = BigInt(process.env.KNT_REWARD_PERIOD_SECONDS || "600");
  const initialRewardFund = ether(process.env.KNT_INITIAL_REWARD_FUND || "189000000");
  const kntLabubuLiquidityAmount = ether(process.env.KNT_UPGRADEABLE_LP_KNT_AMOUNT || "100000");
  const labubuLiquidityAmount = ether(process.env.KNT_UPGRADEABLE_LP_LABUBU_AMOUNT || "300000");
  const slippageBP = BigInt(process.env.LP_SLIPPAGE_BP || "50");
  const updateActiveDeployment = String(process.env.UPDATE_ACTIVE_DEPLOYMENT || "true").toLowerCase() !== "false";

  await requireContract(routerAddress, "Pancake V2 Router");
  await requireContract(oldDeployment.LABUBU, "LABUBU token");
  await requireContract(oldDeployment.USDT, "USDT token");

  const labubu = new hre.ethers.Contract(oldDeployment.LABUBU, ERC20_ABI, deployer);
  const availableLabubu = await labubu.balanceOf(deployerAddress);
  if (availableLabubu < labubuLiquidityAmount) {
    throw new Error(`Insufficient LABUBU. Need ${fmt(labubuLiquidityAmount)}, have ${fmt(availableLabubu)}`);
  }

  const KNTUpgradeable = await hre.ethers.getContractFactory("KNTAllInOneUpgradeable");
  const implementation = await KNTUpgradeable.deploy();
  await implementation.waitForDeployment();
  const implementationAddress = await implementation.getAddress();
  console.log(`KNTAllInOneUpgradeable implementation: ${implementationAddress}`);

  const initData = KNTUpgradeable.interface.encodeFunctionData("initialize", [
    deployerAddress,
    foundationWallet,
    dexSettlementWallet,
    routerAddress,
    oldDeployment.USDT,
    oldDeployment.LABUBU,
  ]);
  const TransparentUpgradeableProxy = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");
  const proxy = await TransparentUpgradeableProxy.deploy(implementationAddress, deployerAddress, initData);
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
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

  const router = new hre.ethers.Contract(routerAddress, ROUTER_ABI, deployer);
  const factoryAddress = await router.factory();
  const factory = new hre.ethers.Contract(factoryAddress, FACTORY_ABI, deployer);

  await wait(knt.approve(routerAddress, kntLabubuLiquidityAmount), "approve KNT to router");
  await wait(labubu.approve(routerAddress, labubuLiquidityAmount), "approve LABUBU to router");
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const minKnt = (kntLabubuLiquidityAmount * (10_000n - slippageBP)) / 10_000n;
  const minLabubu = (labubuLiquidityAmount * (10_000n - slippageBP)) / 10_000n;
  const lpReceipt = await wait(
    router.addLiquidity(
      proxyAddress,
      oldDeployment.LABUBU,
      kntLabubuLiquidityAmount,
      labubuLiquidityAmount,
      minKnt,
      minLabubu,
      deployerAddress,
      deadline
    ),
    "add upgradeable KNT/LABUBU liquidity"
  );
  const labubuPairAddress = await factory.getPair(proxyAddress, oldDeployment.LABUBU);
  if (labubuPairAddress === ZERO_ADDRESS) throw new Error("Upgradeable KNT/LABUBU pair was not created");
  await wait(knt.setLiquidityConfig(routerAddress, oldDeployment.USDT, oldDeployment.LABUBU, labubuPairAddress), "set liquidity config");
  if (labubuSwapIntermediateToken !== ZERO_ADDRESS) {
    await wait(knt.setLabubuSwapIntermediateToken(labubuSwapIntermediateToken), "set LABUBU swap intermediate");
  }

  const oldKnt = new hre.ethers.Contract(oldDeployment.KNTAllInOne, OLD_KNT_ABI, hre.ethers.provider);
  const knownAccounts = new Set(collectKnownAccounts(deploymentsDir));
  if (String(process.env.MIGRATION_DISABLE_EVENT_SCAN || "false").toLowerCase() !== "true") {
    const latestBlock = await hre.ethers.provider.getBlockNumber();
    const fromBlock = Number(process.env.MIGRATION_FROM_BLOCK || oldDeployment.deployedAtBlock || 0);
    const toBlock = Number(process.env.MIGRATION_TO_BLOCK || latestBlock);
    const chunkSize = Number(process.env.MIGRATION_LOG_CHUNK_BLOCKS || 100);
    for (const account of await collectEventAccounts(oldDeployment.KNTAllInOne, fromBlock, toBlock, chunkSize)) {
      knownAccounts.add(account);
    }
  }
  const oldUserRows = [];
  for (const account of knownAccounts) {
    const user = await oldKnt.users(account);
    if (!user.registered || user.lpValueUsdt === 0n) continue;
    const referrer = await oldKnt.referrerOf(account);
    oldUserRows.push({
      account,
      oldLpValueUsdt: user.lpValueUsdt,
      oldKntBalance: await oldKnt.balanceOf(account),
      referrer: referrer === ZERO_ADDRESS ? deployerAddress : referrer,
    });
  }

  const pairToken = new hre.ethers.Contract(labubuPairAddress, ERC20_ABI, deployer);
  const lpReserve = await pairToken.balanceOf(deployerAddress);
  const totalOldLpValue = oldUserRows.reduce((sum, row) => sum + row.oldLpValueUsdt, 0n);
  const importAmounts = [];
  let assignedLp = 0n;
  for (let i = 0; i < oldUserRows.length; i++) {
    const amount = i === oldUserRows.length - 1
      ? lpReserve - assignedLp
      : (lpReserve * oldUserRows[i].oldLpValueUsdt) / totalOldLpValue;
    importAmounts.push(amount);
    assignedLp += amount;
  }

  if (oldUserRows.length > 0) {
    await wait(pairToken.transfer(proxyAddress, lpReserve), "reserve migrated LP in new contract");
    await wait(
      knt.adminImportDeposits(
        oldUserRows.map((row) => row.account),
        importAmounts,
        oldUserRows.map((row) => row.oldLpValueUsdt),
        oldUserRows.map((row) => row.referrer)
      ),
      `import ${oldUserRows.length} migrated deposits`
    );

    for (const row of oldUserRows) {
      if (row.oldKntBalance > 0n) {
        await wait(knt.transfer(row.account, row.oldKntBalance), `migrate KNT balance ${row.account}`);
      }
    }
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
    upgradeability: {
      pattern: "transparent",
      implementation: implementationAddress,
      proxy: proxyAddress,
      proxyAdmin,
      proxyAdminOwner: deployerAddress,
    },
    router: routerAddress,
    factory: factoryAddress,
    KNTAllInOne: proxyAddress,
    KNTImplementation: implementationAddress,
    ProxyAdmin: proxyAdmin,
    LABUBU: oldDeployment.LABUBU,
    USDT: oldDeployment.USDT,
    usdtSource: oldDeployment.usdtSource || "configured",
    deployedAtBlock: lpReceipt.blockNumber,
    pair: labubuPairAddress,
    labubuPair: labubuPairAddress,
    labubuUsdtPair: oldDeployment.labubuUsdtPair,
    labubuSwapIntermediateToken: labubuSwapIntermediateToken === ZERO_ADDRESS ? "" : labubuSwapIntermediateToken,
    labubuWbnbPair: oldDeployment.labubuWbnbPair || "",
    wbnbUsdtPair: oldDeployment.wbnbUsdtPair || "",
    rewardPeriodSeconds: rewardPeriodSeconds.toString(),
    liquidity: {
      KNT_LABUBU: {
        KNT: fmt(kntLabubuLiquidityAmount),
        LABUBU: fmt(labubuLiquidityAmount),
        lpReservedInContract: fmt(lpReserve),
        tx: lpReceipt.hash,
      },
      LABUBU_USDT: oldDeployment.liquidity?.LABUBU_USDT || null,
    },
    migration: {
      sourceContract: oldDeployment.KNTAllInOne,
      migratedAccounts: oldUserRows.length,
      totalImportedLpValueUsdt: fmt(totalOldLpValue),
      totalReservedLpAmount: fmt(lpReserve),
      oldPausedOnChain: false,
      oldPauseNote: "Legacy contract has no pause switch; frontend and keeper deployment config now point at the proxy.",
      accounts: oldUserRows.map((row, index) => ({
        account: row.account,
        referrer: row.referrer,
        lpValueUsdt: fmt(row.oldLpValueUsdt),
        importedLpAmount: fmt(importAmounts[index]),
        migratedKntBalance: fmt(row.oldKntBalance),
      })),
    },
    wallets: { foundationWallet, dexSettlementWallet, projectSinkWallet, ecosystemWallet },
    roles: { admins: adminWallets, managers: managerWallets, keepers: keeperWallets },
    legacy: {
      KNTAllInOne: oldDeployment.KNTAllInOne,
      labubuPair: oldDeployment.labubuPair,
    },
  };

  const upgradeablePath = path.join(deploymentsDir, "knt-upgradeable-test-pool.json");
  writeJson(upgradeablePath, output);
  writeJson(path.join(deploymentsDir, "knt-pancake-legacy-test-pool.json"), {
    ...oldDeployment,
    supersededBy: proxyAddress,
    supersededAt: output.deployedAt,
  });
  if (updateActiveDeployment) writeJson(oldDeploymentPath, output);

  console.log(`Deployment written to ${upgradeablePath}`);
  if (updateActiveDeployment) console.log(`Active deployment updated at ${oldDeploymentPath}`);
  console.log(JSON.stringify({
    proxy: proxyAddress,
    implementation: implementationAddress,
    proxyAdmin,
    pair: labubuPairAddress,
    rewardPeriodSeconds: rewardPeriodSeconds.toString(),
    migratedAccounts: oldUserRows.length,
    activeDeploymentUpdated: updateActiveDeployment,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
