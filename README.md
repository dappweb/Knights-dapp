# KNT

KNT 合约、keeper 和 Cloudflare 管理后台 Worker。

## Cloudflare 部署步骤

Cloudflare Worker 会托管 `admin/` 里的管理后台页面，通过 `cloudflare/worker.js` 提供 keeper/admin API，并根据 `wrangler.jsonc` 里的 cron 配置定时运行 keeper。

### 1. 安装依赖

```powershell
npm install
```

确认 Wrangler 可用，并且已经登录 Cloudflare：

```powershell
npx wrangler --version
npx wrangler whoami
```

如果 `whoami` 显示未登录，先执行：

```powershell
npx wrangler login
```

### 2. 配置 Worker 变量

部署前先修改 `wrangler.jsonc`。

测试网使用顶层 `vars` 配置，需要确认：

- `KNT_CONTRACT_ADDRESS`
- `USDT_TOKEN_ADDRESS`
- `LABUBU_TOKEN_ADDRESS`
- `PANCAKE_V2_ROUTER`
- `KNT_LABUBU_PAIR`
- `LABUBU_USDT_PAIR`
- `LABUBU_SWAP_INTERMEDIATE_TOKEN` (optional; WBNB on mainnet when there is no direct LABUBU/USDT pool)
- `LABUBU_WBNB_PAIR` and `WBNB_USDT_PAIR` (required for mainnet market pricing when `LABUBU_USDT_PAIR` is empty)
- `KEEPER_START_BLOCK`
- `ACCOUNTING_START_BLOCK`

主网生产环境使用 `env.production.vars` 下的同名配置。

当前生产环境默认值：

- `BSC_CHAIN_ID=56`
- `NETWORK_NAME=bscMainnet`
- `USDT_TOKEN_ADDRESS=0x55d398326f99059fF775485246999027B3197955`
- `LABUBU_TOKEN_ADDRESS=0x3494dfE19b721DAC6c5c8d7470c8F89548177777`
- `PANCAKE_V2_ROUTER=0x10ED43C718714eb63d5aA57B78B54704E256024E`
- `MAINNET_PANCAKE_PROXY=0xc0F1Ef7FE2ae3AAD0175af192713d36eD151755a`
- `LABUBU_SWAP_INTERMEDIATE_TOKEN=0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`
- `LABUBU_WBNB_PAIR=0xdfacdc33e913710ead31ee40f9c5363ea673c421`
- `WBNB_USDT_PAIR=0x16b9a82891338f9bA80E2D6970FddA79D1eb0daE`

`KEEPER_START_BLOCK` 和 `ACCOUNTING_START_BLOCK` 必须设置为 KNT 合约部署区块，确保 Worker 从正确位置开始扫描链上事件。

### 3. 创建或配置 KV namespace

创建 KV namespace：

```powershell
npm run cf:kv:create
```

把命令返回的 namespace `id` 填入 `wrangler.jsonc`：

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "KNT_ADMIN_STATE",
      "id": "<KV_NAMESPACE_ID>"
    }
  ]
}
```

如果生产环境需要独立 KV namespace，单独创建 production 环境的 KV，并把返回的 id 填入 `env.production.kv_namespaces`：

```powershell
npx wrangler kv namespace create KNT_ADMIN_STATE --env production
```

### 4. 设置 Worker secrets

设置 keeper 私钥。这个私钥对应的钱包必须在 KNT 合约里拥有 Keeper、Manager、Admin 或 Owner 权限。

测试网/default Worker：

```powershell
npx wrangler secret put KEEPER_PRIVATE_KEY
```

生产环境 Worker：

```powershell
npx wrangler secret put KEEPER_PRIVATE_KEY --env production
```

生产环境建议把私有 RPC URL 设置为 secret，避免 API key 通过 `/api/config` 暴露：

```powershell
npx wrangler secret put BSC_RPC_URL --env production
```

`PUBLIC_BSC_RPC_URL` 保留在 `wrangler.jsonc` 中，用于钱包网络元数据，可以使用公开 RPC。

### 5. 本地运行

使用默认测试网配置：

```powershell
npm run dev:cloudflare
```

使用生产环境配置本地运行：

```powershell
npm run dev:cloudflare:production
```

### 6. 部署

部署默认测试网 Worker：

```powershell
npm run deploy:cloudflare:testnet
```

部署生产环境 Worker：

```powershell
npm run deploy:cloudflare
```

`npm run deploy:cloudflare` 和 `npm run deploy:cloudflare:production` 都会使用 `--env production` 部署生产环境。

### 7. 部署后检查

查看 Worker 日志：

```powershell
npx wrangler tail
npx wrangler tail --env production
```

打开已部署的管理后台地址，确认：

- `/api/config` 返回的 chain、contract、token、pair、explorer 配置正确。
- 连接钱包后可以完成 admin nonce 签名流程。
- 授权钱包可以手动调用 keeper 接口：
  - `POST /api/keeper/process-usdt`
  - `POST /api/keeper/maintenance`
  - `POST /api/keeper/run-all`
- `wrangler.jsonc` 里的 cron 会每 10 分钟自动运行 scheduled keeper。

不要提交 `.env`、`.dev.vars`、`.wrangler/`、`.codex_runtime/`、本地部署日志或任何私钥。
