#!/usr/bin/env bash

# ===================================================
# 快速启动 - SEER DApp 部署 (t2.test2dapp.xyz)
# 使用: ./scripts/deploy-quick.sh
# ===================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_ROOT="/var/www/seer"
DEPLOY_PATH="${DEPLOY_ROOT}/dist"
cd "$PROJECT_ROOT"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  🚀 SEER DApp 快速部署                     ║"
echo "║  目标: https://t2.test2dapp.xyz/          ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 检查必要工具
check_command() {
	if ! command -v "$1" &> /dev/null; then
		echo "❌ 错误: 未找到 $1"
		echo "   请安装: sudo apt install $1"
		exit 1
	fi
}

check_command npm
check_command sudo

# 显示当前状态
echo "📋 当前环境信息："
echo "   Node: $(node --version)"
echo "   npm: $(npm --version)"
echo "   系统: $(uname -s)"
echo "   用户: $(whoami)"
echo ""

# 步骤选择菜单
show_menu() {
	echo "请选择部署方式:"
	echo "  1) 完整部署（清理 + 构建 + 上传）"
	echo "  2) 快速部署（构建 + 上传）"
	echo "  3) 仅构建（不上传）"
	echo "  4) 仅上传（使用现有 dist）"
	echo "  5) 查看 Caddy 状态"
	echo "  6) 验证部署"
	echo "  0) 退出"
	echo ""
	read -p "请输入选项 (0-6): " choice
}

# 完整部署
full_deploy() {
	echo "🔧 开始完整部署流程..."
	echo ""
	
	echo "1️⃣  清理旧文件..."
	sudo rm -rf dist
	echo "   ✅ 完成"
	echo ""
	
	echo "2️⃣  构建项目..."
	npm run build
	echo "   ✅ 完成"
	echo ""
	
	echo "3️⃣  上传到服务器..."
	sudo mkdir -p "$DEPLOY_PATH"
	sudo rsync -a --delete dist/ "$DEPLOY_PATH/"
	sudo chown -R www-data:www-data "$DEPLOY_ROOT" 2>/dev/null || true
	echo "   ✅ 完成"
	echo ""
	
	success_message
}

# 快速部署
quick_deploy() {
	echo "🔧 开始快速部署流程..."
	echo ""
	
	echo "1️⃣  构建项目..."
	npm run build
	echo "   ✅ 完成"
	echo ""
	
	echo "2️⃣  上传到服务器..."
	sudo mkdir -p "$DEPLOY_PATH"
	sudo rsync -a --delete dist/ "$DEPLOY_PATH/"
	sudo chown -R www-data:www-data "$DEPLOY_ROOT" 2>/dev/null || true
	echo "   ✅ 完成"
	echo ""
	
	success_message
}

# 仅构建
build_only() {
	echo "🔨 开始构建..."
	npm run build
	echo "✅ 构建完成"
	echo "   dist 目录已准备好上传"
	echo ""
}

# 仅上传
upload_only() {
	if [ ! -d "dist" ]; then
		echo "❌ 错误: 未找到 dist 目录"
		echo "   请先运行: npm run build"
		exit 1
	fi
	
	echo "📤 上传 dist 文件..."
	sudo mkdir -p "$DEPLOY_PATH"
	sudo rsync -a --delete dist/ "$DEPLOY_PATH/"
	sudo chown -R www-data:www-data "$DEPLOY_ROOT" 2>/dev/null || true
	echo "✅ 上传完成"
	echo ""
	
	success_message
}

# 查看 Caddy 状态
check_caddy() {
	echo "📊 Caddy 服务状态："
	echo ""
	
	if systemctl is-active --quiet caddy; then
		echo "   ✅ Caddy 正在运行"
		echo ""
		echo "   服务状态:"
		systemctl status caddy | grep -E "(Active|Loaded)" | sed 's/^/   /'
		echo ""
		echo "   最近日志:"
		sudo journalctl -u caddy -n 5 --no-pager | sed 's/^/   /'
	else
		echo "   ❌ Caddy 未运行"
		echo "   启动命令: sudo systemctl start caddy"
	fi
	echo ""
}

# 验证部署
verify_deploy() {
	echo "🔍 验证部署..."
	echo ""
	
	# 检查文件
	if [ -f "$DEPLOY_PATH/index.html" ]; then
		echo "   ✅ index.html 存在"
	else
		echo "   ❌ index.html 不存在"
		return 1
	fi
	
	# 检查文件大小
	SIZE=$(du -sh "$DEPLOY_PATH" | cut -f1)
	echo "   ✅ 部署文件大小: $SIZE"
	
	# 检查资源文件
	ASSETS_COUNT=$(find "$DEPLOY_PATH/assets" -type f 2>/dev/null | wc -l)
	echo "   ✅ 资源文件数: $ASSETS_COUNT"
	
	# 尝试 HTTP 检查
	echo ""
	echo "   HTTP 连接测试:"
	if curl -k --resolve t2.test2dapp.xyz:443:127.0.0.1 -s -I https://t2.test2dapp.xyz/ 2>/dev/null | head -1; then
		echo "   ✅ HTTPS 连接成功"
	elif curl -s -I http://t2.test2dapp.xyz/ 2>/dev/null | head -1; then
		echo "   ✅ HTTP 连接成功"
	else
		echo "   ⚠️  无法连接（可能需要配置域名 DNS）"
	fi
	
	echo ""
	echo "✅ 验证完成"
	echo ""
}

# 成功提示
success_message() {
	cat << "EOF"
╔════════════════════════════════════════════╗
║         ✨ 部署成功！                       ║
╚════════════════════════════════════════════╝

下一步：
  1. 验证服务状态:
	  systemctl status caddy

  2. 访问应用:
     https://t2.test2dapp.xyz/

  3. 查看日志:
     sudo journalctl -u caddy -f

EOF
}

# 主菜单循环
while true; do
	show_menu
	
	case $choice in
		1) full_deploy ;;
		2) quick_deploy ;;
		3) build_only ;;
		4) upload_only ;;
		5) check_caddy ;;
		6) verify_deploy ;;
		0) echo "👋 退出"; exit 0 ;;
		*) echo "❌ 无效选项"; continue ;;
	esac
	
	read -p "按 Enter 键继续..." -t 3 || true
done
