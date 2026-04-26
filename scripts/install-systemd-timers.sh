#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SYSTEMD_DIR="/etc/systemd/system"
ENV_DIR="/etc/seer"
ENV_EXAMPLE_SRC="$REPO_DIR/deploy/systemd/seer-daily-burn.env.example"
ENV_DST="$ENV_DIR/daily-burn.env"
SERVICE_SRC="$REPO_DIR/deploy/systemd/seer-daily-burn.service"
TIMER_SRC="$REPO_DIR/deploy/systemd/seer-daily-burn.timer"
SERVICE_DST="$SYSTEMD_DIR/seer-daily-burn.service"
TIMER_DST="$SYSTEMD_DIR/seer-daily-burn.timer"

if [[ ! -f "$SERVICE_SRC" || ! -f "$TIMER_SRC" || ! -f "$ENV_EXAMPLE_SRC" ]]; then
  echo "Missing systemd unit templates under deploy/systemd"
  exit 1
fi

tmp_service="$(mktemp)"
tmp_timer="$(mktemp)"
trap 'rm -f "$tmp_service" "$tmp_timer"' EXIT

sed "s|__SEER_REPO_DIR__|$REPO_DIR|g" "$SERVICE_SRC" > "$tmp_service"
cp "$TIMER_SRC" "$tmp_timer"

sudo mkdir -p "$ENV_DIR"
if [[ ! -f "$ENV_DST" ]]; then
  sudo cp "$ENV_EXAMPLE_SRC" "$ENV_DST"
fi

sudo cp "$tmp_service" "$SERVICE_DST"
sudo cp "$tmp_timer" "$TIMER_DST"

sudo systemctl daemon-reload
sudo systemctl enable --now seer-daily-burn.timer

echo "Installed timer units:"
systemctl status seer-daily-burn.timer --no-pager || true
echo
echo "Env file: $ENV_DST"
echo "Set DAILY_BURN_AMOUNT_SEER there before the first real burn."
echo
echo "Next runs:"
systemctl list-timers seer-daily-burn.timer --no-pager || true
