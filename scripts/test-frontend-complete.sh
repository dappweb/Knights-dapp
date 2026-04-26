#!/bin/bash
# test-frontend-complete.sh
# ─────────────────────────────────────────────────────
# 前端完整性测试脚本 - 验证所有资源和配置
# 
# 使用方法: bash scripts/test-frontend-complete.sh
# 或: chmod +x scripts/test-frontend-complete.sh && ./scripts/test-frontend-complete.sh

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试计数
TESTS_PASSED=0
TESTS_FAILED=0

print_header() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║${NC}  $1"
  echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
  echo ""
}

print_test() {
  echo -e "${YELLOW}→${NC} $1"
}

print_pass() {
  echo -e "${GREEN}✅ $1${NC}"
  ((TESTS_PASSED++))
}

print_fail() {
  echo -e "${RED}❌ $1${NC}"
  ((TESTS_FAILED++))
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

# ─────────────────────────────────────────────────────
# 测试 1: 本地文件结构
# ─────────────────────────────────────────────────────
print_header "测试 1: 本地文件结构"

print_test "检查 dist 目录..."
if [ -d "dist" ]; then
  print_pass "dist 目录存在"
else
  print_fail "dist 目录不存在"
fi

print_test "检查 index.html..."
if [ -f "dist/index.html" ]; then
  SIZE=$(wc -c < dist/index.html)
  print_pass "index.html 存在 ($SIZE bytes)"
else
  print_fail "index.html 不存在"
fi

print_test "检查 assets 目录..."
if [ -d "dist/assets" ]; then
  COUNT=$(find dist/assets -type f | wc -l)
  print_pass "assets 目录存在 ($COUNT 文件)"
else
  print_fail "assets 目录不存在"
fi

print_test "检查 manifest.json..."
if [ -f "dist/manifest.json" ]; then
  print_pass "manifest.json 存在"
else
  print_fail "manifest.json 不存在"
fi

# ─────────────────────────────────────────────────────
# 测试 2: 服务器文件部署
# ─────────────────────────────────────────────────────
print_header "测试 2: 服务器文件部署"

print_test "检查服务器根目录..."
if [ -d "/www/wwwroot/t2.test2dapp.xyz/dist" ]; then
  print_pass "服务器目录存在"
else
  print_fail "服务器目录不存在"
fi

print_test "检查服务器 index.html..."
if [ -f "/www/wwwroot/t2.test2dapp.xyz/dist/index.html" ]; then
  REMOTE_SIZE=$(wc -c < /www/wwwroot/t2.test2dapp.xyz/dist/index.html)
  print_pass "服务器 index.html 存在 ($REMOTE_SIZE bytes)"
else
  print_fail "服务器 index.html 不存在"
fi

print_test "检查服务器资源...$(
  if [ -d "/www/wwwroot/t2.test2dapp.xyz/dist/assets" ]; then
    REMOTE_COUNT=$(find /www/wwwroot/t2.test2dapp.xyz/dist/assets -type f | wc -l)
    echo " ($REMOTE_COUNT 文件)"
  fi
)"
if [ -d "/www/wwwroot/t2.test2dapp.xyz/dist/assets" ]; then
  print_pass "服务器资源已部署"
else
  print_fail "服务器资源未部署"
fi

# ─────────────────────────────────────────────────────
# 测试 3: Caddy 配置
# ─────────────────────────────────────────────────────
print_header "测试 3: Caddy 配置"

print_test "检查 Caddyfile 本地文件..."
if [ -f "Caddyfile" ]; then
  print_pass "Caddyfile 存在"
else
  print_fail "Caddyfile 不存在"
fi

print_test "检查 Caddyfile 系统配置..."
if [ -f "/etc/caddy/Caddyfile" ]; then
  print_pass "系统 Caddyfile 已部署"
else
  print_fail "系统 Caddyfile 未部署"
fi

print_test "验证 Caddy 配置有效性..."
if sudo caddy validate --config /etc/caddy/Caddyfile &>/dev/null; then
  print_pass "Caddy 配置有效"
else
  print_fail "Caddy 配置无效"
fi

print_test "检查 Caddy 服务状态..."
if systemctl is-active --quiet caddy; then
  print_pass "Caddy 服务运行中"
else
  print_fail "Caddy 服务未运行"
