# KNT 项目业务逻辑测试手册

适用项目: Knights-dapp  
适用日期: 2026-05-05  
适用对象: 合约测试、链上业务测试、后台/keeper 测试、管理台验收测试

## 1. 测试目标

本手册用于测试员从零开始验证本项目全部核心业务逻辑，包括:

- KNT ERC20 基础能力和总量。
- 推荐关系绑定。
- USDT 入金、自动换 LABUBU/KNT、组 LABUBU/KNT LP，LP Token 直接进入用户钱包，同时由 KNT 合约记录 LP 价值和算力。
- 算力、静态收益、动态收益、节点收益。
- 节点资格。
- LP 提现、无 UI 合约调用、KNT 销毁和 LABUBU 退回。
- 黑洞销毁排队奖励。
- AMM 买入成本记录、卖出税、盈利税、砸盘税。
- 迁移仓位释放。
- 角色权限。
- Cloudflare Admin API、定时 keeper、后台管理台、财务统计。
- 旧合约迁移后的配置隔离。

## 2. 当前测试基线

当前后台和 wrangler 配置指向升级版代理合约:

- 网络: BSC Testnet
- Chain ID: `97`
- KNT Proxy: `0x14Dc8a0E97815128304883DEaEc89D6773937dc0`
- KNT Implementation: `0x0Ce2CCdFC43da2415Eac3cB7Dc2596B7CB39d326`
- ProxyAdmin: `0x9dfB1e1FD8d1083153d02Fd46FA0dEFbb261fAE2`
- ProxyAdmin Owner: `0x744447d8580EB900b199e852C132F626247a36F7`
- Pancake V2 Router: `0xD99D1c33F9fC3444f8101754aBC46c52416550D1`
- USDT: `0xacD944e910952c020eb129C50921f180c62c3291`
- LABUBU: `0x202C8095F5D52EDF56EaFF8c36aA930e2C414181`
- KNT/LABUBU Pair: `0x3C6934609378293B0698c1242a661a875B5f0c18`
- LABUBU/USDT Pair: `0x3d15C36a566c99bC740d2f2fA6F602B384476f9b`
- Reward period: `600` 秒。测试网为 10 分钟周期，方便验证跨期收益。
- 最新升级时间: `2026-05-05T12:42:24.700Z`
- 最新升级交易: `0xbc48f5e3cc1bfc9d63d242921ffc836ccf2bef6c670dc05bf3a449b0c1d9f75c`

历史旧合约:

- Legacy KNT: `0x5e23c00276d4454072b181eBA5079440cA6ce83f`
- Legacy KNT/LABUBU Pair: `0x3B77d4f0BEFC697ae51c39158e4161328FDeFC40`
- 旧合约仅用于历史报告和迁移对照。测试后台、keeper、业务入口均应使用当前 Proxy。

## 3. 测试准备

### 3.1 本地环境

在项目根目录执行:

```powershell
npm install
npm run compile
```

`.env` 至少需要参考 `.env.example` 配置:

- `BSC_TESTNET_RPC_URL`
- `PRIVATE_KEY`
- `FOUNDATION_WALLET`
- `DEX_SETTLEMENT_WALLET`
- `PROJECT_SINK_WALLET`
- `ECOSYSTEM_WALLET`
- `KEEPER_WALLETS`
- `PANCAKE_V2_ROUTER`
- `USDT_TOKEN`
- `LABUBU_TOKEN`
- `KNT_REWARD_PERIOD_SECONDS`
- `REFERRAL_SIGNAL_AMOUNT`

私钥只能放本地 `.env` 或 Cloudflare secret，不得提交仓库。

### 3.2 测试账号

建议准备至少 6 个地址:

- `Owner/Operator`: 部署者、管理员。
- `A`: 推荐人，节点候选。
- `B/C/D/E`: 被推荐人和普通用户。
- `Keeper`: 处理入金、维护价格、分发奖励、处理队列。

每个链上测试账号需要有:

- BSC Testnet BNB 作为 gas。
- USDT 作为入金资产。
- 少量 KNT 用于推荐信号、销毁、卖出测试。

### 3.3 产物和报告位置

当前 Proxy 验收产物:

- `deployments/bscTestnet/knt-upgradeable-test-pool.json`
- `deployments/bscTestnet/knt-pancake-test-pool.json`
- `deployments/bscTestnet/knt-upgradeable-10min-reward-report.json`
- `deployments/bscTestnet/admin-keeper-log.json`
- `deployments/local/knt-reward-tax-test-report.json`

