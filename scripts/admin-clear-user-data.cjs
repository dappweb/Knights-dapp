#!/usr/bin/env node
/**
 * @notice 清除用户注册数据脚本 (保留owner)
 * @dev 使用方法:
 *      npx hardhat run scripts/admin-clear-user-data.cjs --network <network>
 *      
 * 环境变量:
 *      CLEAR_USER_ADDRESS - 要清除的用户地址 (必需)
 * 
 * 功能:
 *      1. 从推荐人的直推列表中移除用户
 *      2. 清除用户的 UserInfo (注册数据、推荐信息、业绩等)
 *      3. 清除用户的矿机列表
 *      4. 更新全局统计数据
 *      5. 保留 owner 账户不动
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveProtocolAddress(networkName) {
  const fromEnv = process.env.VITE_SEER_PROTOCOL || process.env.SEER_PROTOCOL_ADDRESS || "";
  if (fromEnv && hre.ethers.isAddress(fromEnv)) {
    return hre.ethers.getAddress(fromEnv);
  }

  const repoRoot = path.resolve(__dirname, "..");
  const candidates = [
    path.join(repoRoot, "deployments", `${networkName}.latest.json`),
    path.join(repoRoot, "deployments", `${networkName}.json`),
    path.join(repoRoot, "deployments", networkName, "SeerProtocol.json")
  ];

  for (const file of candidates) {
    const data = loadJsonIfExists(file);
    if (!data) continue;

    const direct = data.SeerProtocol;
    if (direct && hre.ethers.isAddress(direct)) {
      return hre.ethers.getAddress(direct);
    }

    const nested = data.contracts?.protocol || data.address;
    if (nested && hre.ethers.isAddress(nested)) {
      return hre.ethers.getAddress(nested);
    }
  }

  return "";
}

async function discoverRegisteredUsers(protocol, owner) {
  const provider = hre.ethers.provider;
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(Number(process.env.CLEAR_FROM_BLOCK || "0"), 0);
  const step = Math.max(Number(process.env.CLEAR_SCAN_STEP || "5000"), 1000);

  console.log(`\n🔎 扫描 UserRegistered 事件: ${fromBlock} -> ${latestBlock} (step=${step})`);

  const users = new Set();
  const filter = protocol.filters.UserRegistered();

  for (let start = fromBlock; start <= latestBlock; start += step) {
    const end = Math.min(start + step - 1, latestBlock);
    const logs = await protocol.queryFilter(filter, start, end);
    for (const ev of logs) {
      const u = ev.args?.user || ev.args?.[0];
      if (u && hre.ethers.isAddress(u)) {
        users.add(hre.ethers.getAddress(u));
      }
    }
  }

  users.delete(hre.ethers.getAddress(owner));
  users.delete(hre.ethers.ZeroAddress);

  const all = Array.from(users);
  const active = [];
  for (const u of all) {
    try {
      const info = await protocol.getUserInfo(u);
      if (info.registered) active.push(u);
    } catch {
      // ignore invalid historical addresses
    }
  }

  return active;
}

async function clearOneUser(protocol, owner, userAddress) {
  const normalizedAddress = hre.ethers.getAddress(userAddress);
  if (normalizedAddress === hre.ethers.getAddress(owner)) {
    console.log(`⏭️ 跳过 owner: ${normalizedAddress}`);
    return { address: normalizedAddress, skipped: true, reason: "owner" };
  }

  const userInfo = await protocol.getUserInfo(normalizedAddress);
  if (!userInfo.registered) {
    console.log(`⏭️ 跳过未注册用户: ${normalizedAddress}`);
    return { address: normalizedAddress, skipped: true, reason: "not-registered" };
  }

  const minerCount = await protocol.getUserMinerCount(normalizedAddress);
  console.log(`\n🧹 清除用户: ${normalizedAddress}`);
  console.log(`  矿机数: ${minerCount}`);

  const tx = await protocol.adminClearUserData(normalizedAddress);
  console.log(`  交易哈希: ${tx.hash}`);
  const receipt = await tx.wait(1);
  if (receipt.status !== 1) {
    throw new Error(`清除失败: ${normalizedAddress}`);
  }

  const check = await protocol.getUserInfo(normalizedAddress);
  const minersAfter = await protocol.getUserMinerCount(normalizedAddress);

  return {
    address: normalizedAddress,
    txHash: tx.hash,
    registeredAfter: check.registered,
    minerCountAfter: Number(minersAfter)
  };
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`\n🔧 清除用户数据脚本 - ${networkName}`);
  console.log("执行账户:", deployerAddress);

  const clearAll = String(process.env.CLEAR_ALL_USERS || "false") === "true";
  const userToClear = process.env.CLEAR_USER_ADDRESS || "";
  if (!clearAll && (!userToClear || !hre.ethers.isAddress(userToClear))) {
    throw new Error("❌ 需要指定 CLEAR_USER_ADDRESS，或设置 CLEAR_ALL_USERS=true");
  }

  // ====== 加载部署信息 ======
  const protocolAddress = resolveProtocolAddress(networkName);

  if (!protocolAddress) {
    throw new Error("❌ 无法找到 SeerProtocol 地址，请检查环境变量或部署文件");
  }

  console.log("SeerProtocol:", protocolAddress);

  // ====== 连接合约 ======
  const protocol = await hre.ethers.getContractAt("SeerProtocol", protocolAddress, deployer);
  const owner = await protocol.owner();
  console.log("Owner:", owner);

  let targets = [];
  if (clearAll) {
    targets = await discoverRegisteredUsers(protocol, owner);
    console.log(`\n🎯 待清除用户数: ${targets.length}`);
  } else {
    targets = [hre.ethers.getAddress(userToClear)];
    console.log("目标用户:", targets[0]);
  }

  if (targets.length === 0) {
    console.log("ℹ️ 没有可清除的用户，脚本结束。");
    return;
  }

  // ====== 确认操作 ======
  console.log("\n⚠️  警告: 这将永久清除用户的所有注册数据！");
  console.log("   - 清除 UserInfo (推荐人、业绩、等级等)");
  console.log("   - 清除所有矿机列表");
  console.log("   - 更新全局统计数据");
  console.log("   - owner 账户将不受影响");

  // 简单的确认检查 (生产环境建议加入更严格的确认机制)
  const confirmEnv = process.env.CONFIRM_CLEAR || "false";
  if (confirmEnv !== "true") {
    console.log("\n❌ 需要设置 CONFIRM_CLEAR=true 来确认操作");
    console.log("   单用户: CONFIRM_CLEAR=true CLEAR_USER_ADDRESS=0x... npx hardhat run scripts/admin-clear-user-data.cjs --network <network>");
    console.log("   批量:   CONFIRM_CLEAR=true CLEAR_ALL_USERS=true npx hardhat run scripts/admin-clear-user-data.cjs --network <network>");
    process.exit(1);
  }

  // ====== 执行清除 ======
  console.log("\n🚀 执行清除操作...");

  const summary = { success: 0, skipped: 0, failed: 0, txs: [] };
  for (const addr of targets) {
    try {
      const result = await clearOneUser(protocol, owner, addr);
      if (result.skipped) {
        summary.skipped++;
      } else {
        summary.success++;
        summary.txs.push({ address: result.address, txHash: result.txHash });
        console.log(`  验证: registered=${result.registeredAfter}, miners=${result.minerCountAfter}`);
      }
    } catch (e) {
      summary.failed++;
      const msg = e?.shortMessage || e?.message || String(e);
      // 合约尚未升级到包含 adminClearUserData 时给出明确提示
      if (msg.includes("adminClearUserData") || msg.includes("function selector") || msg.includes("is not a function")) {
        console.error("\n❌ 当前链上协议尚未包含 adminClearUserData()，请先升级协议后再执行清除。");
        process.exit(1);
      }
      console.error(`❌ 清除失败 ${addr}:`, msg);
    }
  }

  console.log("\n📦 清除汇总");
  console.log(`  成功: ${summary.success}`);
  console.log(`  跳过: ${summary.skipped}`);
  console.log(`  失败: ${summary.failed}`);
  if (summary.txs.length > 0) {
    console.log("  交易:");
    for (const item of summary.txs) {
      console.log(`    ${item.address} -> ${item.txHash}`);
    }
  }

  if (summary.failed > 0) {
    process.exit(1);
  }

  console.log("\n✅ 清除完成！\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
