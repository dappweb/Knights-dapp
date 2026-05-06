# Cloudflare Admin Deployment

## Files

- `wrangler.jsonc`: Worker, static assets, cron trigger, KV binding, public BSC config.
- `cloudflare/worker.js`: Admin API and scheduled keeper.
- `admin/index.html`: Admin console served by Cloudflare Worker static assets.

## One-time Cloudflare setup

```powershell
npm install
npm run cf:kv:create
```

Copy the returned KV namespace `id` into `wrangler.jsonc` under `KNT_ADMIN_STATE`.

Set `KEEPER_START_BLOCK` in `wrangler.jsonc` to the KNT deployment block before the first scheduled run. `KEEPER_SCAN_MAX_BLOCKS` limits each scan window.

Set secrets:

```powershell
npx wrangler secret put KEEPER_PRIVATE_KEY
```

`KEEPER_PRIVATE_KEY` must belong to an address that is a contract `Keeper`, `Manager`, `Admin`, or `Owner`.

For BSC mainnet production, set the private RPC URL as a Worker secret so the Alchemy key is not exposed through `/api/config`:

```powershell
npx wrangler secret put BSC_RPC_URL --env production
```

Use `BSC_MAINNET_RPC_URL` locally for Hardhat, and keep `PUBLIC_BSC_RPC_URL` on a public endpoint for wallet network metadata.

## Deploy

```powershell
npm run deploy:cloudflare
```

`npm run deploy:cloudflare` deploys the `production` environment. Use `npm run deploy:cloudflare:testnet` for the default testnet Worker.

## Local Worker

```powershell
npm run dev:cloudflare
```

## Keeper Endpoints

- `POST /api/keeper/process-usdt`
- `POST /api/keeper/maintenance`
- `POST /api/keeper/run-all`

Manual keeper endpoints require a one-time wallet signature from an on-chain `Keeper`, `Manager`, `Admin`, or `Owner`. The Admin console requests `/api/auth/nonce`, asks the wallet to sign the returned message, and submits the signature with the keeper request.

The scheduled worker runs both USDT deposit processing and LP maintenance from the cron in `wrangler.jsonc`.

## Accounting Endpoint

- `GET /api/accounting`

The Admin console uses this endpoint for the accounting tab. It scans KNT contract logs from `ACCOUNTING_START_BLOCK` (falling back to `KEEPER_START_BLOCK`), aggregates users, deposits, rewards, referrals, transfers, buys, sells, burns, and queue payments, then reads current `users`, `costBasisOf`, balances, and direct referrals from chain.

Useful query parameters:

- `fromBlock` / `toBlock`: override the scan window.
- `limit`: max records returned per table.
- `userLimit`: max user rows enriched with current on-chain state.