历史/迁移对照产物:

- `deployments/bscTestnet/knt-business-test-report.json`
- `deployments/bscTestnet/knt-50-usdt-deposit-test-report.json`
- `deployments/bscTestnet/knt-50-deposit-full-business-report.json`
- `deployments/bscTestnet/knt-requirements-test-alignment.md`

历史报告中若出现 `0x5e23...A6ce83f`，只能作为旧合约业务链路样本；当前最终实现验收必须以 Proxy `0x14Dc...7dc0` 和最新 implementation `0x0Ce2...d326` 为准。

## 4. 自动化测试命令

### 4.1 本地 Hardhat 测试

用于验证可快进时间的逻辑:

```powershell
npm run test:local
npm run test:knt:upgradeable:local
npm run test:knt:rewards:local
```

期望:

- 全部测试通过。
- 静态收益、动态收益、节点收益、算力复利、迁移释放在本地 time-travel 下可验证。

### 4.2 BSC Testnet 业务测试

用于验证真实链上流程:

```powershell
npm run test:knt:business:bsc:testnet
npm run test:knt:50-deposits:bsc:testnet
npm run test:knt:upgradeable:rewards:bsc:testnet
```

期望:

- 即时链上逻辑为 `PASS`。
- 需要等待真实时间跨期的项目可为 `SKIP`，但必须有本地测试覆盖。
- 当前 implementation 升级后，应重新跑升级版收益脚本，报告中的 `contract` 必须等于当前 Proxy。

### 4.3 Keeper 脚本

```powershell
npm run keeper:process-usdt:bsc:testnet
npm run keeper:maintenance:bsc:testnet
```

期望:

- USDT 转入 KNT 合约后，keeper 能扫描并调用 `processUsdtDeposit`。
- maintenance 能更新 KNT 价格、global LP、奖励池、燃烧队列。

### 4.4 Cloudflare 本地后台

```powershell
npm run dev:cloudflare
```

期望:

- `/api/config` 返回当前部署配置。
- `/api/status` 返回链上状态。
- `/api/logs` 返回 keeper 运行日志。
- `/api/accounting` 返回财务聚合数据。

## 5. 角色权限测试

### 5.1 权限矩阵

| 角色 | 可执行能力 |
| --- | --- |
| Owner | 全部 Admin 能力、转移所有权、设置 Admin |
| Admin | 设置 Manager、核心钱包、导入入金、设置推荐人、铸造迁移仓位 |
| Manager | 设置 Keeper、TaxRecorder、AMM Pair、流动性配置、燃烧队列倍率、推荐信号金额、奖励周期 |
| Keeper | 处理 USDT 入金、更新价格、更新 LP、更新奖励池、分发奖励 |
| TaxRecorder | 手动记录买入成本 |
| 普通用户 | 转账、绑定推荐人、入金、提现、销毁排队、领取迁移释放 |

### 5.2 用例

| ID | 步骤 | 期望 |
| --- | --- | --- |
| R-01 | 普通用户调用 `setKeeper` | 失败，报 `Not manager` |
| R-02 | 普通用户调用 `setAdmin` | 失败，报 `Not admin` |
| R-03 | Owner 设置 Admin，Admin 设置 Manager，Manager 设置 Keeper 和 TaxRecorder | 全部成功，`roleOf` 返回对应角色为 true |
| R-04 | Keeper 调 `keeperUpdateKntPrices` 和 `keeperUpdateGlobalLpValue` | 成功 |
| R-05 | Keeper 调 `setReferralSignalAmount` | 失败，报 `Not manager` |
| R-06 | Manager 调 `setEcosystemWallet` | 失败，报 `Not admin` |

## 6. 部署和流动性测试

| ID | 步骤 | 期望 |
| --- | --- | --- |
| D-01 | 读取 `totalSupply()` | `210000000 KNT` |
| D-02 | 检查当前后台配置 KNT 地址 | 必须是 Proxy `0x14Dc...7dc0` |
| D-03 | 检查 KNT/LABUBU Pair | pair 中包含 KNT 和 LABUBU，reserve 和 LP supply 大于 0 |
| D-04 | 检查 LABUBU/USDT Pair | pair 中包含 LABUBU 和 USDT，reserve 和 LP supply 大于 0 |
| D-05 | 检查配置中不存在 KNT/USDT 业务依赖 | keeper 价格应由 LABUBU/USDT 和 KNT/LABUBU 推导 |
| D-06 | 检查旧合约是否仍被后台使用 | 后台、wrangler、keeper 不得指向旧合约 |

