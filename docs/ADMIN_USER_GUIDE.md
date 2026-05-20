# KNT Admin 和用户使用文档

本文档分为两部分：

- Admin/运营人员：使用 `KNT Admin Console` 管理合约参数、权限、Keeper、账务和日志。
- 普通用户：通过钱包、区块浏览器或外部 DApp 完成充值、推荐绑定、转账、卖出、销毁排队和奖励领取相关操作。

> 说明：本仓库内置的是 Admin Console 静态页和 Cloudflare/Node Admin API，未包含独立的普通用户前端。如果线上另有用户 DApp，请以该 DApp 的页面提示为准；本文档中的用户流程对应链上合约能力和后台账务口径。

## 1. 网络和入口

### 测试网

- 网络：BSC Testnet
- Chain ID：`97`
- 浏览器：`https://testnet.bscscan.com`
- Admin 本地调试：`npm run dev:cloudflare`
- Admin 测试网部署：`npm run deploy:cloudflare:testnet`

### 生产网

- 网络：BSC Mainnet
- Chain ID：`56`
- 浏览器：`https://bscscan.com`
- Admin 本地按生产配置调试：`npm run dev:cloudflare:production`
- Admin 生产部署：`npm run deploy:cloudflare` 或 `npm run deploy:cloudflare:production`

Admin Console 由 Cloudflare Worker 托管 `admin/` 目录，并通过相对路径 `/api/*` 调用后台接口。

## 2. Admin 使用文档

### 2.1 使用前准备

1. 安装 MetaMask 或其他兼容 EVM 的钱包。
2. 钱包切换到正确网络：测试网为 BSC Testnet，生产网为 BSC Mainnet。
3. 确认钱包地址拥有链上角色：`Owner`、`Admin`、`Manager` 或 `Keeper`。
4. 确认钱包中有足够 BNB 支付 gas。
5. 打开 Admin Console，点击右上角 `连接钱包`。
6. 页面顶部确认网络、合约地址、当前钱包地址和角色显示正确。

### 2.2 角色权限

| 角色 | 主要权限 |
| --- | --- |
| Owner | 最高权限；可转移 Owner、设置 Admin、设置核心钱包参数、执行 Admin 级操作。 |
| Admin | 可转移 Owner、设置 Admin/Manager、设置核心钱包参数、导入/修正部分业务数据。 |
| Manager | 可设置 Keeper、流动性参数、AMM Pair、Burn Queue BP、推荐信号、产币周期等。 |
| Keeper | 可执行 Keeper 类链上维护动作，如更新 LP、价格、奖励池、处理燃烧队列。 |

权限是链上状态，后台页面只负责发起交易或读取状态。交易能否成功最终由合约校验。

### 2.3 总览页

`总览` 用于快速检查系统状态：

- 奖励池 KNT：当前奖励池余额。
- Daily Emission：当前周期产币量。
- Reward Period：产币周期。
- Global LP USDT：Keeper 更新的全局 LP 估值。
- User LP USDT：用户累计入账 LP 价值。
- Total Power：系统总算力。
- KNT Price：最新 KNT 价格。
- Nodes：节点数量。
- Burn Queue：燃烧排队进度，格式为 `已处理索引 / 队列长度`。
- Last Scanned Block：Keeper 最近扫描区块。
- LP Pools：展示 KNT/LABUBU、LABUBU/USDT 或 LABUBU/WBNB/WBNB/USDT 等池子的估值和储备。

运营检查顺序建议：先看网络和合约地址，再看 LP Pools 是否有估值，最后看 Keeper 扫描区块是否持续前进。

### 2.4 权限页

`权限` 页包含角色查询、Owner 转移、角色设置和角色变更记录。

#### 查询角色

1. 输入钱包地址。
2. 点击 `查询角色`。
3. 页面显示该地址是否为 Owner、Admin、Manager、Keeper。

#### 转移 Owner

1. 确认当前连接钱包是 Owner 或 Admin。
2. 在 `新 Owner 地址` 输入目标地址。
3. 在确认框粘贴当前链上 Owner 地址。
4. 点击 `转移 Owner`。
5. 在钱包中确认交易。

注意：交易确认后，新地址立即获得 Owner 权限，原 Owner 立即失去 Owner 权限；Admin、Manager、Keeper 角色不会自动迁移。

