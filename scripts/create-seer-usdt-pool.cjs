const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const hre = require("hardhat");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const ENV_PATH = path.resolve(process.cwd(), ".env");
const DEPLOYMENT_DIR = path.resolve(process.cwd(), "deployments");

const ERC20_ABI = [
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function mint(address to, uint256 amount)",
  "function faucet()",
];

const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function addLiquidity(address tokenA,address tokenB,uint amountADesired,uint amountBDesired,uint amountAMin,uint amountBMin,address to,uint deadline) returns (uint amountA,uint amountB,uint liquidity)",
];

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address)",
];

const SEER_ABI = [
  "function owner() view returns (address)",
  "function isTaxedPair(address pair) view returns (bool)",
  "function setTaxedPair(address pair, bool isTaxed)",
];

function upsertEnvValue(content, key, value) {
  const line = `${key}=${value ?? ""}`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  return `${content.trimEnd()}\n${line}\n`;
}

function parseRequiredAddress(name, fallback = "") {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function firstAddress(...candidates) {
  for (const value of candidates) {
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

async function ensureUsdtBalance(usdt, signerAddress, requiredAmount) {
  const usdtDecimals = Number(await usdt.decimals().catch(() => 6));
  const current = await usdt.balanceOf(signerAddress);
  if (current >= requiredAmount) {
    return current;
  }

  const missing = requiredAmount - current;
  console.log(`USDT balance insufficient, trying to top up ${hre.ethers.formatUnits(missing, usdtDecimals)} USDT...`);

  try {
    const mintTx = await usdt.mint(signerAddress, missing);
    await mintTx.wait();
    return await usdt.balanceOf(signerAddress);
  } catch {
    try {
      const faucetTx = await usdt.faucet();
      await faucetTx.wait();
      return await usdt.balanceOf(signerAddress);
    } catch {
      return current;
    }
  }
}

async function ensureApproval(token, owner, spender, requiredAmount, symbol) {
  const allowance = await token.allowance(owner, spender);
  if (allowance >= requiredAmount) return;
  console.log(`Approving ${symbol}...`);
  const tx = await token.approve(spender, requiredAmount);
  await tx.wait();
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const networkName = hre.network.name;

  const seerAddress = parseRequiredAddress("VITE_SEER_TOKEN_ADDRESS", process.env.SEER_TOKEN_ADDRESS || "");
  const usdtAddress = parseRequiredAddress("USDT_TOKEN_ADDRESS", process.env.VITE_USDT_ADDRESS || "");
  const routerAddress = parseRequiredAddress(
    "SWAP_DEX_ROUTER_ADDRESS",
    firstAddress(
      process.env.SWAP_DEX_ROUTER_ADDRESS,
      process.env.DEX_ROUTER_ADDRESS,
      process.env.VITE_DEX_ROUTER_ADDRESS
    )
  );
  const factoryAddressFromEnv = firstAddress(
    process.env.SWAP_DEX_FACTORY_ADDRESS,
    process.env.DEX_FACTORY_ADDRESS,
    process.env.VITE_DEX_FACTORY_ADDRESS
  );

  // Chapter 1.4.5 defaults:
  // - LP allocation: 1% = 2,100,000 SEER
  // - Base price: 0.5 USDT
  // - Initial pool price: 0.1 USDT per SEER
  // - Liquidity: 2,100,000 SEER + 210,000 USDT
  const basePrice = Number(process.env.LP_BASE_PRICE_USDT || "0.5");
  const targetPrice = Number(process.env.LP_INITIAL_PRICE_USDT || "0.1");
  const seerAmountRaw = process.env.LP_INITIAL_SEER_AMOUNT || "2100000";
  const defaultUsdtAmountRaw = (Number(seerAmountRaw) * targetPrice).toString();
  const usdtAmountRaw = process.env.LP_INITIAL_USDT_AMOUNT || defaultUsdtAmountRaw;

  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    throw new Error(`Invalid LP_BASE_PRICE_USDT: ${process.env.LP_BASE_PRICE_USDT}`);
  }

  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    throw new Error(`Invalid LP_INITIAL_PRICE_USDT: ${process.env.LP_INITIAL_PRICE_USDT}`);
  }

  if (targetPrice > basePrice) {
    throw new Error(`Initial price (${targetPrice}) cannot be higher than base price (${basePrice}).`);
  }

  const seer = await hre.ethers.getContractAt(ERC20_ABI.concat(SEER_ABI), seerAddress, signer);
  const usdt = await hre.ethers.getContractAt(ERC20_ABI, usdtAddress, signer);
  const router = await hre.ethers.getContractAt(ROUTER_ABI, routerAddress, signer);
  const seerAmount = hre.ethers.parseEther(seerAmountRaw);
  const usdtDecimals = Number(await usdt.decimals().catch(() => 6));
  const usdtAmount = hre.ethers.parseUnits(usdtAmountRaw, usdtDecimals);

  let factoryAddress = factoryAddressFromEnv;
  try {
    factoryAddress = await router.factory();
  } catch {}
  const factory = await hre.ethers.getContractAt(FACTORY_ABI, factoryAddress, signer);

  console.log("\n=== Create SEER/USDT Pool ===");
  console.log("Signer:", signerAddress);
  console.log("SEER:", seerAddress);
  console.log("USDT:", usdtAddress);
  console.log("USDT decimals:", usdtDecimals);
  console.log("Router:", routerAddress);
  console.log("Factory:", factoryAddress);
  console.log(`Base price: 1 SEER = ${basePrice} USDT`);
  console.log(`Target price: 1 SEER = ${targetPrice} USDT`);
  console.log(`Liquidity: ${seerAmountRaw} SEER + ${usdtAmountRaw} USDT`);

  const seerBalance = await seer.balanceOf(signerAddress);
  if (seerBalance < seerAmount) {
    throw new Error(`Insufficient SEER balance. Need ${seerAmountRaw}, have ${hre.ethers.formatEther(seerBalance)}`);
  }

  const toppedUpUsdt = await ensureUsdtBalance(usdt, signerAddress, usdtAmount);
  if (toppedUpUsdt < usdtAmount) {
    throw new Error(`Insufficient USDT balance. Need ${usdtAmountRaw}, have ${hre.ethers.formatUnits(toppedUpUsdt, usdtDecimals)}`);
  }

  await ensureApproval(seer, signerAddress, routerAddress, seerAmount, "SEER");
  await ensureApproval(usdt, signerAddress, routerAddress, usdtAmount, "USDT");

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  console.log("Adding liquidity...");
  const addTx = await router.addLiquidity(
    seerAddress,
    usdtAddress,
    seerAmount,
    usdtAmount,
    0,
    0,
    signerAddress,
    deadline
  );
  const receipt = await addTx.wait();
  console.log("Liquidity tx:", receipt.hash);

  const pairAddress = await factory.getPair(seerAddress, usdtAddress);
  if (pairAddress === hre.ethers.ZeroAddress) {
    throw new Error("Pair was not created.");
  }

  console.log("Pair:", pairAddress);

  try {
    const owner = await seer.owner();
    const taxed = await seer.isTaxedPair(pairAddress);
    if (owner.toLowerCase() === signerAddress.toLowerCase() && !taxed) {
      console.log("Marking pair as taxed pair...");
      const taxTx = await seer.setTaxedPair(pairAddress, true);
      await taxTx.wait();
      console.log("Taxed pair enabled.");
    }
  } catch (error) {
    console.warn("Unable to set taxed pair automatically:", error.message || error);
  }

  let envContent = fs.readFileSync(ENV_PATH, "utf8");
  envContent = upsertEnvValue(envContent, "DEX_FACTORY_ADDRESS", factoryAddress);
  envContent = upsertEnvValue(envContent, "DEX_ROUTER_ADDRESS", routerAddress);
  envContent = upsertEnvValue(envContent, "DEX_PAIR_ADDRESS", pairAddress);
  envContent = upsertEnvValue(envContent, "VITE_DEX_ROUTER_ADDRESS", routerAddress);
  envContent = upsertEnvValue(envContent, "VITE_DEX_PAIR_ADDRESS", pairAddress);
  fs.writeFileSync(ENV_PATH, envContent, "utf8");

  if (!fs.existsSync(DEPLOYMENT_DIR)) {
    fs.mkdirSync(DEPLOYMENT_DIR, { recursive: true });
  }

  fs.writeFileSync(
    path.join(DEPLOYMENT_DIR, `${networkName}.pool.latest.json`),
    JSON.stringify(
      {
        network: networkName,
        dex: process.env.DEX_NAME || `${networkName} DEX`,
        timestamp: new Date().toISOString(),
        signer: signerAddress,
        router: routerAddress,
        factory: factoryAddress,
        pair: pairAddress,
        basePriceUsdt: basePrice,
        initialPriceUsdt: targetPrice,
        liquidity: {
          seer: seerAmountRaw,
          usdt: usdtAmountRaw,
        },
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("\n✅ Pool created successfully.");
}

main().catch((error) => {
  console.error("\n❌ Pool creation failed:", error);
  process.exit(1);
});