## 7. 推荐关系测试

推荐绑定支持两种方式:

- 用户主动调用 `bindReferrer(referrer)`。
- 设置 `referralSignalAmount = N` 后，A 向 B 转 `N KNT`，B 再向 A 转 `N KNT`，B 绑定到 A。

| ID | 步骤 | 期望 |
| --- | --- | --- |
| F-01 | 设置推荐信号金额为 `1 KNT` | `referralSignalAmount()` 为 `1` |
| F-02 | A 与 B/C/D/E 分别互转 `1 KNT` | B/C/D/E 的 `referrerOf` 均为 A |
| F-03 | 用户重复绑定推荐人 | 失败，报 `Already bound` |
| F-04 | 用户绑定自己为推荐人 | 失败，报 `Self referrer` |
| F-05 | 构造 A -> B -> C 后尝试 A 绑定 C | 失败，报 `Referral cycle` |
| F-06 | 新用户无推荐人入金 | 默认推荐人应为 owner |

## 8. USDT 入金和组 LP 测试

业务入口是用户把 USDT 转入 KNT 合约，再由 Keeper 处理。

核心流程:

1. 用户转 USDT 到 KNT 合约。
2. Keeper 扫描 USDT `Transfer` 日志。
3. Keeper 调 `processUsdtDeposit(account, amount, depositId, ...)`。
4. 合约用全部 USDT 买 LABUBU。
5. 一半 LABUBU 换 KNT。
6. KNT + 剩余 LABUBU 加入 KNT/LABUBU LP，LP Token 直接发送到用户钱包。
7. 合约同步给用户增加 LP 记账、LP 价值和算力，用于收益、节点和推荐业绩计算。

| ID | 步骤 | 期望 |
| --- | --- | --- |
| P-01 | 用户 A 转 `1000 USDT` 到 KNT 合约 | KNT 合约 USDT 余额增加 |
| P-02 | Keeper 处理该笔入金 | 发出 `UsdtDepositProcessed` 和 `UsdtDeposited` |
| P-03 | 查看用户 `users(A)` | `lpValueUsdt = 1000`，`power = 6000` |
| P-04 | 重复使用同一 `depositId` 调用 | 失败，报 `Deposit processed` |
| P-05 | 合约 USDT 余额不足时处理入金 | 失败，报 `Insufficient USDT` |
| P-06 | 流动性配置为空时处理入金 | 失败，报 `Liquidity not configured` |
| P-07 | deadline 已过期 | 失败，报 `Expired` |
| P-08 | min 参数高于实际成交 | 交易回滚，不应产生用户记账 |

验收数值:

- `lpValueUsdt` 应等于入金 USDT 金额。
- `power = lpValueUsdt * 6`。
- 未用完的 KNT 应销毁并产生 `LiquidityKntBurned`。
- 未用完的 LABUBU 应退给用户。
- 本次新增的 LABUBU/KNT LP Token 应进入用户钱包，KNT 合约只保留内部 LP 记账、LP 价值和算力数据。
- 同一笔 USDT 入金只能处理一次。

批量入金验收口径:

- 低门槛样本: A-E 每人入金 `50 USDT` 时，每人应形成 `50 USDT` LP 价值和 `300` 算力；A 的直推 LP 业绩为 `200 USDT`，有效直推数为 0，不应成为节点。
- 压力样本: `50` 笔入金、每笔 `100 USDT`、A-E 轮询处理时，每个账号应累计 `10` 笔、`1000 USDT` LP 价值和 `6000` 算力；全局 LP 价值增加 `5000 USDT`，全局算力增加 `30000`。
- 入金幂等: 每笔报告中的 `processedBefore` 应为 `false`，`processedAfter` 应为 `true`；keeper 再次扫描同一 `Transfer` 时应标记为已处理或跳过，不得再次记账。
- 当前仓库里的 50U 和 50 笔压力报告来自迁移前旧合约样本，只能验证业务口径；最终 Proxy 验收时应按同一口径重新生成当前 Proxy 报告。

## 9. 节点资格测试

节点资格:

- 自身 LP 价值 >= `1000 USDT`
- 直推 LP 业绩 >= `3000 USDT`
- 有至少 1 个有效直推账户
- 有效直推账户要求该直推自身 LP 价值 >= `100 USDT`