#### 设置角色

1. 输入目标地址。
2. 选择角色：`Admin`、`Manager` 或 `Keeper`。
3. 选择状态：启用或停用。
4. 点击提交并在钱包中确认。

权限限制：

- 设置 Admin：需要 Owner 或 Admin。
- 设置 Manager：需要 Owner 或 Admin。
- 设置 Keeper：需要 Manager 或更高角色。

### 2.5 参数页

`参数` 页会发起链上交易，提交前务必核对地址、数值和当前网络。

#### 钱包参数

- Foundation Wallet：接收基金会相关税费。
- DEX Settlement Wallet：接收卖出结算净额，并参与入金换币和 LP 结算。
- Project Sink Wallet：接收不满足动态奖励条件时沉淀的奖励。
- Ecosystem Wallet：接收生态发展相关税费。

这些地址修改后不会迁移历史余额，只影响后续交易和奖励分配。

#### 流动性参数

- Pancake Router：PancakeSwap V2 Router 地址。
- Pancake Proxy：USDT 到 LABUBU 兑换代理地址，生产网当前配置使用 `0xc0F1Ef7FE2ae3AAD0175af192713d36eD151755a`。
- USDT Token：入金资产地址。
- LABUBU Token：配对资产地址。
- KNT/LABUBU Pair：主交易对地址，填写后会自动启用为 AMM Pair。
- LABUBU Swap Hop：可选中间币；生产网没有直接 LABUBU/USDT 池时使用 WBNB。
- AMM Pair：额外纳入或移出买卖识别的交易池。

权限限制：流动性参数通常需要 Manager 或更高角色。

#### 业务参数

- Burn Queue BP：燃烧排队奖励倍数，`10000 = 1 倍`，`12000 = 1.2 倍`，合约允许范围为 `10000` 到 `30000`。
- Referral Signal KNT：推荐绑定信号金额；设置为 `0` 可关闭自动信号绑定。
- 产币周期：奖励结算周期，合约允许范围为 `600` 到 `86400` 秒。

示例：

- Burn Queue BP 为 `12000` 时，用户销毁 `100 KNT`，进入待发队列的奖励为 `120 KNT`。
- Referral Signal KNT 为 `1` 时，A 向 B 转 `1 KNT`，B 再向 A 转 `1 KNT`，系统会尝试把 B 绑定到 A 名下。

### 2.6 Keeper 页

Keeper 分为四类：

| Keeper | 作用 | 风险等级 |
| --- | --- | --- |
| Observer Keeper | 只读扫链，发现 USDT 入金和链上处理状态。 | L1 |
| Market Keeper | 更新 KNT 价格和全局 LP 估值，影响税费判断和排放档位。 | L2 |
| Reward Keeper | 推进奖励池、处理燃烧队列。 | L3 |
| Deposit Keeper | 处理用户 USDT 入金，执行换币、加池和用户业务状态入账。 | L4 |

#### 保存触发条件

1. 在 `触发条件` 中设置各 Keeper 的 Enabled/Paused 和参数。
2. 点击 `保存触发条件`。
3. 钱包会签名一次后台 nonce，用于证明操作者身份。
4. 配置保存到 Cloudflare KV，不直接发链上交易。

常见参数：

- Interval Minutes：同一类 Keeper 两次自动触发的最小间隔。
- Confirmations：扫链等待确认数，越大越安全但处理越慢。
- Scan Max Blocks：单次扫描区块上限，RPC 限流时可调小。
- Deviation BP：市场参数变动阈值，`100 = 1%`。
- Min/Max Deposit USDT：Deposit Keeper 处理入金范围，Max 为 `0` 表示不设上限。
- Burn Queue Max：Reward Keeper 单次最多处理的燃烧队列条数。

#### 手动执行

按钮含义：

- `运行 Observer`：只扫链发现待处理入金，不发起链上交易。
- `执行 Deposit`：处理待处理 USDT 入金。
- `执行 Market + Reward`：更新市场参数并推进奖励/燃烧队列。
- `执行全部 Keeper`：依次运行 Observer、Deposit、LP Sync、Maintenance。

手动 Keeper API 需要钱包签名，且签名钱包必须是 Keeper、Manager、Admin 或 Owner。

#### 链上 Keeper

