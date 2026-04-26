#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-production}"

if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "staging" ]]; then
  echo "Usage: ./scripts/deploy-prod.sh [production|staging]"
  exit 1
fi

echo "==> Validating ${ENVIRONMENT} config"
DEPLOY_ENV="$ENVIRONMENT" node scripts/validate-production-config.mjs

echo "==> Building web app"
npm run build

if command -v wrangler >/dev/null 2>&1; then
  WRANGLER_CMD=(wrangler)
else
  WRANGLER_CMD=(npx wrangler)
fi

if [[ "$ENVIRONMENT" == "production" ]]; then
  echo "==> Deploying Pages (production)"
  "${WRANGLER_CMD[@]}" pages deploy dist --project-name=seer-production
else
  echo "==> Deploying Pages (staging)"
  "${WRANGLER_CMD[@]}" pages deploy dist --project-name=seer-preview
fi

echo "==> Deployment completed for ${ENVIRONMENT}"
