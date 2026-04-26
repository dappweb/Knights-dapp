const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function deploy(name, args = []) {
  const Factory = await hre.ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${name}: ${address}`);
  return contract;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const network = await hre.ethers.provider.getNetwork();

  if (network.chainId !== 97n) {
    throw new Error(`Expected BSC Testnet chainId 97, got ${network.chainId.toString()}`);
  }

  console.log(`Deploying KNT system to ${hre.network.name} from ${deployerAddress}`);

  const foundationWallet = process.env.FOUNDATION_WALLET || deployerAddress;
  const dexSettlementWallet = process.env.DEX_SETTLEMENT_WALLET || deployerAddress;

  const knt = await deploy("KNT", [deployerAddress]);

  let labubuAddress = process.env.LABUBU_TOKEN_ADDRESS || "";
  let lpTokenAddress = process.env.KNT_LABUBU_LP_ADDRESS || "";

  if (!labubuAddress) {
    const labubu = await deploy("MockERC20", ["LABUBU Test Token", "LABUBU", 18]);
    labubuAddress = await labubu.getAddress();
  }

  if (!lpTokenAddress) {
    const lp = await deploy("MockERC20", ["KNT-LABUBU LP Test Token", "KNT-LABUBU-LP", 18]);
    lpTokenAddress = await lp.getAddress();
  }

  const mining = await deploy("KNTLpMining", [await knt.getAddress(), lpTokenAddress, deployerAddress]);
  const burnQueue = await deploy("KNTBurnQueue", [await knt.getAddress(), deployerAddress]);
  const taxManager = await deploy("KNTTaxManager", [
    await knt.getAddress(),
    foundationWallet,
    await burnQueue.getAddress(),
    dexSettlementWallet,
    deployerAddress,
  ]);
  const migrationNft = await deploy("KNTMigrationNFT", [
    await knt.getAddress(),
    await mining.getAddress(),
    deployerAddress,
  ]);

  const rewardFunding = hre.ethers.parseEther(process.env.KNT_MINING_REWARD_FUND || "189000000");
  const migrationFunding = hre.ethers.parseEther(process.env.KNT_MIGRATION_FUND || "0");

  if (rewardFunding > 0n) {
    console.log(`Funding mining rewards: ${hre.ethers.formatEther(rewardFunding)} KNT`);
    const tx = await knt.approve(await mining.getAddress(), rewardFunding);
    await tx.wait();
    const fundTx = await mining.fundRewards(rewardFunding);
    await fundTx.wait();
  }

  if (migrationFunding > 0n) {
    console.log(`Funding migration NFT pool: ${hre.ethers.formatEther(migrationFunding)} KNT`);
    const tx = await knt.approve(await migrationNft.getAddress(), migrationFunding);
    await tx.wait();
    const fundTx = await migrationNft.fund(migrationFunding);
    await fundTx.wait();
  }

  const output = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployerAddress,
    KNT: await knt.getAddress(),
    LABUBU: labubuAddress,
    KNT_LABUBU_LP: lpTokenAddress,
    KNTLpMining: await mining.getAddress(),
    KNTBurnQueue: await burnQueue.getAddress(),
    KNTTaxManager: await taxManager.getAddress(),
    KNTMigrationNFT: await migrationNft.getAddress(),
    foundationWallet,
    dexSettlementWallet,
  };

  const outDir = path.join(__dirname, "..", "deployments", hre.network.name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "knt-system.json"), JSON.stringify(output, null, 2));

  console.log("\nKNT deployment written to deployments/" + hre.network.name + "/knt-system.json");
  console.log("\nFrontend env:");
  console.log(`VITE_CHAIN_ID=97`);
  console.log(`VITE_CHAIN_NAME=BSC Testnet`);
  console.log(`VITE_KNT_TOKEN_ADDRESS=${output.KNT}`);
  console.log(`VITE_KNT_LP_MINING_ADDRESS=${output.KNTLpMining}`);
  console.log(`VITE_LABUBU_TOKEN_ADDRESS=${output.LABUBU}`);
  console.log(`VITE_DEX_PAIR=${output.KNT_LABUBU_LP}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