| ID | 步骤 | 期望 |
| --- | --- | --- |
| N-01 | A 自投 `1000 USDT`，B/C/D/E 各入金 `1000 USDT` 且均为 A 直推 | A `isNode = true` |
| N-02 | A 自投不足 `1000 USDT` | A 不成为节点 |
| N-03 | A 直推业绩不足 `3000 USDT` | A 不成为节点 |
| N-04 | B/C/D/E 每人只入金 `50 USDT` | A `directEffectiveCount = 0`，不成为节点 |
| N-05 | A 或直推提现导致低于门槛 | 节点状态自动取消，发 `NodeStatusUpdated(false)` |

## 10. 收益和算力测试

### 10.1 奖励规则

- 基础周期释放: `1560 KNT`
- 释放上限: `3360 KNT`
- 每增加 `10000 USDT` 全局 LP，周期释放增加 `100 KNT`
- 静态收益: 50%
- 动态收益: 40%
- 节点收益: 10%
- 算力每周期复利: 1.2%
- 测试网当前周期为 600 秒；历史文档中的“天”在当前测试环境等价于一个 reward period。

动态收益:

- 1 代: 下级静态收益的 20%
- 2-10 代: 每代 5%
- 11-15 代: 每代 3%
- 有效直推数 `n` 解锁 `n * 2` 代。
- 有效直推数 >= 8 解锁 15 代。
- 未满足代数资格的动态收益沉淀到 `projectSinkWallet`。

### 10.2 用例

| ID | 步骤 | 期望 |
| --- | --- | --- |
| Y-01 | 奖励池注入足够 KNT | `rewardPool` 增加，发 `RewardsFunded` |
| Y-02 | 入金后等待 1 个 reward period，本地用 `evm_increaseTime` | `currentDay()` 增加 |
| Y-03 | Keeper 调 `adminUpdatePool` | 发 `PoolUpdated`，静态/动态/节点池按比例拆分 |
| Y-04 | Keeper 调 `keeperDistributeRewards([accounts])` | 用户收到 `RewardDistributed` |
| Y-05 | 检查普通用户算力 | 6000 算力跨期后变为 6072 |
| Y-06 | A 为节点且有 B/C/D/E 直推 | A 应获得静态、动态、节点收益 |
| Y-07 | 无资格上级接收动态收益 | 对应动态收益沉淀到项目沉淀钱包 |
| Y-08 | 奖励池不足 | 释放量不超过 `rewardPool` |

自动化参考:

- 本地 `test/knt-all-in-one-local.cjs` 已验证 B/C/D/E 每人到账 `157.872 KNT`，A 到账 `440.1696 KNT`。

### 10.3 链上 10 分钟收益样本

`deployments/bscTestnet/knt-upgradeable-10min-reward-report.json` 记录了一次 Proxy 地址上的真实链上跨期分发样本:

| 验证项 | 样本结果 |
| --- | --- |
| 报告时间 | `2026-05-05T04:49:45.430Z` |
| 合约地址 | `0x14Dc8a0E97815128304883DEaEc89D6773937dc0` |
| 周期 | `600` 秒 |
| 状态 | `PASS` |
| 交易 | `0xaf1669cde45490e29a21b9389dec4186a0cbd9e03e397956c4d39395938b4622` |
| 周期释放 | `3360 KNT` |
| 释放拆分 | 静态 `1680 KNT`，动态 `1344 KNT`，节点 `336 KNT` |
| 事件数量 | `PoolUpdated` 1 次，`StaticRewardAccrued` 15 次，`DynamicRewardAccrued` 23 次，`DynamicSunk` 15 次，`RewardDistributed` 15 次 |
| 奖励池变化 | `189000000 KNT` 降至 `188996640 KNT` |
| 节点样本 | 2 个节点各计入 `168 KNT` 节点收益 |

注意: 该报告发生在最新 implementation `0x0Ce2...d326` 升级之前。最终验收最新实现时，必须在 `2026-05-05T12:42:24.700Z` 之后重新运行:

```powershell
npm run test:knt:upgradeable:rewards:bsc:testnet
```

并确认报告中的 implementation 和部署产物一致。

## 11. LP 记账退出和用户自持 LP 测试

当前模式下，USDT 入金形成的 LABUBU/KNT LP Token 直接进入用户钱包。KNT 合约不托管这部分 LP，也不会代用户调用 Pancake 撤池。KNT 合约只记录用户对应的 LP Token 数量、LP USDT 价值、算力、直推业绩和节点状态。

用户退出入口是 Pancake 上的钱包自持 LP 撤池。KNT 合约不再暴露用户可调用的手工退出函数。

