#!/usr/bin/env bash

# ===================================================
# SEER DApp 部署脚本 - Caddy
# 适用于：https://t2.test2dapp.xyz/
# ===================================================

set -euo pipefail

# 配置变量
DEPLOY_DOMAIN="t2.test2dapp.xyz"
DEPLOY_ROOT="/var/www/seer"
DEPLOY_PATH="${DEPLOY_ROOT}/dist"
DIST_PATH="./dist"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "🚀 SEER DApp 部署流程 - Caddy"
echo "=========================================="
echo "目标域名: $DEPLOY_DOMAIN"
echo "部署路径: $DEPLOY_PATH"
echo ""

# 1️⃣ 检查环境
echo "📋 [步骤 1/5] 检查环境..."
if [ ! -d "node_modules" ]; then
	echo "❌ 未找到 node_modules，请先运行 npm install"
	exit 1
fi

if [ ! -f ".env.production" ]; then
	echo "❌ 未找到 .env.production 文件"
	exit 1
fi

echo "✅ 环境检查通过"
echo ""

# 2️⃣ 构建项目
echo "🔨 [步骤 2/5] 构建项目..."
npm run build
if [ ! -d "$DIST_PATH" ]; then
	echo "❌ 构建失败：未生成 dist 文件夹"
	exit 1
fi
echo "✅ 构建成功"
echo ""

# 3️⃣ 准备部署目录
echo "📁 [步骤 3/5] 准备部署目录..."
if [ ! -d "$DEPLOY_PATH" ]; then
	echo "➡️  创建部署目录: $DEPLOY_PATH"
	sudo mkdir -p "$DEPLOY_PATH"
fi

echo "✅ 部署目录准备完成"
echo ""

# 4️⃣ 上传 dist 文件
echo "📤 [步骤 4/5] 上传构建文件..."
echo "➡️  同步构建文件..."
sudo rsync -a --delete "$DIST_PATH/" "$DEPLOY_PATH/"

# 设置文件权限
sudo chown -R www-data:www-data "$DEPLOY_ROOT" 2>/dev/null || true
sudo chmod -R 755 "$DEPLOY_ROOT" 2>/dev/null || true

echo "✅ 文件上传完成"
echo ""

# 5️⃣ 确保 Caddy 配置正确并热重载
echo "🔍 [步骤 5/5] 更新 Caddy 配置并重载..."

# 检查 dist 文件
if [ ! -f "$DEPLOY_PATH/index.html" ]; then
	echo "❌ 部署验证失败：找不到 index.html"
	exit 1
fi

# 确保 conf.d 目录存在
sudo mkdir -p /etc/caddy/conf.d

# 写入 t2 独立配置文件（不影响其他站点）
sudo python3 -c "
content = '''${DEPLOY_DOMAIN} {
    root * ${DEPLOY_PATH}
    encode gzip zstd

    @spa_fallback {
        not path /public/* /assets/* *.* /manifest.json /_headers
        file {
            try_files {path} /index.html
        }
    }
    rewrite @spa_fallback /index.html

    @static_assets {
        path /assets/*
    }
    header @static_assets {
        Cache-Control \"public, max-age=31536000, immutable\"
    }

    @html_and_manifest {
        path /index.html /manifest.json /_headers
    }
    header @html_and_manifest {
        Cache-Control \"no-store, no-cache, must-revalidate, proxy-revalidate\"
        Pragma \"no-cache\"
        Expires \"0\"
    }

    header {
        Access-Control-Allow-Origin \"*\"
        Access-Control-Allow-Methods \"GET, POST, OPTIONS, DELETE, PUT\"
        Access-Control-Allow-Headers \"Content-Type, Authorization\"
        Access-Control-Max-Age \"86400\"
        X-Content-Type-Options \"nosniff\"
        X-Frame-Options \"SAMEORIGIN\"
        X-XSS-Protection \"1; mode=block\"
        Referrer-Policy \"strict-origin-when-cross-origin\"
        Cross-Origin-Opener-Policy \"same-origin-allow-popups\"
        Vary \"Accept-Encoding, Accept\"
    }

    @options {
        method OPTIONS
    }
    handle @options {
        header Access-Control-Allow-Origin \"*\"
        header Access-Control-Allow-Methods \"GET, POST, OPTIONS, DELETE, PUT\"
        header Access-Control-Allow-Headers \"Content-Type, Authorization\"
        header Access-Control-Max-Age \"86400\"
        respond 204
    }

    file_server
}
'''
open('/etc/caddy/conf.d/t2.conf', 'w').write(content)
"

# 确保主 Caddyfile 里存在 import conf.d 指令
# 注意：绝不能整体覆盖主 Caddyfile，否则会把其它域名站点块（如 t1/t3）抹掉，
# 仅在缺失 import 行时以追加方式补齐。
MAIN_CF="/etc/caddy/Caddyfile"
if ! sudo grep -q "import /etc/caddy/conf.d" "$MAIN_CF" 2>/dev/null; then
	echo "⚠️  主 Caddyfile 未包含 import 指令，追加（不覆盖原有内容）..."
	sudo cp "$MAIN_CF" "${MAIN_CF}.bak.$(date +%Y%m%d-%H%M%S).auto" 2>/dev/null || true
	# 以追加方式写入 import 行，保留原有全部站点配置
	echo "import /etc/caddy/conf.d/*.conf" | sudo tee -a "$MAIN_CF" >/dev/null
fi

# 热重载 Caddy（不中断连接）
if sudo caddy validate --config "$MAIN_CF" &>/dev/null; then
	sudo systemctl reload caddy
	echo "✅ Caddy 热重载成功"
else
	echo "❌ Caddy 配置验证失败，跳过重载"
	sudo caddy validate --config "$MAIN_CF"
	exit 1
fi

echo "✅ 部署验证通过"
echo ""

# 完成
echo "=========================================="
echo "✨ 部署完成！"
echo "=========================================="
echo ""
echo "📍 访问地址: https://${DEPLOY_DOMAIN}/"
echo "📁 部署路径: ${DEPLOY_PATH}"
echo "📋 Caddy 配置: /etc/caddy/conf.d/t2.conf"
echo ""
