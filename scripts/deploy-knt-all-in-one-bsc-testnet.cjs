const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function wait(txPromise, label) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label}: ${receipt.hash}`);
  return receipt;
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
  const initialRewardFund = hre.ethers.parseEther(process.env.KNT_INITIAL_REWARD_FUND || "189000000");

  console.log(`Deploying KNTAllInOne to ${hre.network.name} from ${deployerAddress}`);
  console.log(`Deployer balance: ${hre.ethers.formatEther(balance)} BNB`);

  const KNTAllInOne = await hre.ethers.getContractFactory("KNTAllInOne");
  const knt = await KNTAllInOne.deploy(deployerAddress, foundationWallet, dexSettlementWallet);
  await knt.waitForDeployment();
  const kntAddress = await knt.getAddress();
  console.log(`KNTAllInOne: ${kntAddress}`);

  if (initialRewardFund > 0n) {
    await wait(knt.fundRewardPool(initialRewardFund), "fund initial reward pool");
  }

  const output = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    KNTAllInOne: kntAddress,
    wallets: {
      foundationWallet,
      dexSettlementWallet,
    },
    interaction: {
      deposit: `transfer KNT to ${kntAddress}; the contract records the sender's deposit automatically`,
      referral: "A transfers 0 KNT to B, then B transfers 0 KNT to A; B is bound under A",
      burnQueue: "transfer KNT to 0x000000000000000000000000000000000000dEaD or call burnAndQueue(amount)",
      claim: "call claim()",
      withdrawDeposit: "call withdrawDeposit(amount, lpValueUsdt)",
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
