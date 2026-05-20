const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

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

  const balance = await hre.ethers.provider.getBalance(deployerAddress);
  if (!isLocalNetwork && balance === 0n) {
    throw new Error(`Deployer ${deployerAddress} has no test BNB for gas`);
  }

  const foundationWallet = process.env.FOUNDATION_WALLET || deployerAddress;
  const dexSettlementWallet = process.env.DEX_SETTLEMENT_WALLET || deployerAddress;
  const projectSinkWallet = process.env.PROJECT_SINK_WALLET || foundationWallet;
  const ecosystemWallet = process.env.ECOSYSTEM_WALLET || foundationWallet;
  const pancakeRouter = process.env.PANCAKE_V2_ROUTER || "0x0000000000000000000000000000000000000000";
  const usdtToken = process.env.USDT_TOKEN || "0x0000000000000000000000000000000000000000";
  const labubuToken = process.env.LABUBU_TOKEN || "0x0000000000000000000000000000000000000000";
  const adminWallets = addressList(process.env.ADMIN_WALLETS || process.env.ADMIN_WALLET);
  const managerWallets = addressList(process.env.MANAGER_WALLETS || process.env.MANAGER_WALLET);
  const keeperWallets = addressList(process.env.KEEPER_WALLETS || process.env.KEEPER_WALLET);
  const initialRewardFund = hre.ethers.parseEther(process.env.KNT_INITIAL_REWARD_FUND || "189000000");

  console.log(`Deploying KNTAllInOne to ${hre.network.name} from ${deployerAddress}`);
  console.log(`Deployer balance: ${hre.ethers.formatEther(balance)} BNB`);

  const KNTAllInOne = await hre.ethers.getContractFactory("KNTAllInOne");
  const knt = await KNTAllInOne.deploy(deployerAddress, foundationWallet, dexSettlementWallet, pancakeRouter, usdtToken, labubuToken);
  await knt.waitForDeployment();
  const kntAddress = await knt.getAddress();
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
    await wait(knt.fundRewardPool(initialRewardFund), "fund initial reward pool");
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
    KNTAllInOne: kntAddress,
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
    interaction: {
      deposit: "transfer USDT to the KNT contract; keeper scans the USDT Transfer event and calls processUsdtDeposit(account, amount, depositId, ...). The contract swaps all USDT to LABUBU, swaps half LABUBU to KNT, then adds LABUBU/KNT LP directly to the user wallet while immediately crediting KNT accounting power.",
      referral: "Admin can setReferralSignalAmount(N); A transfers N KNT to B, then B transfers N KNT to A, binding B under A. bindReferrer(A) is also supported.",
      burnQueue: "transfer KNT to 0x000000000000000000000000000000000000dEaD or call burnAndQueue(amount)",
      rewards: "keeper distributes pending rewards during processUsdtDeposit(...) or keeperDistributeRewards(accounts)",
      lpExit: "users remove wallet-held LABUBU/KNT LP on Pancake; keeper scans LP exits, calls keeperReduceUserLp/keeperReduceUserLpAmountFromSource to update accounting, and burns KNT received from the pair",
    },
  };

  const outDir = path.join(__dirname, "..", "deployments", hre.network.name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "knt-all-in-one.json"), JSON.stringify(output, null, 2));

  console.log(`\nDeployment written to deployments/${hre.network.name}/knt-all-in-one.json`);
  console.log("\nFrontend env:");
  console.log("VITE_CHAIN_ID=97");
  console.log("VITE_CHAIN_NAME=BSC Testnet");
  console.log(`VITE_KNT_ALL_IN_ONE_ADDRESS=${kntAddress}`);
  console.log(`VITE_KNT_TOKEN_ADDRESS=${kntAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
