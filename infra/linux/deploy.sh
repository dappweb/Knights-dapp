#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

DOMAIN="${DOMAIN:-${1:-}}"
APP_DIR="${APP_DIR:-${REPO_ROOT}}"
SERVICE_USER="${SERVICE_USER:-knights}"
ENV_FILE="${ENV_FILE:-/etc/knights-admin.env}"
STATE_DIR="${STATE_DIR:-/var/lib/knights-admin}"
ADMIN_HOST="${ADMIN_HOST:-127.0.0.1}"
ADMIN_PORT="${ADMIN_PORT:-3000}"
KEEPER_TIMER_INTERVAL="${KEEPER_TIMER_INTERVAL:-1min}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
SKIP_CADDY="${SKIP_CADDY:-0}"
NPM_INSTALL_ARGS="${NPM_INSTALL_ARGS:-ci --omit=dev}"
STATE_JSON="${STATE_JSON:-}"

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

log() {
  printf '[knights-deploy] %s\n' "$*"
}

die() {
  printf '[knights-deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  bash infra/linux/deploy.sh admin.example.com

Environment overrides:
  DOMAIN=admin.example.com
  APP_DIR=/opt/knights-dapp
  ENV_FILE=/etc/knights-admin.env
  SERVICE_USER=knights
  ADMIN_PORT=3000
  SKIP_CADDY=1

Run this from the cloned Knights-dapp repository on the Linux server.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local escaped="${value//&/\\&}"
  if $SUDO grep -q "^${key}=" "$file"; then
    $SUDO sed -i "s|^${key}=.*|${key}=${escaped}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" | $SUDO tee -a "$file" >/dev/null
  fi
}

get_env_value() {
  local key="$1"
  if [[ ! -f "${ENV_FILE}" ]]; then
    return 0
  fi
  $SUDO awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"
}

prompt_env_if_empty() {
  local key="$1"
  local label="$2"
  local current
  current="$(get_env_value "$key" || true)"
  if [[ -n "${current}" ]]; then
    return
  fi
  if [[ ! -t 0 ]]; then
    die "${key} is empty in ${ENV_FILE}. Fill it and rerun."
  fi

  local value
  if [[ "${key}" == "KEEPER_PRIVATE_KEY" ]]; then
    read -r -s -p "${label}: " value
    printf '\n'
  else
    read -r -p "${label}: " value
  fi
  [[ -n "${value}" ]] || die "${key} cannot be empty"
  set_env_value "$ENV_FILE" "$key" "$value"
}

write_systemd_units() {
  local node_bin="$1"
  local service_group
  service_group="$($SUDO id -gn "$SERVICE_USER")"

  log "Writing systemd units"
  $SUDO tee /etc/systemd/system/knights-admin.service >/dev/null <<EOF
[Unit]
Description=Knights Admin API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${node_bin} --no-warnings=ExperimentalWarning src/admin/server.mjs
Restart=always
RestartSec=5
User=${SERVICE_USER}
Group=${service_group}

[Install]
WantedBy=multi-user.target
EOF

  $SUDO tee /etc/systemd/system/knights-keeper.service >/dev/null <<EOF
[Unit]
Description=Knights scheduled keeper run
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${node_bin} --no-warnings=ExperimentalWarning src/admin/cron.mjs
User=${SERVICE_USER}
Group=${service_group}
EOF

  $SUDO tee /etc/systemd/system/knights-keeper.timer >/dev/null <<EOF
[Unit]
Description=Run Knights scheduled keeper

[Timer]
OnBootSec=2min
OnUnitActiveSec=${KEEPER_TIMER_INTERVAL}
AccuracySec=10s
Persistent=true
Unit=knights-keeper.service

[Install]
WantedBy=timers.target
EOF
}

