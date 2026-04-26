const { ethers } = require("ethers");

const RPC = "https://rpc.cncchainpro.com";
const PROTOCOL = "0x950aB6763963e89718bD9E6AC2031a29e8d53002";
const DEPLOY_BLOCK = 7000000; // 粗估部署块高

const ABI = [
  "event UserRegistered(address indexed user, address indexed referrer, uint256 timestamp)",
  "function users(address) view returns (address referrer, address[] directReferrals, uint8 teamLevel, uint256 totalInvestedUsdt, uint256 teamVolumeUsdt, uint256 seerBalance, uint256 seerBetting, uint256 totalEarnedSeer, uint256 lastCheckinTime, uint256 registrationTime, bool registered)",
  "function totalUsers() view returns (uint256)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const contract = new ethers.Contract(PROTOCOL, ABI, provider);

  const latest = await provider.getBlockNumber();
  console.log(`当前块高: ${latest}`);

  const totalUsers = await contract.totalUsers();
  console.log(`总注册用户数: ${totalUsers}\n`);

  // 拉取所有 UserRegistered 事件
  console.log("正在拉取注册事件 (分批查询)...");
  const events = [];
  const STEP = 2000;
  for (let from = DEPLOY_BLOCK; from <= latest; from += STEP) {
    const to = Math.min(from + STEP - 1, latest);
    try {
      const logs = await contract.queryFilter("UserRegistered", from, to);
      events.push(...logs);
      if (logs.length > 0) process.stdout.write(`\r  块 ${from}~${to}: 累计 ${events.length} 个事件`);
    } catch (e) {
      // 跳过失败块段
    }
  }
  console.log(`\n\n共找到 ${events.length} 条注册事件\n`);

  if (events.length === 0) {
    console.log("未找到任何注册事件，尝试调整 DEPLOY_BLOCK 参数");
    return;
  }

  // 构建推荐关系
  const network = {}; // user -> { referrer, directReferrals, registrationTime }
  for (const ev of events) {
    const user = ev.args.user.toLowerCase();
    const referrer = ev.args.referrer.toLowerCase();
    const ts = Number(ev.args.timestamp);
    if (!network[user]) {
      network[user] = { referrer, directReferrals: [], registrationTime: ts };
    }
    if (referrer && referrer !== ethers.ZeroAddress.toLowerCase()) {
      if (!network[referrer]) {
        network[referrer] = { referrer: null, directReferrals: [], registrationTime: 0 };
      }
      if (!network[referrer].directReferrals.includes(user)) {
        network[referrer].directReferrals.push(user);
      }
    }
  }

  const users = Object.keys(network);
  console.log("============= 推荐网络汇总 =============\n");

  // 找到根节点 (推荐人为0地址或不在network中的)
  const roots = users.filter(u => !network[u].referrer || !network[network[u].referrer]);
  console.log(`根节点 (顶层): ${roots.length} 个`);

  // 按直推人数排序输出
  const sorted = users.sort((a, b) => network[b].directReferrals.length - network[a].directReferrals.length);

  console.log("\n---------- 直推人数 Top10 ----------");
  sorted.slice(0, 10).forEach((u, i) => {
    const info = network[u];
    const short = u.slice(0, 6) + "..." + u.slice(-4);
    const refShort = info.referrer ? (info.referrer.slice(0, 6) + "..." + info.referrer.slice(-4)) : "创始节点";
    const date = info.registrationTime ? new Date(info.registrationTime * 1000).toLocaleDateString('zh-CN') : '-';
    console.log(`  ${i + 1}. ${short} | 推荐人: ${refShort} | 直推: ${info.directReferrals.length} 人 | 注册: ${date}`);
  });

  // 树形展示 (深度≤3)
  console.log("\n---------- 树形推荐结构 (前3层) ----------");
  function printTree(addr, depth, prefix) {
    if (depth > 3) return;
    const info = network[addr] || { directReferrals: [] };
    const short = addr.slice(0, 6) + "..." + addr.slice(-4);
    const direct = info.directReferrals.length;
    console.log(`${prefix}${short} (直推 ${direct} 人)`);
    if (depth < 3) {
      info.directReferrals.forEach((child, idx) => {
        const isLast = idx === info.directReferrals.length - 1;
        printTree(child, depth + 1, prefix + (isLast ? "  └─ " : "  ├─ "));
      });
    }
  }

  roots.forEach(root => printTree(root, 1, ""));

  // 统计
  const depths = {};
  function calcDepth(addr, depth) {
    depths[addr] = depth;
    (network[addr]?.directReferrals || []).forEach(c => calcDepth(c, depth + 1));
  }
  roots.forEach(r => calcDepth(r, 1));
  const maxDepth = Math.max(...Object.values(depths));
  const totalEdges = events.length;

  console.log("\n============= 统计摘要 =============");
  console.log(`总用户数:    ${users.length}`);
  console.log(`顶层根节点:  ${roots.length} 个`);
  console.log(`最大层级:    ${maxDepth} 层`);
  console.log(`推荐关系数:  ${totalEdges}`);
  const avgDirect = (totalEdges / users.filter(u => network[u].directReferrals.length > 0).length || 0).toFixed(2);
  console.log(`有效推荐人平均直推: ${avgDirect} 人`);
}

main().catch(console.error);