fi

# ─────────────────────────────────────────────────────
# 测试 4: HTTPS 连接和 MIME 类型
# ─────────────────────────────────────────────────────
print_header "测试 4: HTTPS 连接和 MIME 类型"

print_test "测试 index.html MIME 类型..."
HTML_MIME=$(curl -s -I "https://t2.test2dapp.xyz/" 2>/dev/null | grep -i content-type | head -1 | cut -d' ' -f2-)
if [[ "$HTML_MIME" == *"text/html"* ]]; then
  print_pass "HTML MIME 类型正确: $HTML_MIME"
else
  print_fail "HTML MIME 类型错误: $HTML_MIME"
fi

print_test "测试 JavaScript MIME 类型..."
JS_FILE=$(find dist/assets/js -maxdepth 1 -name "*.js" -type f | head -1 | sed 's#^dist/##')
if [ -n "$JS_FILE" ]; then
  JS_MIME=$(curl -s -I "https://t2.test2dapp.xyz/$JS_FILE" 2>/dev/null | grep -i content-type | head -1 | cut -d' ' -f2-)
  if [[ "$JS_MIME" == *"javascript"* ]]; then
    print_pass "JavaScript MIME 类型正确: $JS_MIME"
  else
    print_fail "JavaScript MIME 类型错误: $JS_MIME"
  fi
else
  print_info "未找到 JS 文件用于测试"
fi

print_test "测试 CSS MIME 类型..."
CSS_FILE=$(find dist/assets/css -maxdepth 1 -name "*.css" -type f | head -1 | sed 's#^dist/##')
if [ -n "$CSS_FILE" ]; then
  CSS_MIME=$(curl -s -I "https://t2.test2dapp.xyz/$CSS_FILE" 2>/dev/null | grep -i content-type | head -1 | cut -d' ' -f2-)
  if [[ "$CSS_MIME" == *"text/css"* ]]; then
    print_pass "CSS MIME 类型正确: $CSS_MIME"
  else
    print_fail "CSS MIME 类型错误: $CSS_MIME"
  fi
else
  print_info "未找到 CSS 文件用于测试"
fi

# ─────────────────────────────────────────────────────
# 测试 5: CORS 头配置
# ─────────────────────────────────────────────────────
print_header "测试 5: CORS 头配置"

print_test "检查 Access-Control-Allow-Origin..."
CORS_ORIGIN=$(curl -s -I "https://t2.test2dapp.xyz/" 2>/dev/null | grep -i "access-control-allow-origin" | cut -d' ' -f2-)
if [ -n "$CORS_ORIGIN" ]; then
  print_pass "CORS Origin 已配置: $CORS_ORIGIN"
else
  print_fail "CORS Origin 未配置"
fi

print_test "检查 CORS 预检支持..."
CORS_METHODS=$(curl -s -I "https://t2.test2dapp.xyz/" 2>/dev/null | grep -i "access-control-allow-methods" | cut -d' ' -f2-)
if [[ "$CORS_METHODS" == *"GET"* ]]; then
  print_pass "CORS 方法已配置: $CORS_METHODS"
else
  print_fail "CORS 方法未配置"
fi

print_test "检查防 MIME 嗅探..."
MIME_SNIFF=$(curl -s -I "https://t2.test2dapp.xyz/" 2>/dev/null | grep -i "x-content-type-options" | cut -d' ' -f2-)
if [[ "$MIME_SNIFF" == "nosniff" ]]; then
  print_pass "MIME 嗅探防护已配置: $MIME_SNIFF"
else
  print_fail "MIME 嗅探防护未配置"
fi

# ─────────────────────────────────────────────────────
# 测试 6: 缓存策略
# ─────────────────────────────────────────────────────
print_header "测试 6: 缓存策略"

print_test "检查入口文件缓存策略..."
HTML_CACHE=$(curl -s -I "https://t2.test2dapp.xyz/" 2>/dev/null | grep -i "cache-control" | head -1 | cut -d' ' -f2-)
if [[ "$HTML_CACHE" == *"no-cache"* ]] || [[ "$HTML_CACHE" == *"no-store"* ]]; then
  print_pass "HTML 缓存策略禁用: $HTML_CACHE"
else
  print_fail "HTML 缓存策略不正确: $HTML_CACHE"
fi