write_caddyfile() {
  [[ "${SKIP_CADDY}" == "1" ]] && {
    log "Skipping Caddy because SKIP_CADDY=1"
    return
  }
  [[ -n "${DOMAIN}" ]] || {
    usage
    die "Domain is required unless SKIP_CADDY=1"
  }
  require_command caddy

  log "Updating Caddyfile for ${DOMAIN}"
  local tmp backup
  tmp="$(mktemp)"
  backup="${CADDYFILE}.bak.$(date +%Y%m%d%H%M%S)"

  if [[ -f "${CADDYFILE}" ]]; then
    $SUDO cp "$CADDYFILE" "$backup"
    $SUDO awk '
      /# BEGIN knights-admin/ { skip = 1; next }
      /# END knights-admin/ { skip = 0; next }
      !skip { print }
    ' "$CADDYFILE" > "$tmp"
  else
    $SUDO mkdir -p "$(dirname "$CADDYFILE")"
    : > "$tmp"
  fi

  cat >> "$tmp" <<EOF

# BEGIN knights-admin
${DOMAIN} {
    encode zstd gzip

    @api path /api/*
    handle @api {
        reverse_proxy ${ADMIN_HOST}:${ADMIN_PORT}
    }

    handle {
        root * ${APP_DIR}/admin
        try_files {path} /index.html
        file_server
    }
}
# END knights-admin
EOF

  $SUDO install -m 0644 "$tmp" "$CADDYFILE"
  rm -f "$tmp"
  $SUDO caddy validate --config "$CADDYFILE"
  $SUDO systemctl enable --now caddy
  $SUDO systemctl reload caddy || $SUDO systemctl restart caddy
}

main() {
  [[ "$(uname -s)" == "Linux" ]] || die "This script is for Linux servers"
  [[ -f "${APP_DIR}/package.json" ]] || die "APP_DIR does not look like the repository root: ${APP_DIR}"
  [[ "${APP_DIR}" != /root/* ]] || die "Do not deploy from /root; move the repo to /opt/knights-dapp or set APP_DIR"

  require_command node
  require_command npm
  require_command systemctl

  local node_major node_bin
  node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
  [[ "${node_major}" -ge 24 ]] || die "Node.js 24+ is required for node:sqlite; current major is ${node_major}"
  node_bin="$(command -v node)"

  log "Repository: ${APP_DIR}"
  log "Installing npm dependencies: npm ${NPM_INSTALL_ARGS}"
  (cd "$APP_DIR" && npm ${NPM_INSTALL_ARGS})

  if ! $SUDO id -u "$SERVICE_USER" >/dev/null 2>&1; then
    log "Creating service user: ${SERVICE_USER}"
    $SUDO useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  fi

  log "Preparing state directory: ${STATE_DIR}"
  $SUDO mkdir -p "$STATE_DIR"
  $SUDO chown -R "${SERVICE_USER}:$($SUDO id -gn "$SERVICE_USER")" "$STATE_DIR"

  if [[ ! -f "${ENV_FILE}" ]]; then
    log "Creating env file: ${ENV_FILE}"
    $SUDO install -m 0600 "${APP_DIR}/infra/linux/knights-admin.env.example" "$ENV_FILE"
  fi

  set_env_value "$ENV_FILE" ADMIN_HOST "$ADMIN_HOST"
  set_env_value "$ENV_FILE" ADMIN_PORT "$ADMIN_PORT"
  set_env_value "$ENV_FILE" KNIGHTS_ADMIN_STATIC_DIR "${APP_DIR}/admin"
  set_env_value "$ENV_FILE" KNIGHTS_ADMIN_STATE_DB "${STATE_DIR}/admin-state.sqlite"
  $SUDO chmod 600 "$ENV_FILE"

  prompt_env_if_empty BSC_RPC_URL "Private BSC RPC URL"
  prompt_env_if_empty PUBLIC_BSC_RPC_URL "Public BSC RPC URL for wallet metadata"
  prompt_env_if_empty KEEPER_PRIVATE_KEY "Keeper private key"
  prompt_env_if_empty KNT_CONTRACT_ADDRESS "KNT contract address"
  prompt_env_if_empty USDT_TOKEN_ADDRESS "USDT token address"
  prompt_env_if_empty LABUBU_TOKEN_ADDRESS "LABUBU token address"
  prompt_env_if_empty KNT_LABUBU_PAIR "KNT/LABUBU pair address"
  prompt_env_if_empty KEEPER_START_BLOCK "Keeper start block"
  prompt_env_if_empty ACCOUNTING_START_BLOCK "Accounting start block"

  if [[ -n "${STATE_JSON}" ]]; then
    [[ -f "${STATE_JSON}" ]] || die "STATE_JSON not found: ${STATE_JSON}"
    log "Importing admin state JSON: ${STATE_JSON}"
    (cd "$APP_DIR" && KNIGHTS_ADMIN_ENV_FILE="$ENV_FILE" npm run admin:import-state -- "$STATE_JSON")
    $SUDO chown -R "${SERVICE_USER}:$($SUDO id -gn "$SERVICE_USER")" "$STATE_DIR"
  fi

  write_systemd_units "$node_bin"
  write_caddyfile

  log "Starting services"
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now knights-admin.service
  $SUDO systemctl restart knights-admin.service
  $SUDO systemctl enable --now knights-keeper.timer
  $SUDO systemctl restart knights-keeper.timer

  if command -v curl >/dev/null 2>&1; then
    log "Smoke testing local API"
    curl --fail --silent --show-error "http://${ADMIN_HOST}:${ADMIN_PORT}/api/config" >/dev/null
  else
    log "curl not found; skipping local API smoke test"
  fi

  log "Done"
  log "Admin service: systemctl status knights-admin.service"
  log "Keeper timer:  systemctl list-timers knights-keeper.timer"
  [[ "${SKIP_CADDY}" == "1" ]] || log "URL: https://${DOMAIN}"
}

main "$@"