- 用户用钱包里的 LABUBU/KNT LP Token 在 Pancake 自行撤池。
- 合约不会调用 Pancake Router `removeLiquidity`。
- Keeper 扫描 LABUBU/KNT Pair 的 LP `Transfer`，确认 LP 转出到 Pair 后调用 `keeperReduceUserLpAmountFromSource` 或 `keeperReduceUserLp` 同步扣减内部 LP 记账。
- Keeper 查同一笔交易里的 KNT `Transfer(pair -> recipient)`，按实际收到 KNT 的 `recipient` 调用 `keeperBurnFromSource` 销毁撤池得到的 KNT。
- 撤 LP 得到的 LABUBU 归用户或实际接收地址。
- 用户 LP 价值、算力、直推业绩、节点资格和全局 LP 数据必须同步扣减。

| ID | 步骤 | 期望 |
| --- | --- | --- |
| W-01 | 用户 E 已有 `1000 USDT` LP 价值，在 Pancake 撤出部分 LABUBU/KNT LP | 链上发生真实 Pancake 撤池，LP Token 从用户转入 Pair |
| W-02 | 查看 E 用户信息 | `lpValueUsdt` 从 1000 降到 900，算力按比例减少 |
| W-03 | 查看全局数据 | `totalLpValueUsdt` 和 `totalPower` 按比例减少 |
| W-04 | 查看资产流 | Keeper 扣减内部 LP 记账，撤 LP 得到的 KNT 被 keeper 销毁，LABUBU 留给实际接收地址 |
| W-05 | Keeper 扣减金额超过用户存款 | 失败，报 `Insufficient deposit` |
| W-06 | Keeper 扣减 amount 或 lpValue 为 0 | 失败，报 `Zero amount` |
| W-07 | 用户钱包直接打开 Pancake 查看该入金形成的 LP | 应显示用户可管理的 LABUBU/KNT LP Token |
| W-08 | 用户在 Pancake 撤 LP 且 `to` 地址不是 LP 持有人 | Keeper 应按实际 KNT `Transfer(pair -> recipient)` 的 recipient 销毁 KNT |
| W-09 | 用户尝试在 KNT 合约直接调用公开退出函数 | ABI 中不存在公开用户退出入口 |

## 12. 黑洞销毁排队奖励测试

进入排队的方式:

- `transfer(0x000000000000000000000000000000000000dEaD, amount)`
- `transfer(0x0000000000000000000000000000000000000000, amount)`
- `burnAndQueue(amount)`

注意: 直接调用 ERC20 `burn(amount)` 只销毁，不进入奖励队列。

| ID | 步骤 | 期望 |
| --- | --- | --- |
| B-01 | 用户 B 转 `10 KNT` 到 dead 地址 | `burnQueueLength + 1`，`totalBurned + 10` |
| B-02 | 查看队列条目 | `burnedAmount = 10`，默认 `rewardAmount = 12` |
| B-03 | 奖励池充足时调用 `processBurnQueue(1)` | 用户收到 `12 KNT`，队列 `paid = true` |
| B-04 | 奖励池不足时调用 `processBurnQueue` | 不付款，`nextPayoutIndex` 不应跳过未支付队列 |
| B-05 | Manager 修改 `burnQueueRewardBP` 为 10000/12000/30000 | 分别代表 1x/1.2x/3x，边界内成功 |
| B-06 | Manager 设置小于 10000 或大于 30000 | 失败，报 `Invalid reward` |

## 13. AMM 买卖和税费测试

### 13.1 买入成本

| ID | 步骤 | 期望 |
| --- | --- | --- |
| T-01 | Keeper 更新 KNT 当前价格 | `latestKntPriceUsdt` 更新 |
| T-02 | 从 AMM Pair 转 KNT 到用户 | 自动记录用户买入成本 |
| T-03 | TaxRecorder 调 `recordBuy(user, kntAmount, usdtSpent)` | 手动成本增加，发 `BuyRecorded` |
| T-04 | 非 TaxRecorder 调 `recordBuy` | 失败，报 `Not recorder` |

### 13.2 卖出税

用户向已标记的 AMM Pair 转 KNT 时自动触发卖出结算:

- 固定卖出税: 5%
- 卖出税分配: 2% 入奖励池，3% 入 Foundation
- 盈利税: 对利润收 30%
- 盈利税分配: 1/6 入奖励池，1/3 销毁，1/2 入 Ecosystem
- 24h 价格下跌时: 按实际跌幅收取额外砸盘税，跌多少收多少
- 砸盘税分配: 一半入奖励池，一半销毁

