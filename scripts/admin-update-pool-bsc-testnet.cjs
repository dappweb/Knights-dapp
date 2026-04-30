const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required");
  }

  const deploymentPath = path.join(__dirname, "..", "deployments", "bscTestnet", "knt-pancake-test-pool.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  const [admin] = await hre.ethers.getSigners();
  const KNTAllInOne = await hre.ethers.getContractFactory("KNTAllInOne");
  const knt = KNTAllInOne.attach(deployment.KNTAllInOne).connect(admin);

  const before = await knt.lastRewardDay();
  const tx = await knt.adminUpdatePool();
  const receipt = await tx.wait();
  const after = await knt.lastRewardDay();

  console.log(JSON.stringify({
    contract: deployment.KNTAllInOne,
    admin: await admin.getAddress(),
    tx: receipt.hash,
    lastRewardDayBefore: before.toString(),
    lastRewardDayAfter: after.toString(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