- 更新 LP：调用 `keeperUpdateGlobalLpValue`。
- 更新价格：调用 `keeperUpdateKntPrices`。
- 更新奖励池：调用 `adminUpdatePool`。
- 处理燃烧队列：调用 `processBurnQueue(20)`。

这些操作会发链上交易，执行前确认数值单位和网络。

### 2.7 账务页

`账务` 页从 `ACCOUNTING_START_BLOCK` 开始扫描合约事件，并聚合用户、充值、奖励、推荐、转账、买卖、销毁和队列支付。

主要区域：

- 用户详情：输入地址查看该用户的链上状态和相关流水。
- 推荐关系树：输入根地址展开团队关系。
- 用户账务总览：查看用户、推荐人、充值/LP、当前账户、奖励、节点、买卖和销毁。
- 充值记录：展示 USDT 入金、KNT/LABUBU 使用量和 LP 入账。
- 奖励记录：展示奖励发放和队列支付。
- 静态/动态奖励记录：拆分展示奖励来源。
- 销毁记录：展示燃烧入队和 Keeper 销毁。
- 推荐记录：展示推荐信号和绑定记录。
- 税费记录：按 SellSettled 事件展示交易税、增值税、砸盘税和校验差额。
- 交易与销毁：可按核心、买卖、销毁、系统、转账、全部筛选。

如果账务数据看起来不完整，先检查：

- `ACCOUNTING_START_BLOCK` 是否早于合约上线区块。
- Worker RPC 是否限流。
- `ACCOUNTING_RECORD_LIMIT` 和 `ACCOUNTING_USER_LIMIT` 是否过小。
- 页面显示的扫描区块范围是否覆盖目标交易。

### 2.8 日志页

`日志` 页用于排查 Keeper 运行情况：

- Keeper Runs：展示扫描区块、发现数量、处理数量、失败数量和时间。
- Maintenance：展示 Total LP、KNT Price、Emission、Burn Queue、TX 或错误。
- USDT Deposits：展示入金处理状态、用户、USDT、KNT、LABUBU、LP、交易或错误。

排查顺序：

1. 先看状态是否为 `failed`。
2. 再看 `TX / Error`。
3. 如果是 RPC 或 gas 问题，检查 Worker secret、RPC、keeper 钱包 BNB。
4. 如果是权限问题，回到 `权限` 页确认 keeper 钱包角色。

## 3. 普通用户使用文档

### 3.1 使用前准备

1. 安装 MetaMask 或其他兼容 EVM 的钱包。
2. 切换到项目指定网络，生产环境通常是 BSC Mainnet。
3. 钱包中准备 BNB 用于 gas。
4. 钱包中准备业务所需资产，例如 USDT 或 KNT。
5. 确认正在交互的是官方合约地址或官方 DApp。

### 3.2 充值 USDT

当前合约设计中，用户向 KNT 合约转入 USDT 后，由 Keeper 扫描并处理入金：

1. 用户在钱包或外部 DApp 中向 KNT 合约地址转入 USDT。
2. 等待区块确认。
3. Observer/Deposit Keeper 扫描到入金。
4. Deposit Keeper 执行换币、加池和用户 LP/算力入账。
5. 用户可通过用户 DApp、区块浏览器或 Admin 账务页查询记录。

注意事项：

- 请确认 USDT 地址和 KNT 合约地址均属于当前网络。
- 入金处理不是转账确认后立刻完成，取决于 Keeper 的扫描间隔、确认数和链上拥堵情况。
- 如果设置了最小/最大入金范围，超出范围的入金可能会被跳过或进入人工排查。

### 3.3 推荐绑定

用户推荐关系有两种常见方式：

- 直接调用合约 `bindReferrer(referrer)`。
- 使用 Referral Signal：推荐人和用户互转相同数量 KNT，金额等于后台设置的 Referral Signal KNT。

示例：Referral Signal KNT 为 `1` 时，A 向 B 转 `1 KNT`，B 再向 A 转 `1 KNT`，系统会尝试把 B 绑定到 A 名下。

注意事项：

- 推荐人地址不能为零地址。
- 如果用户已绑定推荐人，通常不能随意改绑。
- Referral Signal KNT 设置为 `0` 时，普通转账不会触发自动推荐信号。

### 3.4 转账 KNT

用户可以像普通 BEP-20 代币一样转账 KNT：