| ID | 步骤 | 期望 |
| --- | --- | --- |
| T-05 | 用户成本 100U，当前价值 150U，卖出 `100 KNT` | Pair 收 `85 KNT`，其余按卖出税+盈利税分配 |
| T-06 | 当前价格低于 24h 价格 12.5% | 增加 12.5% 砸盘税 |
| T-07 | 当前价格未低于 24h 价格 | 砸盘税为 0 |
| T-08 | 无盈利或无成本记录 | 盈利税为 0 |
| T-09 | 卖出后检查 `costBasisOf` | 成本按卖出比例消耗 |
| T-10 | 未标记 AMM Pair 的普通转账 | 不应触发税费 |

## 14. 迁移仓位测试

当前迁移仓位是合约内部 `MigrationPosition`，不是 ERC721 NFT。

释放规则:

- 当期铸造，当期不可领取。
- 基础释放: 每个 reward period 释放原始仓位的 0.1%。
- 直推业绩 >= `3000 USDT` 后加速释放: 每个 reward period 0.3%。
- 累计领取不超过原始仓位。

| ID | 步骤 | 期望 |
| --- | --- | --- |
| M-01 | Admin 调 `mintMigration(B, 1000 KNT)` | 返回 migration id，发 `MigrationMinted` |
| M-02 | 同期查询 `migrationClaimable(id)` | 0 |
| M-03 | 等待 1 个 reward period 后查询普通用户仓位 | 可领取 `1 KNT` |
| M-04 | 等待 1 个 reward period 后查询已达成 3000U 直推业绩用户 | 可领取 `3 KNT` |
| M-05 | 非仓位 owner 调 `claimMigration` | 失败，报 `Not owner` |
| M-06 | 无可领取额度时调用 | 失败，报 `Nothing claimable` |
| M-07 | 奖励池/自由余额不足时调用 | 失败，报 `Insufficient pool` |

## 15. Keeper 和后台 API 测试

### 15.1 API 清单

| API | 方法 | 验证点 |
| --- | --- | --- |
| `/api/config` | GET | 返回部署配置 |
| `/api/status` | GET | 返回链上合约状态、LP、价格、keeper 状态 |
| `/api/logs` | GET | 返回 KV 中的 keeper 运行日志 |
| `/api/accounting` | GET | 扫描事件并聚合用户财务数据 |
| `/api/roles?account=...` | GET | 返回账号角色 |
| `/api/auth/nonce` | POST | 返回待签名消息和 nonce |
| `/api/keeper/settings` | GET/POST/PUT | 读取/修改 keeper 设置 |
| `/api/keeper/observer` | POST | 扫描 USDT 入金事件 |
| `/api/keeper/process-usdt` | POST | 处理已发现入金 |
| `/api/keeper/maintenance` | POST | 更新市场、奖励池、燃烧队列 |
| `/api/keeper/run-all` | POST | 执行 observer + deposit + maintenance |

### 15.2 API 用例

| ID | 步骤 | 期望 |
| --- | --- | --- |
| API-01 | GET `/api/config` | `contract` 等于当前 Proxy |
| API-02 | GET `/api/status` | 返回 `ok: true`，LP pair 和合约指标完整 |
| API-03 | POST keeper 接口但不带签名 | 401 |
| API-04 | 使用非 Keeper/Admin/Manager/Owner 钱包签名 | 403 |
| API-05 | 使用过期或重复 nonce | 401 |
| API-06 | Keeper 钱包签名调用 `/api/keeper/run-all` | 成功，返回 observer/deposits/maintenance |
| API-07 | 修改 keeper settings 的 interval、confirmations、scanMaxBlocks、min/max deposit | 返回归一化后的设置 |
| API-08 | settings 传入越界值 | 被限制到允许区间 |

### 15.3 定时任务

wrangler 当前 cron:

```json
"crons": ["*/10 * * * *"]
```

测试点:

- 每 10 分钟应自动判断是否运行 observer、deposit、market、reward。
- `KEEPER_CONFIRMATIONS` 应控制确认数。
- `KEEPER_SCAN_MAX_BLOCKS` 应控制单次扫描范围。
- price/lp deviation threshold 为 0 时，只要触发维护就应处理市场更新。
- 运行记录应写入 KV，并可由 `/api/logs` 和后台日志页看到。

### 15.4 Keeper 日志验收样本

`deployments/bscTestnet/admin-keeper-log.json` 是后台日志页和 `/api/logs` 的本地样本，当前应按以下口径验收:

