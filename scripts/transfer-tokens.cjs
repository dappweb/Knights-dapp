const hre = require("hardhat");
const { ethers } = require("ethers");

async function main() {
  const TARGET_ADDRESS = "0x7123a25d205190e6844712cb18e39d6dd5316143";

  // 合约地址
  const SEER_ADDRESS = "0xD8BD9571DFEDb614625515b22A801d7F7eB896AA";
  const USDT_ADDRESS = "0x02ED3072eB83e4E0654d30250102aA58cE977789";

  // ERC20 ABI
  const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ];

  // 获取部署者账户
  const [deployerSigner] = await hre.ethers.getSigners();
  const deployerAddress = await deployerSigner.getAddress();

  console.log(`🔑 部署者地址: ${deployerAddress}`);
  console.log(`📤 目标地址: ${TARGET_ADDRESS}`);
  console.log("");

  // 连接到合约
  const seerContract = new hre.ethers.Contract(SEER_ADDRESS, ERC20_ABI, deployerSigner);
  const usdtContract = new hre.ethers.Contract(USDT_ADDRESS, ERC20_ABI, deployerSigner);

  try {
    // ========== 转账 SEER ==========
    console.log("📦 转账 SEER...");
    const seerDecimals = await seerContract.decimals();
    const seerAmount = ethers.parseUnits("100", seerDecimals); // 100 SEER
    const seerBalance = await seerContract.balanceOf(deployerAddress);
    
    console.log(`  部署者 SEER 余额: ${ethers.formatUnits(seerBalance, seerDecimals)}`);
    console.log(`  待转账 SEER: ${ethers.formatUnits(seerAmount, seerDecimals)}`);
    
    let seerTx = await seerContract.transfer(TARGET_ADDRESS, seerAmount);
    let seerReceipt = await seerTx.wait();
    console.log(`  ✅ SEER 转账成功: ${seerReceipt.hash}`);

    // ========== 转账 USDT ==========
    console.log("");
    console.log("📦 转账 USDT...");
    const usdtDecimals = await usdtContract.decimals();
    const usdtAmount = ethers.parseUnits("100", usdtDecimals); // 100 USDT
    const usdtBalance = await usdtContract.balanceOf(deployerAddress);
    
    console.log(`  部署者 USDT 余额: ${ethers.formatUnits(usdtBalance, usdtDecimals)}`);
    console.log(`  待转账 USDT: ${ethers.formatUnits(usdtAmount, usdtDecimals)}`);
    
    let usdtTx = await usdtContract.transfer(TARGET_ADDRESS, usdtAmount);
    let usdtReceipt = await usdtTx.wait();
    console.log(`  ✅ USDT 转账成功: ${usdtReceipt.hash}`);

    // ========== 转账 ETH ==========
    console.log("");
    console.log("📦 转账 ETH 测试代币...");
    const ethBalance = await deployerSigner.provider.getBalance(deployerAddress);
    const ethAmount = ethers.parseEther("0.5"); // 0.5 ETH
    
    console.log(`  部署者 ETH 余额: ${ethers.formatEther(ethBalance)}`);
    console.log(`  待转账 ETH: ${ethers.formatEther(ethAmount)}`);
    
    let ethTx = await deployerSigner.sendTransaction({
      to: TARGET_ADDRESS,
      value: ethAmount
    });
    let ethReceipt = await ethTx.wait();
    console.log(`  ✅ ETH 转账成功: ${ethReceipt.hash}`);

    // ========== 验证 ==========
    console.log("");
    console.log("✨ 最终余额验证:");
    const targetSeerBalance = await seerContract.balanceOf(TARGET_ADDRESS);
    const targetUsdtBalance = await usdtContract.balanceOf(TARGET_ADDRESS);
    const targetEthBalance = await deployerSigner.provider.getBalance(TARGET_ADDRESS);

    console.log(`  目标地址 SEER: ${ethers.formatUnits(targetSeerBalance, seerDecimals)}`);
    console.log(`  目标地址 USDT: ${ethers.formatUnits(targetUsdtBalance, usdtDecimals)}`);
    console.log(`  目标地址 ETH: ${ethers.formatEther(targetEthBalance)}`);

  } catch (error) {
    console.error("❌ 错误:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