1. 在钱包选择 KNT。
2. 输入接收地址和数量。
3. 确认交易。

如果接收地址是已启用的 AMM Pair，合约可能按买入/卖出逻辑处理税费和成本记录。普通用户向普通地址转账前应确认接收地址不是交易池地址。

### 3.5 卖出 KNT

卖出通常通过官方 DApp 或合约支持的结算流程完成。合约会按规则计算：

- 交易税：固定为卖出 KNT 的 `5%`。
- 增值税：对盈利部分收取 `30%`，按 KNT 折算。
- 砸盘税：按 24 小时实际跌幅计算；无有效价格或价格未下跌时为 `0`。

卖出后，净额会进入 DEX Settlement Wallet 相关结算流程，具体到账方式以官方 DApp 和运营规则为准。

### 3.6 销毁并进入燃烧队列

用户可通过两种方式触发燃烧队列：

- 调用 `burnAndQueue(amount)`。
- 将 KNT 转到零地址，合约会按燃烧排队逻辑处理。

燃烧后：

1. 用户 KNT 被销毁。
2. 系统按 Burn Queue BP 计算待发奖励。
3. 记录进入燃烧队列。
4. Reward Keeper 或任何可触发队列处理的操作在奖励池充足时逐步支付。

示例：Burn Queue BP 为 `12000` 时，销毁 `100 KNT`，待发奖励为 `120 KNT`。

### 3.7 奖励和领取

系统奖励包括静态奖励、动态奖励、节点奖励和燃烧队列奖励。奖励发放依赖合约结算和 Keeper 推进：

- 静态/动态/节点奖励会在池子更新和账户结算时变化。
- 燃烧队列奖励需要奖励池余额充足，并由队列处理动作推进。
- 如果用户参与迁移仓位，可调用 `claimMigration(id)` 领取可释放部分。

用户查询方式：

- 用户 DApp：查看个人面板。
- 区块浏览器：查看合约事件和交易。
- 运营后台：Admin 在 `账务` 页输入用户地址查看用户详情。

### 3.8 常见问题

#### 充值已经转账成功，但页面没有入账

可能原因：

- Keeper 还没有扫到该区块。
- 区块确认数未达到后台设置。
- 入金金额低于最小值或高于最大值。
- RPC 限流或 Keeper 运行失败。

处理方式：提供交易哈希给运营人员，由 Admin 在 `日志` 和 `账务` 页核查。

#### 钱包提示网络错误

检查钱包网络是否为 BSC Mainnet 或 BSC Testnet，并确认 Chain ID 正确。

#### 推荐关系没有绑定成功

检查：

- 双方互转金额是否完全等于 Referral Signal KNT。
- 用户是否已经绑定过推荐人。
- Referral Signal KNT 是否被后台设置为 `0`。
- 两笔交易是否都在同一网络和同一 KNT 合约上。

#### 销毁后没有立即收到奖励

燃烧奖励进入队列，不一定即时到账。需要奖励池余额充足，并等待队列处理。

## 4. 安全注意事项

- 永远不要把私钥、助记词、`.env`、`.dev.vars` 或 Worker secret 发给任何人。
- Admin 修改地址类参数前，至少由两人复核网络、合约、目标地址和权限。
- Owner 转移前，先确认新 Owner 钱包可正常签名并有 BNB。
- 生产环境建议将私有 RPC URL 设置为 Cloudflare secret，避免 API key 通过 `/api/config` 暴露。
- Keeper 钱包需要最小必要权限和足够 BNB，不建议使用 Owner 钱包长期跑自动化。
- 普通用户只通过官方入口和官方合约交互，不点击陌生链接，不授权不明 spender。

## 5. 运营排查清单

当用户反馈异常时，按以下顺序处理：

1. 收集用户地址、交易哈希、发生时间、网络。
2. 在区块浏览器确认交易是否成功。
3. 在 Admin `账务` 页输入用户地址查看相关流水。
4. 在 Admin `日志` 页检查 Keeper 是否失败。
5. 检查 `Last Scanned Block` 是否已经超过交易区块。
6. 如果是入金问题，查看 USDT Deposits 表中的状态和错误。
7. 如果是奖励问题，查看奖励池余额、Burn Queue 进度和 Maintenance 日志。
8. 如果是权限或参数问题，先在测试环境复现，再修改生产参数。