| 验证项 | 样本结果 |
| --- | --- |
| contract | `0x14Dc8a0E97815128304883DEaEc89D6773937dc0` |
| usdt | `0xacD944e910952c020eb129C50921f180c62c3291` |
| lastScannedBlock | `105586019` |
| observer runs | 3 次 |
| deposits | 50 条，全部 `skipped`，原因是链上已处理 |
| maintenance | 4 次，全部 `processed` |
| priceSnapshots | 4 条 |
| 最新维护价格 | `3.124134021079283292 USDT/KNT` |
| 最新维护全局 LP 估值 | `1645326.8042158566584 USDT` |
| 最新维护交易 | `updatePrice`、`updateLp`、`updatePool`、`processBurnQueue` 均有 tx hash |

日志验收规则:

- observer 扫到已由脚本处理过的 USDT `Transfer` 时，允许记录为 `skipped`，但必须带 `reason: already processed on-chain`，且 `failed` 为 0。
- maintenance 必须同时写入价格、LP 估值、释放步进、burn queue 状态和交易 hash。
- 后台 Logs 页面展示的 contract、usdt、pair 地址必须和当前 Proxy 部署产物一致，不得混用 Legacy KNT 或旧 pair。
- 如果 KV 里没有日志，接口需要返回空列表和明确状态，不应导致管理台白屏。

## 16. 管理台 UI 测试

页面:

- `admin/index.html`
- `admin/keeper-logs.html`

核心页面模块:

- Overview: 合约概览、LP 池、价格、奖励池。
- Roles: 查询角色、设置 Admin/Manager/Keeper/TaxRecorder。
- Params: 设置钱包、流动性配置、AMM Pair、Burn Queue BP、Referral Signal。
- Keeper: 设置定时参数、手动运行 observer/process/maintenance/run-all。
- Accounting: 用户、推荐树、入金、奖励、账务流水。
- Logs: keeper 运行记录、入金处理记录、maintenance 记录。

UI 验收:

| ID | 步骤 | 期望 |
| --- | --- | --- |
| UI-01 | 打开后台 | 自动加载 `/api/config` 和 `/api/status` |
| UI-02 | 点击连接钱包 | 切到 BSC Testnet，显示当前账号角色 |
| UI-03 | 普通用户打开 Keeper 操作 | 不允许执行 |
| UI-04 | Keeper/Admin 钱包执行 run-all | 钱包签名一次，接口返回成功，页面刷新日志 |
| UI-05 | 设置角色 | 钱包交易确认后，`roleOf` 和页面显示同步更新 |
| UI-06 | 修改参数 | 链上交易成功后，页面状态刷新 |
| UI-07 | Accounting 查询用户 | 能看到 LP、算力、静态/动态/节点收益、成本、余额、直推列表 |
| UI-08 | Logs 页面读取 `admin-keeper-log.json` | 展示维护、入金、LP 和队列信息 |

## 17. 财务和事件统计测试

`/api/accounting` 需要从链上事件聚合:

- `Transfer`
- `ReferralSignal`
- `ReferrerBound`
- `Deposited`
- `UsdtDeposited`
- `KeeperLpReduced`
- `RewardsFunded`
- `PoolUpdated`
- `RewardDistributed`
- `StaticRewardAccrued`
- `DynamicRewardAccrued`
- `NodeStatusUpdated`
- `BurnQueued`
- `QueuePaid`
- `BuyRecorded`
- `SellSettled`
- `DynamicSunk`
- `LiquidityKntBurned`
- `MigrationMinted`
- `MigrationClaimed`

验收:

- 总用户数、总入金、总奖励、总卖出税、总销毁、队列支付与事件一致。
- 单用户详情与链上 `users(address)`、`balanceOf`、`costBasisOf` 一致。
- 推荐树与 `directReferralsOf` 一致。
- 分页/limit 参数不会漏算总数，只限制返回列表长度。

## 18. 负向和边界测试

| ID | 测试点 | 期望 |
| --- | --- | --- |
| E-01 | 零地址钱包参数 | 失败 |
| E-02 | 零金额入金/提现/销毁/迁移 | 失败 |
| E-03 | 未授权角色调用管理函数 | 失败 |
| E-04 | 重复入金 depositId | 失败 |
| E-05 | 推荐关系自循环 | 失败 |
| E-06 | 直接 `burn()` | 只销毁，不进入 queue |
| E-07 | AMM pair 未配置 | 普通转账不收税 |
| E-08 | 价格为 0 | 不应记录自动买入成本，不产生 dump tax |
| E-09 | 奖励池不足 | 不超发，不越过队列 |
| E-10 | 旧合约地址入金 | 不应被当前 keeper 处理 |
| E-11 | Cloudflare KV 未配置 | 需要返回明确错误 |
| E-12 | Cloudflare secret `KEEPER_PRIVATE_KEY` 未配置 | keeper 写操作失败并提示 |

