/**
 * 自动 E2E 测试（CNC Mainnet）
 * owner 创建并资助 3 个临时钉包，完成注册/购买矿机/状态检查
 *
 * 运行：npx hardhat run scripts/test-e2e-auto.cjs --network cncMainnet
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENT_FILE = path.resolve(process.cwd(), "deployments", "cncMainnet.latest.json");
const OUT_FILE = path.resolve(process.cwd(), "deployments", "cncMainnet.e2e.wallets.json");

const USDT_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const PROTOCOL_ABI = [
  "function owner() view returns (address)",
  "function getUserInfo(address) view returns (bool registered,address referrer,uint8 teamLevel,uint256 totalInvestedUsdt,uint256 teamVolumeUsdt,uint256 seerBalance,uint256 seerBetting,uint256 totalEarnedSeer,uint256 directReferralCount)",
  "function register(address referrer) external",
  "function purchaseMiner(uint8 tier) external",
  "function getUserMinerCount(address) view returns (uint256)",
  "function getPendingRewards(address) view returns (uint256)",
  "function canCheckin(address) view returns (bool)",
  "function totalUsers() view returns (uint256)",
  "function miningPoolRemaining() view returns (uint256)",
];

const PROTOCOL_USDT_DECIMALS = 6;
const fmtUnits = (v, decimals) => Number(hre.ethers.formatUnits(v, decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmt18 = (v) => Number(hre.ethers.formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: 6 });

async function main() {
  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    throw new Error(`Deployment file not found: ${DEPLOYMENT_FILE}`);
  }

  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
  const { usdt: usdtAddr, protocol: protocolAddr } = deployment.contracts;

  const [owner] = await hre.ethers.getSigners();
  const ownerAddr = await owner.getAddress();

  const usdt = new hre.ethers.Contract(usdtAddr, USDT_ABI, owner);
  const protocol = new hre.ethers.Contract(protocolAddr, PROTOCOL_ABI, owner);

  console.log("\n=== SEER E2E AUTO TEST ===");
  console.log("Owner:", ownerAddr);
  console.log("USDT:", usdtAddr);
  console.log("Protocol:", protocolAddr);

  const ownerEth = await hre.ethers.provider.getBalance(ownerAddr);
  const ownerUsdt = await usdt.balanceOf(ownerAddr);
  const usdtDecimals = Number(await usdt.decimals().catch(() => PROTOCOL_USDT_DECIMALS));
  console.log("Owner ETH:", hre.ethers.formatEther(ownerEth));
  console.log("Owner USDT:", fmtUnits(ownerUsdt, usdtDecimals));
  console.log("USDT decimals:", usdtDecimals);

  if (usdtDecimals !== PROTOCOL_USDT_DECIMALS) {
    throw new Error(`USDT decimals mismatch: token=${usdtDecimals}, protocol=${PROTOCOL_USDT_DECIMALS}. Refusing to run purchase flow.`);
  }

  // 生成 3 个临时钱包并连接 provider
  const wA = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  const wB = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  const wC = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);

  const wallets = [
    { label: "A", signer: wA, ref: ownerAddr },
    { label: "B", signer: wB, ref: await wA.getAddress() },
    { label: "C", signer: wC, ref: await wB.getAddress() },
  ];

  const ethFund = hre.ethers.parseEther("0.02");
  const usdtFund = hre.ethers.parseUnits("2000", usdtDecimals);
  const minerCost = 100n * 10n ** BigInt(PROTOCOL_USDT_DECIMALS); // Basic

  console.log("\n[1/5] 资助临时钱包 ETH + USDT...");
  for (const item of wallets) {
    const addr = await item.signer.getAddress();
    const tx1 = await owner.sendTransaction({ to: addr, value: ethFund });
    await tx1.wait();
    const tx2 = await usdt.transfer(addr, usdtFund);
    await tx2.wait();
    console.log(`  ${item.label}: ${addr}`);
  }

  console.log("\n[2/5] 注册（A<-owner, B<-A, C<-B）...");
  for (const item of wallets) {
    const addr = await item.signer.getAddress();
    try {
      const info = await protocol.getUserInfo(addr);
      if (!info[0]) {
        const tx = await protocol.connect(item.signer).register(item.ref);
        await tx.wait();
        console.log(`  ${item.label} 注册成功`);
      } else {
        console.log(`  ${item.label} 已注册`);
      }
    } catch (err) {
      console.log(`  ${item.label} 注册失败: ${err.reason || err.shortMessage || err.message}`);
    }
  }

  console.log("\n[3/5] 授权 USDT 并购买 Basic 矿机...");
  for (const item of wallets) {
    const addr = await item.signer.getAddress();
    try {
      const usdtUser = usdt.connect(item.signer);
      const protocolUser = protocol.connect(item.signer);

      const allowance = await usdt.allowance(addr, protocolAddr);
      if (allowance < minerCost) {
        const txApprove = await usdtUser.approve(protocolAddr, minerCost);
        await txApprove.wait();
      }

      const minerCount = await protocol.getUserMinerCount(addr);
      if (Number(minerCount) === 0) {
        const txBuy = await protocolUser.purchaseMiner(0);
        await txBuy.wait();
        console.log(`  ${item.label} 购买矿机成功`);
      } else {
        console.log(`  ${item.label} 已有矿机: ${minerCount}`);
      }
    } catch (err) {
      console.log(`  ${item.label} 购买矿机失败: ${err.reason || err.shortMessage || err.message}`);
    }
  }

  console.log("\n[4/5] 读取状态与收益...");
  for (const item of wallets) {
    const addr = await item.signer.getAddress();
    const info = await protocol.getUserInfo(addr);
    const minerCount = await protocol.getUserMinerCount(addr);
    const pending = await protocol.getPendingRewards(addr);
    const checkin = await protocol.canCheckin(addr);
    const balUsdt = await usdt.balanceOf(addr);
    console.log(`  ${item.label} | miners:${minerCount} pending:${fmt18(pending)} SEER canCheckin:${checkin} usdt:${fmtUnits(balUsdt, usdtDecimals)} invested:${fmtUnits(info[3], PROTOCOL_USDT_DECIMALS)}`);
  }

  console.log("\n[5/5] 输出测试钱包信息到文件...");
  const out = {
    network: deployment.network,
    protocol: protocolAddr,
    usdt: usdtAddr,
    owner: ownerAddr,
    createdAt: new Date().toISOString(),
    wallets: await Promise.all(wallets.map(async (item) => ({
      label: item.label,
      address: await item.signer.getAddress(),
      privateKey: item.signer.privateKey,
      referrer: item.ref,
    }))),
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`  已写入: ${OUT_FILE}`);

  const totalUsers = await protocol.totalUsers();
  const poolRem = await protocol.miningPoolRemaining();
  console.log("\n完成 ✅");
  console.log("Total users:", totalUsers.toString());
  console.log("Mining pool remaining:", fmt18(poolRem), "SEER");
}

main().catch((err) => {
  console.error("\n执行失败:", err);
  process.exit(1);
});
