#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-production}"
PROJECT_NAME="seer-production"

if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "staging" ]]; then
  echo "Usage: ./scripts/setup-secrets.sh [production|staging]"
  exit 1
fi

if [[ "$ENVIRONMENT" == "staging" ]]; then
  PROJECT_NAME="seer-preview"
fi

if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler is not installed. Run: npm i -g wrangler"
  exit 1
fi

echo "==> Setting Pages secrets for ${ENVIRONMENT}"

echo "[1/5] RPC_URL"
wrangler pages secret put RPC_URL --project-name="$PROJECT_NAME"

echo "[2/5] PRIVATE_KEY"
wrangler pages secret put PRIVATE_KEY --project-name="$PROJECT_NAME"

echo "[3/5] TELEGRAM_BOT_TOKEN"
wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name="$PROJECT_NAME"

echo "[4/5] TELEGRAM_CHAT_ID"
wrangler pages secret put TELEGRAM_CHAT_ID --project-name="$PROJECT_NAME"

echo "[5/5] BURN_API_TOKEN"
wrangler pages secret put BURN_API_TOKEN --project-name="$PROJECT_NAME"

echo "==> Secrets setup completed for ${ENVIRONMENT}"