## 19. 验收标准

测试通过标准:

- `npm run compile` 通过。
- `npm run test:local` 通过。
- `npm run test:knt:upgradeable:local` 通过。
- `npm run test:knt:rewards:local` 通过。
- BSC Testnet 即时业务测试为 PASS。
- BSC Testnet 需要真实等待跨期的项目可以 SKIP，但必须被本地 time-travel 测试覆盖。
- 当前后台和 keeper 只指向升级版 Proxy。
- 不创建、不配置、不依赖 KNT/USDT Pair。
- USDT 入金幂等，不能重复处理。
- 税费、奖励、节点资格、提现、迁移释放的链上数据和事件一致。
- Admin API 的手动 keeper 操作必须经过钱包签名和角色校验。
- 最新 implementation 升级后，旧报告只能作为历史样本；最终签字必须使用升级后的新报告。

阻塞级问题:

- 任意未授权账号能执行管理/keeper 函数。
- 同一笔 USDT 入金可重复处理。
- 卖出税、盈利税、砸盘税金额或去向错误。
- 奖励池超发或 burn queue 跳过未付款队列。
- 节点资格、动态代数、迁移加速释放计算错误。
- 后台/keeper 指向旧合约或错误 token/pair。

已知业务缺口:

- 迁移仓位当前不是 ERC721 NFT，而是内部 `MigrationPosition`。如果需求要求 NFT 形态，此项仍未实现，应单独立项测试和开发。

## 20. 实测证据索引

| 证据 | 用途 | 当前结论 | 注意事项 |
| --- | --- | --- | --- |
| `knt-upgradeable-test-pool.json` | 当前 Proxy、implementation、pair、wallet、upgrade 记录 | 可作为当前部署基线 | 以 `KNTAllInOne = 0x14Dc...7dc0` 为准 |
| `knt-pancake-test-pool.json` | Pancake 流动性和 pair 地址 | 可作为当前底池基线 | 不得读取旧 `0x3B77...FC40` pair |
| `knt-upgradeable-10min-reward-report.json` | 10 分钟周期收益链上样本 | Proxy 地址 PASS | 发生在最新 implementation 升级前，最终验收需复跑 |
| `admin-keeper-log.json` | keeper observer/maintenance 日志样本 | 指向当前 Proxy，维护记录正常 | deposits 为 skipped 是因为链上已处理，不代表失败 |
| `knt-50-usdt-deposit-test-report.json` | 50U 低门槛入金和节点未达标样本 | 业务口径 PASS | 旧合约样本，不能作为当前 Proxy 签字依据 |
| `knt-50-deposit-full-business-report.json` | 50 笔入金、提现、销毁、卖出、迁移同日保护样本 | 业务口径 PASS/SKIP | 旧合约样本，当前 Proxy 需复跑 |
| `knt-requirements-test-alignment.md` | 需求与历史测试结果对齐 | 可用于追溯差距 | 记录的 KNT 为 Legacy 地址 |

最终测试记录表建议包含:

- 执行时间、执行人、网络、chainId、RPC。
- 当前 Proxy、implementation、ProxyAdmin、USDT、LABUBU、两组 pair。
- 每个命令的输出报告路径、PASS/FAIL/SKIP 数量。
- 每个链上用例的 tx hash、事件名、关键前后余额。
- SKIP 的原因、替代覆盖方式和需要二阶段复测的时间点。

## 21. 推荐执行顺序

1. 执行本地编译和本地测试。
2. 校验部署产物、wrangler 配置和当前 Proxy 地址。
3. 确认最新 implementation 升级时间后，在 BSC Testnet 执行基础业务脚本。
4. 人工验证推荐、入金、节点、提现、销毁、卖出、迁移。
5. 运行 keeper 脚本或后台 run-all。
6. 验证 `/api/status`、`/api/logs`、`/api/accounting`。
7. 记录所有交易 hash、事件、前后余额和报告文件。
8. 等待一个 reward period 后补测链上收益和迁移释放；测试网当前为 600 秒。
9. 汇总 PASS/FAIL/SKIP，SKIP 必须写明原因和替代覆盖方式。
