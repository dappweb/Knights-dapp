# KNT 测试结果与需求逻辑对齐表

## 测试范围

- 链上网络: BSC Testnet, chainId 97
- 链上测试时间: 2026-05-05T03:25:05.776Z
- KNT: `0x5e23c00276d4454072b181eBA5079440cA6ce83f`
- USDT: `0xacD944e910952c020eb129C50921f180c62c3291`
- LABUBU: `0x202C8095F5D52EDF56EaFF8c36aA930e2C414181`
- 链上报告: `deployments/bscTestnet/knt-business-test-report.json`
- 本地快进时间测试: `test/knt-all-in-one-local.cjs`

## 汇总

| 范围 | 结果 |
| --- | --- |
| BSC Testnet A-E 业务测试 | PASS 10, SKIP 4 |
| 本地 Hardhat 快进时间测试 | PASS, 覆盖跨天收益/释放 |
| 仍未完全对齐项 | ERC721 迁移 NFT 形态未实现；KNT 转账入金路径已按当前业务移除 |

## 对齐表

| # | 需求逻辑 | 测试方式 | 期望结果 | 实际结果 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | USDT 地址切换为 `0xacD944e910952c020eb129C50921f180c62c3291` | BSC Testnet 重建底池部署产物 | 部署和业务测试均使用新 USDT | `USDT` 字段和 `LABUBU/USDT` Pair token 均为新地址 | PASS |
| 2 | 初始底池: KNT/LABUBU | BSC Testnet Pancake Pair 查询 | Pair 包含 KNT 和 LABUBU，LP supply > 0 | reserve: LABUBU 600000, KNT 200000；LP supply > 0 | PASS |
| 3 | 初始底池: LABUBU/USDT | BSC Testnet 部署交易 | 成功创建并注入 LABUBU/USDT 流动性 | Pair: `0x3d15C36a566c99bC740d2f2fA6F602B384476f9b`，注入 LABUBU 500000 + USDT 500000 | PASS |
| 4 | 不再使用 KNT/USDT 交易对 | 部署产物、业务测试、keeper 维护 | 不创建、不配置、不读取 KNT/USDT Pair | 部署产物无 `kntUsdtPair`；业务测试检查 LABUBU/USDT；keeper 价格由 LABUBU/USDT + LABUBU/KNT 推导 | PASS |
| 5 | KNT 总量 2.1 亿枚 | BSC Testnet 读取 `totalSupply()` | `210000000 KNT` | `210000000.0` | PASS |
| 6 | 推荐关系绑定: A 推荐 B/C/D/E | A 与 B/C/D/E 互转 N KNT 推荐信号 | B/C/D/E 的 referrer 均为 A | B/C/D/E referrer 全部等于 A | PASS |
| 7 | 用户入金 USDT 后全额买 LABUBU，半数 LABUBU 换 KNT，并组成 LABUBU/KNT LP | A-E 每人转入 1000 USDT 并由 keeper 处理 | 每个账号形成 1000U LP 价值和 >=6000 算力 | A-E 均为 1000U LP 价值，power 均为 6000 | PASS |
| 8 | 节点资格: 自身 >=1000U LP，直推业绩 >=3000U，有有效账户 | A 自投 1000U，B/C/D/E 直推各 1000U | A 成为节点 | A `isNode=true`，直推业绩 4000U，有效直推 4 | PASS |
| 9 | 静态收益: 按全网算力分配 | 本地 Hardhat 快进 1 天后 `keeperDistributeRewards` | 跨天后可结算静态收益 | B/C/D/E 每人到账 `157.872 KNT`；A 含静态收益在总到账中体现 | PASS 本地 |
| 10 | 算力每日 1.2% 复利 | 本地 Hardhat `evm_increaseTime(1 days + 1)` | 6000 算力变为 6072 | A 和 B 的 power 均从 6000 变为 6072 | PASS 本地 |
| 11 | 动态收益: 直推和代数奖励 | 本地 Hardhat 快进 1 天后分发 A-E | A 获得下级静态收益对应动态奖励 | A 总到账 `440.1696 KNT`，包含静态、直推动态和节点收益 | PASS 本地 |
| 12 | 节点收益: 节点平分 10% | 本地 Hardhat 快进 1 天后分发 A-E | A 作为节点获得节点奖励 | A 总到账中包含节点收益，断言通过 | PASS 本地 |
| 13 | 主动打入黑洞销毁进入排队 | B 发送 10 KNT 到 dead 地址 | burn queue 长度 +1 | queue 从 0 到 1 | PASS |
| 14 | 黑洞排队奖励 1.2 倍 | 处理一条 burn queue | 10 KNT 销毁对应 12 KNT 奖励 | `rewardAmount=12.0` 且已支付 | PASS |
| 15 | 卖出税 5% 和盈利税 30% 分配 | B 以成本 100U、现价 150U 卖出 100 KNT 到 AMM Pair | Pair 收到净额，税分配到基金会、生态、销毁、奖励池 | Pair +85 KNT；基金会/生态合计 +8 KNT；销毁 3.333333333333333333；奖励池 +3.666666666666666666 | PASS |
| 16 | 迁移仓位当天不可领取 | BSC Testnet 当天铸造迁移仓位后查询 | same-day claimable = 0 | `0.0` | PASS |
| 17 | 迁移每日释放 0.1% | 本地 Hardhat 快进 1 天后 B 领取 | 1000 KNT 仓位释放 1 KNT | B `claimMigration` 到账 `1 KNT` | PASS 本地 |
| 18 | 达成直推业绩后迁移每日释放 0.3% | 本地 Hardhat 快进 1 天后 A 领取 | 1000 KNT 仓位释放 3 KNT | A `claimMigration` 到账 `3 KNT` | PASS 本地 |
| 19 | 真链跨天收益/释放 | BSC Testnet 同日测试 | 需要真实等待至少 1 天 | 真链报告仍标记 SKIP；本地 time-travel 已验证逻辑 | SKIP 链上 / PASS 本地 |
| 20 | KNT 转账入金路径 | BSC Testnet 报告 | 当前业务以 USDT 入金为准 | 报告标记为 removed as a business entry path | N/A |
| 21 | 迁移资产以 ERC721 NFT 形态呈现 | BSC Testnet 报告和合约实现 | 迁移仓位应为 NFT 资产 | 当前实现为内部 `MigrationPosition`，非 ERC721 | GAP |

## 结论

核心链上流程已对齐: 新 USDT、两组底池（LABUBU/USDT 与 LABUBU/KNT）、A-E 推荐关系、USDT 入金 LP、节点资格、黑洞排队、卖出税和迁移当天不可领取均已通过 BSC Testnet 测试。系统已不再创建或使用 KNT/USDT 交易对。

跨天收益和迁移释放无法在 BSC Testnet 同日快进时间，已通过 Hardhat 本地 time-travel 验证。若要求链上报告也不显示 SKIP，需要等真实 24 小时后用同一批固定 A-E 私钥继续跑第二阶段测试。

目前明确缺口是 ERC721 迁移 NFT 形态尚未实现；当前合约使用内部迁移仓位结构。
