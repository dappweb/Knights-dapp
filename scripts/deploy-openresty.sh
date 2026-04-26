#!/bin/bash
# =================================================================
# SEER Protocol — 1Panel OpenResty 部署脚本
# 域名: t2.test2dapp.xyz
# =================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOMAIN="${1:-t2.test2dapp.xyz}"
# 实际生效的部署目录（OpenResty 容器内的 seer-t1.conf 使用此路径）
DIST_DIR="/home/ubuntu/DeFiNodeNexus/181bSeer-dist"
OPENRESTY_VHOST="/www/server/panel/vhost/openresty"
NGINX_CONF="$OPENRESTY_VHOST/$DOMAIN.conf"

echo "=============================="
echo "  SEER Protocol 部署脚本"
echo "  域名: $DOMAIN"
echo "=============================="

# 1. 构建前端
echo ""
echo "[1/4] 构建前端..."
cd "$PROJECT_ROOT"
SKIP_ENV_BINDINGS_CHECK=1 npm run build

# 2. 同步静态文件到 Web 目录
echo ""
echo "[2/4] 同步文件到 $DIST_DIR ..."
mkdir -p "$DIST_DIR"
rsync -a --delete "$PROJECT_ROOT/dist/" "$DIST_DIR/"
echo "文件已同步到 $DIST_DIR。"

# 3. 写入 OpenResty 站点配置
echo ""
echo "[3/4] 写入 OpenResty 配置 $NGINX_CONF ..."
mkdir -p "$OPENRESTY_VHOST"
cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $DIST_DIR;
    index index.html;

    access_log /www/wwwlogs/$DOMAIN.access.log;
    error_log  /www/wwwlogs/$DOMAIN.error.log;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location ~* ^/(index\.html|manifest\.json|_headers)$ {
        expires -1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    add_header X-Content-Type-Options  "nosniff"       always;
    add_header X-Frame-Options         "SAMEORIGIN"    always;
    add_header X-XSS-Protection        "1; mode=block" always;
    add_header Referrer-Policy         "strict-origin-when-cross-origin" always;
    add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/wasm
        image/svg+xml;
}
EOF
echo "配置已写入。"

# 4. 重载 OpenResty
echo ""
echo "[4/4] 重载 OpenResty ..."
if command -v openresty &>/dev/null; then
    if openresty -t; then
        openresty -s reload || true
    fi
elif command -v nginx &>/dev/null; then
    if nginx -t; then
        nginx -s reload || true
    fi
else
    echo "警告: 未找到 openresty/nginx 命令，请在 1Panel 控制台手动重载 OpenResty。"
fi

if pgrep -x nginx >/dev/null 2>&1; then
    MASTER_PID="$(ps -eo pid,ppid,comm,args | awk '$3=="nginx" && $2==1 {print $1; exit}')"
    if [[ -n "$MASTER_PID" ]]; then
        kill -HUP "$MASTER_PID" || true
    fi
fi

echo ""
echo "=============================="
echo "  部署完成！"
echo "  访问: http://$DOMAIN"
echo "  如已签发证书可访问: https://$DOMAIN"
echo "=============================="
