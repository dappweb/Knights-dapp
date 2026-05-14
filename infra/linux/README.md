# Linux + Caddy Admin Deployment

This path runs the existing Cloudflare Worker admin logic on a Linux server:

- Caddy serves `admin/` and reverse proxies `/api/*`.
- `src/admin/server.mjs` exposes the Admin API on `127.0.0.1:3000`.
- `src/admin/cron.mjs` replaces Cloudflare scheduled triggers.
- `node:sqlite` stores the former Cloudflare KV state.

Node.js 24 or newer is recommended because the Linux adapter uses the built-in `node:sqlite` module.

## 1. One-command Deploy

From the repository directory on the Linux server:

```bash
bash infra/linux/deploy.sh admin.example.com
```

Or with overrides:

```bash
DOMAIN=admin.example.com APP_DIR=/opt/knights-dapp bash infra/linux/deploy.sh
```

The script installs npm dependencies, creates `/etc/knights-admin.env` if missing, prompts for required secrets/config values, writes systemd units, appends a marked Caddy site block, starts the Admin service, starts the keeper timer, and smoke-tests `/api/config`.

If you exported Cloudflare KV `admin-state:<lowercase contract>` to JSON, import it during deployment:

```bash
STATE_JSON=/path/to/admin-state.json bash infra/linux/deploy.sh admin.example.com
```

Use `SKIP_CADDY=1` if Caddy is managed separately:

```bash
SKIP_CADDY=1 bash infra/linux/deploy.sh
```

## 2. Manual Install

```bash
cd /opt/knights-dapp
npm ci
```

Create a service user and data directory:

```bash
sudo useradd --system --home /opt/knights-dapp --shell /usr/sbin/nologin knights
sudo mkdir -p /var/lib/knights-admin
sudo chown -R knights:knights /opt/knights-dapp /var/lib/knights-admin
```

## 3. Configure Environment

```bash
sudo cp infra/linux/knights-admin.env.example /etc/knights-admin.env
sudo chmod 600 /etc/knights-admin.env
sudo editor /etc/knights-admin.env
```

Set at least:

- `BSC_RPC_URL`
- `PUBLIC_BSC_RPC_URL`
- `KEEPER_PRIVATE_KEY`
- `KNT_CONTRACT_ADDRESS`
- `USDT_TOKEN_ADDRESS`
- `LABUBU_TOKEN_ADDRESS`
- `KNT_LABUBU_PAIR`
- `KEEPER_START_BLOCK`
- `ACCOUNTING_START_BLOCK`

If migrating from Cloudflare KV, preserve the latest `admin-state:<lowercase contract>` JSON before enabling the timer, then import it:

```bash
npm run admin:import-state -- /path/to/admin-state.json
```

Otherwise set `KEEPER_START_BLOCK` to the first unprocessed block.

## 4. Install systemd Units

```bash
sudo cp infra/systemd/knights-admin.service /etc/systemd/system/
sudo cp infra/systemd/knights-keeper.service /etc/systemd/system/
sudo cp infra/systemd/knights-keeper.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now knights-admin.service
sudo systemctl enable --now knights-keeper.timer
```

Check logs:

```bash
journalctl -u knights-admin.service -f
journalctl -u knights-keeper.service -n 100
```

## 5. Configure Caddy

Copy `infra/caddy/Caddyfile.example` into your Caddy config and replace `admin.example.com`.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

The Admin page can keep using relative `/api/*` requests because Caddy proxies that path to the Node service.

## 6. Local Smoke Test

```bash
npm run admin:server
curl http://127.0.0.1:3000/api/config
npm run keeper:scheduled
```