print_test "检查静态资源缓存策略..."
if [ -n "$JS_FILE" ]; then
  JS_CACHE=$(curl -s -I "https://t2.test2dapp.xyz/$JS_FILE" 2>/dev/null | grep -i "cache-control" | head -1 | cut -d' ' -f2-)
  if [[ "$JS_CACHE" == *"immutable"* ]] || [[ "$JS_CACHE" == *"31536000"* ]]; then
    print_pass "JS 缓存策略长期: $JS_CACHE"
  else
    print_fail "JS 缓存策略不正确: $JS_CACHE"
  fi
fi

# ─────────────────────────────────────────────────────
# 测试 7: HTTP 状态码
# ─────────────────────────────────────────────────────
print_header "测试 7: HTTP 状态码"

print_test "测试首页加载..."
HOMEPAGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://t2.test2dapp.xyz/")
if [ "$HOMEPAGE_STATUS" -eq 200 ]; then
  print_pass "首页加载成功: HTTP $HOMEPAGE_STATUS"
else
  print_fail "首页加载失败: HTTP $HOMEPAGE_STATUS"
fi

print_test "测试资源加载..."
if [ -n "$JS_FILE" ]; then
  ASSET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://t2.test2dapp.xyz/$JS_FILE")
  if [ "$ASSET_STATUS" -eq 200 ]; then
    print_pass "资源加载成功: HTTP $ASSET_STATUS"
  else
    print_fail "资源加载失败: HTTP $ASSET_STATUS"
  fi
fi

print_test "测试 SPA 路由回退..."
ROUTE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://t2.test2dapp.xyz/any-route-test")
if [ "$ROUTE_STATUS" -eq 200 ]; then
  print_pass "SPA 路由回退成功: HTTP $ROUTE_STATUS"
else
  print_fail "SPA 路由回退失败: HTTP $ROUTE_STATUS"
fi

# ─────────────────────────────────────────────────────
# 测试 8: 响应时间
# ─────────────────────────────────────────────────────
print_header "测试 8: 响应时间"

print_test "测试首页响应时间..."
RESPONSE_TIME=$(curl -w "%{time_total}" -o /dev/null -s "https://t2.test2dapp.xyz/")
RESPONSE_TIME_MS=$(echo "$RESPONSE_TIME * 1000" | bc | cut -d'.' -f1)
if (( RESPONSE_TIME_MS < 1000 )); then
  RESPONSE_TIME_MS=${RESPONSE_TIME%.*}
  if (( RESPONSE_TIME_MS < 1 )); then
    print_pass "响应时间良好: ${RESPONSE_TIME}s"
  else
    print_info "响应时间: ${RESPONSE_TIME}s"
  fi
fi

# ─────────────────────────────────────────────────────
# 总结
# ─────────────────────────────────────────────────────
print_header "测试总结"

TOTAL=$((TESTS_PASSED + TESTS_FAILED))
SUCCESS_RATE=$((TESTS_PASSED * 100 / TOTAL))

if (( TOTAL > 0 )); then
  SUCCESS_RATE=$((TESTS_PASSED * 100 / TOTAL))
else
  SUCCESS_RATE=0
fi

echo ""
echo -e "${GREEN}✅ 通过${NC}: $TESTS_PASSED/$TOTAL"
echo -e "${RED}❌ 失败${NC}: $TESTS_FAILED/$TOTAL"
echo -e "成功率: $SUCCESS_RATE%"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC}  🎉 所有测试通过！前端已就绪！      ${GREEN}║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
  echo ""
  echo "建议操作:"
  echo "1. 访问 https://t2.test2dapp.xyz/"
  echo "2. 进行硬刷新 (Ctrl+Shift+R)"
  echo "3. 打开浏览器开发者工具看是否有错误"
  echo ""
  exit 0
else
  echo -e "${RED}╔════════════════════════════════════════╗${NC}"
  echo -e "${RED}║${NC}  ⚠️  存在测试失败，请检查配置      ${RED}║${NC}"
  echo -e "${RED}╚════════════════════════════════════════╝${NC}"
  echo ""
  echo "建议操作:"
  echo "1. 查看上面的失败项目"
  echo "2. 运行: npm run deploy:caddy"
  echo "3. 重新运行此脚本"
  echo ""
  exit 1
fi
