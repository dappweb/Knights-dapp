const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function fmt(value) {
  return hre.ethers.formatEther(value);
}

function jsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

async function wait(txPromise, label) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label}: ${receipt.hash}`);
  return receipt;
}

function parseKntEvents(knt, receipt) {
  const events = [];
  for (const log of receipt.logs || []) {
    try {
      const parsed = knt.interface.parseLog(log);
      if (parsed) {
        events.push({
          name: parsed.name,
          args: Object.fromEntries(
            parsed.fragment.inputs.map((input, index) => {
              const value = parsed.args[index];
              return [input.name || String(index), typeof value === "bigint" ? value.toString() : value];
            })
          ),
        });
      }
    } catch (_error) {
      // Ignore external logs.
    }
  }
  return events;
}

async function main() {
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required");

  const deploymentPath = path.join(__dirname, "..", "deployments", "bscTestnet", "knt-pancake-test-pool.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const accounts = (deployment.migration?.accounts || []).map((item) => item.account);
  if (accounts.length === 0) throw new Error("No migrated accounts found in active deployment");

  const [keeper] = await hre.ethers.getSigners();
  const KNT = await hre.ethers.getContractFactory("KNTAllInOneUpgradeable");
  const knt = KNT.attach(deployment.KNTAllInOne).connect(keeper);

  const before = {};
  for (const account of accounts) {
    const user = await knt.users(account);
    before[account] = {
      balance: await knt.balanceOf(account),
      pendingKnt: user.pendingKnt,
      totalStaticReward: user.totalStaticReward,
      totalDynamicReward: user.totalDynamicReward,
      totalNodeReward: user.totalNodeReward,
      isNode: user.isNode,
    };
  }

  const globalsBefore = {
    currentDay: await knt.currentDay(),
    lastRewardDay: await knt.lastRewardDay(),
    rewardPool: await knt.rewardPool(),
    dynamicPool: await knt.dynamicPool(),
    accNodeRewardPerNode: await knt.accNodeRewardPerNode(),
  };

  const receipt = await wait(knt.keeperDistributeRewards(accounts), `distribute rewards to ${accounts.length} migrated accounts`);

  const after = {};
  for (const account of accounts) {
    const user = await knt.users(account);
    after[account] = {
      balance: await knt.balanceOf(account),
      pendingKnt: user.pendingKnt,
      totalStaticReward: user.totalStaticReward,
      totalDynamicReward: user.totalDynamicReward,
      totalNodeReward: user.totalNodeReward,
      isNode: user.isNode,
    };
  }

  const globalsAfter = {
    currentDay: await knt.currentDay(),
    lastRewardDay: await knt.lastRewardDay(),
    rewardPool: await knt.rewardPool(),
    dynamicPool: await knt.dynamicPool(),
    accNodeRewardPerNode: await knt.accNodeRewardPerNode(),
  };

  const accountDeltas = Object.fromEntries(accounts.map((account) => [account, {
    balanceDelta: fmt(after[account].balance - before[account].balance),
    staticDelta: fmt(after[account].totalStaticReward - before[account].totalStaticReward),
    dynamicDelta: fmt(after[account].totalDynamicReward - before[account].totalDynamicReward),
    nodeDelta: fmt(after[account].totalNodeReward - before[account].totalNodeReward),
    pendingAfter: fmt(after[account].pendingKnt),
    isNode: after[account].isNode,
  }]));

  const report = {
    network: hre.network.name,
    testedAt: new Date().toISOString(),
    contract: deployment.KNTAllInOne,
    rewardPeriodSeconds: (await knt.rewardPeriodSeconds()).toString(),
    tx: receipt.hash,
    globalsBefore: {
      currentDay: globalsBefore.currentDay.toString(),
      lastRewardDay: globalsBefore.lastRewardDay.toString(),
      rewardPool: fmt(globalsBefore.rewardPool),
      dynamicPool: fmt(globalsBefore.dynamicPool),
      accNodeRewardPerNode: fmt(globalsBefore.accNodeRewardPerNode),
    },
    globalsAfter: {
      currentDay: globalsAfter.currentDay.toString(),
      lastRewardDay: globalsAfter.lastRewardDay.toString(),
      rewardPool: fmt(globalsAfter.rewardPool),
      dynamicPool: fmt(globalsAfter.dynamicPool),
      accNodeRewardPerNode: fmt(globalsAfter.accNodeRewardPerNode),
    },
    emissionUsed: fmt(globalsBefore.rewardPool - globalsAfter.rewardPool),
    events: parseKntEvents(knt, receipt),
    accountDeltas,
    status: "PASS",
  };

  const outPath = path.join(__dirname, "..", "deployments", "bscTestnet", "knt-upgradeable-10min-reward-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, jsonReplacer, 2));
  console.log(JSON.stringify(report, jsonReplacer, 2));
  console.log(`Reward report written to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
