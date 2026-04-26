/**
 * check-balances-for-pool.cjs
 * ─────────────────────────────────────────────────────
 * 检查账户的 SEER 和 USDT 余额，确保有足够的代币创建流动性池
 *
 * 用法:
 *   npm run check:balances
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { ethers } = require("ethers");

const RPC_URL = process.env.VITE_RPC_URL || process.env.RPC_URL || process.env.CNC_MAINNET_RPC_URL || process.env.VITE_CNC_MAINNET_RPC_URL;
const PK = process.env.PRIVATE_KEY;
const SEER_TOKEN = process.env.VITE_SEER_TOKEN_ADDRESS;
const USDT_TOKEN = process.env.USDT_TOKEN_ADDRESS || process.env.VITE_USDT_ADDRESS;

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function mint(address to, uint256 amount)",
  "function faucet()",
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PK, provider);
  const signerAddress = wallet.address;

  console.log("\n=== Token Balance Check ===\n");
  console.log(`Signer: ${signerAddress}`);

  const seer = new ethers.Contract(SEER_TOKEN, ERC20_ABI, provider);
  const usdt = new ethers.Contract(USDT_TOKEN, ERC20_ABI, provider);

  const [seerDecimals, usdtDecimals, seerBalance, usdtBalance] = await Promise.all([
    seer.decimals(),
    usdt.decimals(),
    seer.balanceOf(signerAddress),
    usdt.balanceOf(signerAddress),
  ]);

  const seerBalanceFormatted = ethers.formatUnits(seerBalance, seerDecimals);
  const usdtBalanceFormatted = ethers.formatUnits(usdtBalance, usdtDecimals);

  console.log(`\nSEER Balance: ${seerBalanceFormatted} SEER`);
  console.log(`USDT Balance: ${usdtBalanceFormatted} USDT`);

  // 所需的流动性
  const requiredSeer = ethers.parseEther("2100000");
  const requiredUsdt = ethers.parseUnits("210000", usdtDecimals);

  console.log(`\nRequired for pool:`);
  console.log(`  SEER: ${ethers.formatUnits(requiredSeer, seerDecimals)}`);
  console.log(`  USDT: ${ethers.formatUnits(requiredUsdt, usdtDecimals)}`);

  const needSeer = seerBalance < requiredSeer;
  const needUsdt = usdtBalance < requiredUsdt;

  if (needSeer || needUsdt) {
    console.log(`\n⚠️  Insufficient balance detected`);
    if (needSeer) {
      console.log(`  Trying to mint SEER...`);
      try {
        const tx = await seer.connect(wallet).mint(signerAddress, requiredSeer - seerBalance);
        console.log(`  Minted ${ethers.formatUnits(requiredSeer - seerBalance, seerDecimals)} SEER`);
      } catch (e) {
        console.log(`  ❌ Could not mint SEER: ${e.message}`);
      }
    }

    if (needUsdt) {
      console.log(`  Trying to faucet or mint USDT...`);
      try {
        const tx = await usdt.connect(wallet).faucet();
        console.log(`  Called faucet for USDT`);
      } catch (e) {
        console.log(`  Trying mint instead...`);
        try {
          const tx = await usdt.connect(wallet).mint(signerAddress, requiredUsdt - usdtBalance);
          console.log(`  Minted ${ethers.formatUnits(requiredUsdt - usdtBalance, usdtDecimals)} USDT`);
        } catch (e2) {
          console.log(`  ❌ Could not get USDT: ${e2.message}`);
        }
      }
    }
  } else {
    console.log(`\n✅ Sufficient balance for pool creation`);
  }

  console.log("\n");
}

main().catch((error) => {
  console.error("\n❌ Balance check failed:", error.message || error);
  process.exit(1);
});
