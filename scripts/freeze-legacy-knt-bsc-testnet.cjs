const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const LEGACY_KNT_ABI = [
  "function owner() view returns(address)",
  "function pancakeRouter() view returns(address)",
  "function usdtToken() view returns(address)",
  "function labubuToken() view returns(address)",
  "function labubuKntPair() view returns(address)",
  "function setLiquidityConfig(address,address,address,address)",
];

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

async function wait(txPromise, label) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label}: ${receipt.hash}`);
  return receipt;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPair(legacyKnt, expectedPair) {
  let pair = await legacyKnt.labubuKntPair();
  for (let attempt = 0; attempt < 8 && pair.toLowerCase() !== expectedPair.toLowerCase(); attempt++) {
    await sleep(1500);
    pair = await legacyKnt.labubuKntPair();
  }
  if (pair.toLowerCase() !== expectedPair.toLowerCase()) {
    throw new Error(`Legacy pair did not update. expected=${expectedPair}, actual=${pair}`);
  }
  return pair;
}

async function main() {
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required");

  const deploymentsDir = path.join(__dirname, "..", "deployments", "bscTestnet");
  const activePath = path.join(deploymentsDir, "knt-pancake-test-pool.json");
  const legacyPath = path.join(deploymentsDir, "knt-pancake-legacy-test-pool.json");
  const active = readJson(activePath);
  const legacy = readJson(legacyPath);
  if (!active?.KNTAllInOne || !legacy?.KNTAllInOne) {
    throw new Error("Missing active or legacy deployment JSON");
  }
  if (active.KNTAllInOne.toLowerCase() === legacy.KNTAllInOne.toLowerCase()) {
    throw new Error("Active deployment still points at the legacy contract");
  }

  const [signer] = await hre.ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const legacyKnt = new hre.ethers.Contract(legacy.KNTAllInOne, LEGACY_KNT_ABI, signer);
  const owner = await legacyKnt.owner();
  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Signer ${signerAddress} is not legacy owner ${owner}`);
  }

  const [router, usdt, labubu, currentPair] = await Promise.all([
    legacyKnt.pancakeRouter(),
    legacyKnt.usdtToken(),
    legacyKnt.labubuToken(),
    legacyKnt.labubuKntPair(),
  ]);

  const receipts = [];
  if (currentPair !== ZERO_ADDRESS) {
    const receipt = await wait(
      legacyKnt.setLiquidityConfig(router, usdt, labubu, ZERO_ADDRESS),
      "freeze legacy liquidity entry"
    );
    receipts.push(receipt.hash);
    await waitForPair(legacyKnt, ZERO_ADDRESS);
  } else {
    console.log("legacy liquidity entry already frozen");
  }

  const frozenAt = new Date().toISOString();
  const frozen = {
    ...legacy,
    supersededBy: active.KNTAllInOne,
    oldPausedOnChain: true,
    oldPausedAt: frozenAt,
    oldPauseMethod: "setLiquidityConfig(router, usdt, labubu, zeroAddress)",
    oldPauseNote: "Legacy contract has no Pausable switch. Its liquidity pair config is set to zero so processUsdtDeposit reverts at the legacy entry.",
    oldPauseTxs: [...(legacy.oldPauseTxs || []), ...receipts],
  };
  writeJson(legacyPath, frozen);

  const activeUpdated = {
    ...active,
    migration: {
      ...(active.migration || {}),
      oldPausedOnChain: true,
      oldPausedAt: frozenAt,
      oldPauseMethod: frozen.oldPauseMethod,
      oldPauseTxs: [...((active.migration || {}).oldPauseTxs || []), ...receipts],
      oldPauseNote: frozen.oldPauseNote,
    },
  };
  writeJson(activePath, activeUpdated);

  console.log(JSON.stringify({
    legacy: legacy.KNTAllInOne,
    active: active.KNTAllInOne,
    previousLegacyPair: currentPair,
    legacyPairAfter: await waitForPair(legacyKnt, ZERO_ADDRESS),
    txs: receipts,
    status: "frozen",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
