#!/usr/bin/env bash

# ===================================================
# 快速修复脚本 - SEER DApp MIME 类型和 CORS 问题
# 修复内容：
#   1. 修复 SPA 路由配置（避免 JS 文件被重写）
#   2. 添加 CORS 支持
#   3. 修复 MIME 类型识别
# ===================================================

set -euo pipefail

echo "╔════════════════════════════════════════════╗"
echo "║   🔧 SEER DApp 修复脚本                    ║"
echo "║   修复问题：MIME 类型、CORS、SPA 路由      ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 配置
CADDYFILE_SOURCE="./Caddyfile"
CADDYFILE_DEST="/etc/caddy/Caddyfile"
CADDY_CONFIG_DIR="/etc/caddy/conf.d"

# 检查源文件
if [ ! -f "$CADDYFILE_SOURCE" ]; then
	echo "❌ 错误：找不到 $CADDYFILE_SOURCE"
	exit 1
fi

echo "📋 [步骤 1/3] 备份当前配置..."
if [ -f "$CADDYFILE_DEST" ]; then
	sudo cp "$CADDYFILE_DEST" "${CADDYFILE_DEST}.backup"
	echo "✅ 备份完成: ${CADDYFILE_DEST}.backup"
else
	echo "⚠️  当前不存在 Caddy 配置（可能是第一次部署）"
fi
echo ""

echo "📋 [步骤 2/3] 更新 Caddy 配置..."
# 方式 A：如果使用全局 Caddyfile
sudo cp "$CADDYFILE_SOURCE" "$CADDYFILE_DEST"
echo "✅ 配置文件已更新到 $CADDYFILE_DEST"
echo ""

# 方式 B：也复制到 conf.d 目录（如使用模块化配置）
if [ -d "$CADDY_CONFIG_DIR" ]; then
	sudo cp "$CADDYFILE_SOURCE" "$CADDY_CONFIG_DIR/t2.test2dapp.xyz.conf"
	echo "✅ 配置文件已复制到 $CADDY_CONFIG_DIR/"
fi
echo ""

echo "📋 [步骤 3/3] 验证并重载 Caddy..."
echo ""

# 验证配置
echo "验证 Caddy 配置..."
if sudo caddy validate --config "$CADDYFILE_DEST" &>/dev/null; then
	echo "✅ Caddy 配置验证通过"
else
	echo "❌ Caddy 配置验证失败"
	echo "请修复配置后重试"
	exit 1
fi
echo ""

# 检查 Caddy 是否运行
if systemctl is-active --quiet caddy; then
	echo "重启 Caddy 服务..."
	sudo systemctl restart caddy
	sleep 2
	echo "✅ Caddy 已重启"
else
	echo "启动 Caddy 服务..."
	sudo systemctl start caddy
	sleep 2
	echo "✅ Caddy 已启动"
fi
echo ""

# 验证服务状态
if systemctl is-active --quiet caddy; then
	echo "✅ Caddy 服务运行中"
else
	echo "❌ Caddy 服务启动失败"
	echo "查看日志: sudo journalctl -u caddy -n 50"
	exit 1
fi
echo ""

echo "╔════════════════════════════════════════════╗"
echo "║         ✨ 修复完成！                       ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "📊 修复内容："
echo "  ✓ SPA 路由配置已修复"
echo "  ✓ CORS 跨域支持已添加"
echo "  ✓ MIME 类型识别已修复"
echo "  ✓ OPTIONS 预请求处理已添加"
echo ""
echo "🧪 测试命令："
echo "  # 检查 HTTP 头
echo "  curl -I https://t2.test2dapp.xyz/assets/main.js"
echo ""
echo "  # 检查 CORS 头"
echo "  curl -I -H 'Origin: https://example.com' https://t2.test2dapp.xyz/"
echo ""
echo "  # 刷新浏览器缓存后访问"
echo "  https://t2.test2dapp.xyz/"
echo ""
echo "📋 查看日志："
echo "  sudo journalctl -u caddy -f"
echo ""
