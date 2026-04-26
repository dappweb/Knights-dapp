/**
 * verify-dex-configuration.cjs
 * ─────────────────────────────────────────────────────
 * 验证 DEX 配置和交易对信息
 * 检查池是否使用正确的 USDT 地址和流动性状态
 *
 * 用法:
 *   npm run verify:dex
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { ethers } = require("ethers");

const RPC_URL = process.env.VITE_RPC_URL || process.env.RPC_URL || process.env.CNC_MAINNET_RPC_URL || process.env.VITE_CNC_MAINNET_RPC_URL;
const SEER_TOKEN = process.env.VITE_SEER_TOKEN_ADDRESS;
const USDT_TOKEN = process.env.USDT_TOKEN_ADDRESS || process.env.VITE_USDT_ADDRESS;
const DEX_ROUTER = process.env.DEX_ROUTER_ADDRESS;
const DEX_FACTORY = process.env.DEX_FACTORY_ADDRESS;
const DEX_PAIR = process.env.DEX_PAIR_ADDRESS;

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
];

const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
];

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address)",
];

const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function WETH() view returns (address)",
];

async function main() {
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║     DEX Configuration Verification     ║");
  console.log("║          DEX Runtime Validation        ║");
  console.log("╚════════════════════════════════════════╝\n");

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // 1. 验证环境变量
  console.log("📋 [1/6] Environment Variables:");
  console.log(`  SEER Token:      ${SEER_TOKEN}`);
  console.log(`  USDT Token:      ${USDT_TOKEN}`);
  console.log(`  DEX Router:      ${DEX_ROUTER}`);
  console.log(`  DEX Factory:     ${DEX_FACTORY}`);
  console.log(`  DEX Pair:        ${DEX_PAIR || "⚠️  (Empty)"}`);

  if (!SEER_TOKEN || !USDT_TOKEN || !DEX_ROUTER || !DEX_FACTORY) {
    throw new Error("❌ Missing critical DEX addresses in .env");
  }

  // 2. 验证代币
  console.log("\n📋 [2/6] Token Information:");
  const seer = new ethers.Contract(SEER_TOKEN, ERC20_ABI, provider);
  const usdt = new ethers.Contract(USDT_TOKEN, ERC20_ABI, provider);

  const [seerName, seerSymbol, seerDecimals] = await Promise.all([
    seer.name(),
    seer.symbol(),
    seer.decimals(),
  ]);
  const [usdtName, usdtSymbol, usdtDecimals] = await Promise.all([
    usdt.name(),
    usdt.symbol(),
    usdt.decimals(),
  ]);

  console.log(`  SEER: ${seerName} (${seerSymbol}) - ${seerDecimals} decimals`);
  console.log(`  USDT: ${usdtName} (${usdtSymbol}) - ${usdtDecimals} decimals`);

  // 3. 验证 DEX 基础设施
  console.log("\n📋 [3/6] DEX Infrastructure:");
  const router = new ethers.Contract(DEX_ROUTER, ROUTER_ABI, provider);
  const factory = new ethers.Contract(DEX_FACTORY, FACTORY_ABI, provider);

  const [routerFactoryAddr, routerWeth] = await Promise.all([
    router.factory(),
    router.WETH(),
  ]);

  console.log(`  Router Factory:  ${routerFactoryAddr}`);
  console.log(`  Router WETH:     ${routerWeth}`);
  console.log(`  Env Factory:     ${DEX_FACTORY}`);
  const factoryMatch = routerFactoryAddr.toLowerCase() === DEX_FACTORY.toLowerCase();
  console.log(`  ${factoryMatch ? "✅" : "❌"} Factory Match: ${factoryMatch}`);

  // 4. 在链上查询 pair 地址
  console.log("\n📋 [4/6] On-Chain Pair Discovery:");
  const onChainPair = await factory.getPair(SEER_TOKEN, USDT_TOKEN);
  console.log(`  Factory Query (SEER, USDT): ${onChainPair}`);
  console.log(`  Env Config Pair:            ${DEX_PAIR}`);

  const pairMatch =
    onChainPair.toLowerCase() === DEX_PAIR?.toLowerCase();
  if (pairMatch) {
    console.log("  ✅ Pair address matches on-chain configuration");
  } else {
    console.log(`  ⚠️  Pair mismatch detected`);
    if (onChainPair === ethers.ZeroAddress) {
      console.log("     → No pair exists on-chain yet");
    } else {
      console.log(`     → On-chain pair differs from .env config`);
    }
  }

  // 5. 如果 pair 存在，检查其配置
  if (onChainPair !== ethers.ZeroAddress) {
    console.log("\n📋 [5/6] Pair Configuration:");
    const pair = new ethers.Contract(onChainPair, PAIR_ABI, provider);

    const [token0, token1, reserves, lpSupply] = await Promise.all([
      pair.token0(),
      pair.token1(),
      pair.getReserves(),
      pair.totalSupply(),
    ]);

    const isSeerFirst = token0.toLowerCase() === SEER_TOKEN.toLowerCase();
    const seerReserve = isSeerFirst ? reserves[0] : reserves[1];
    const usdtReserve = isSeerFirst ? reserves[1] : reserves[0];

    const seerReserveFormatted = ethers.formatUnits(seerReserve, seerDecimals);
    const usdtReserveFormatted = ethers.formatUnits(
      usdtReserve,
      usdtDecimals
    );

    console.log(`  Pair Address:    ${onChainPair}`);
    console.log(`  Token0:          ${token0} (${isSeerFirst ? "SEER" : "USDT"})`);
    console.log(`  Token1:          ${token1} (${isSeerFirst ? "USDT" : "SEER"})`);
    console.log(`  SEER Reserve:    ${seerReserveFormatted}`);
    console.log(`  USDT Reserve:    ${usdtReserveFormatted}`);
    console.log(`  LP Supply:       ${ethers.formatEther(lpSupply)}`);

    if (seerReserve > 0n && usdtReserve > 0n) {
      const price = Number(usdtReserveFormatted) / Number(seerReserveFormatted);
      console.log(`  Price (1 SEER):  ${price.toFixed(6)} USDT`);
    } else {
      console.log(`  ⚠️  Insufficient liquidity in pair`);
    }

    // 验证 tokens 是否正确
    const correctTokens =
      (token0.toLowerCase() === SEER_TOKEN.toLowerCase() &&
        token1.toLowerCase() === USDT_TOKEN.toLowerCase()) ||
      (token0.toLowerCase() === USDT_TOKEN.toLowerCase() &&
        token1.toLowerCase() === SEER_TOKEN.toLowerCase());

    if (correctTokens) {
      console.log("  ✅ Pair tokens are correct");
    } else {
      console.log("  ❌ Pair tokens mismatch!");
    }
  } else {
    console.log("\n⚠️  [5/6] No pair found on-chain");
    console.log("   Status: Pair needs to be created");
  }

  // 6. 推荐操作
  console.log("\n📋 [6/6] Recommended Actions:");
  if (onChainPair === ethers.ZeroAddress) {
    console.log("  ⚠️  Pair not yet created!");
    console.log("     Run: npm run pool:cnc:mainnet");
  } else if (!pairMatch) {
    console.log("  ⚠️  Pair address in .env does not match on-chain config");
    console.log("     Update .env with correct pair address:");
    console.log(`     DEX_PAIR_ADDRESS=${onChainPair}`);
  } else {
    console.log("  ✅ DEX configuration is valid");
    console.log("  ✅ Pair is properly configured");
    console.log("  ✅ Ready for swap operations");
  }

  console.log("\n");
}

main().catch((error) => {
  console.error("\n❌ Verification failed:", error.message || error);
  process.exit(1);
});
