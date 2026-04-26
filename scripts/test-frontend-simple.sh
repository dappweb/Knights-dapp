#!/bin/bash
# test-frontend-simple.sh
# 前端配置验证脚本（简化版）

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  SEER 前端配置完整性验证              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# 测试 1: 文件存在
echo -e "${YELLOW}📋 测试 1: 文件完整性${NC}"
[ -d "dist" ] && echo -e "${GREEN}✅${NC} dist 存在" && ((PASSED++)) || { echo -e "${RED}❌${NC} dist 缺失"; ((FAILED++)); }
[ -f "dist/index.html" ] && echo -e "${GREEN}✅${NC} index.html 已部署" && ((PASSED++)) || { echo -e "${RED}❌${NC} index.html 缺失"; ((FAILED++)); }
[ -d "dist/assets" ] && echo -e "${GREEN}✅${NC} assets 已部署" && ((PASSED++)) || { echo -e "${RED}❌${NC} assets 缺失"; ((FAILED++)); }

# 测试 2: 服务器部署
echo ""
echo -e "${YELLOW}📋 测试 2: 服务器部署${NC}"
[ -f "/www/wwwroot/t2.test2dapp.xyz/dist/index.html" ] && echo -e "${GREEN}✅${NC} 服务器文件已部署" && ((PASSED++)) || { echo -e "${RED}❌${NC} 服务器文件缺失"; ((FAILED++)); }

# 测试 3: Caddy
echo ""
echo -e "${YELLOW}📋 测试 3: Caddy 配置${NC}"
[ -f "/etc/caddy/Caddyfile" ] && echo -e "${GREEN}✅${NC} Caddyfile 已配置" && ((PASSED++)) || { echo -e "${RED}❌${NC} Caddyfile 缺失"; ((FAILED++)); }
sudo caddy validate --config /etc/caddy/Caddyfile &>/dev/null && echo -e "${GREEN}✅${NC} Caddy 配置有效" && ((PASSED++)) || { echo -e "${RED}❌${NC} Caddy 配置无效"; ((FAILED++)); }
systemctl is-active --quiet caddy && echo -e "${GREEN}✅${NC} Caddy 服务运行" && ((PASSED++)) || { echo -e "${RED}❌${NC} Caddy 服务未运行"; ((FAILED++)); }

# 测试 4: MIME 类型
echo ""
echo -e "${YELLOW}📋 测试 4: MIME 类型${NC}"
HTML_MIME=$(curl -s -I "https://t2.test2dapp.xyz/" 2>/dev/null | grep -i content-type | head -1)
[[ "$HTML_MIME" == *"text/html"* ]] && echo -e "${GREEN}✅${NC} HTML MIME 正确" && ((PASSED++)) || { echo -e "${RED}❌${NC} HTML MIME 错误"; ((FAILED++)); }

JS_FILE=$(find dist/assets/js -maxdepth 1 -name "*.js" -type f | head -1 | sed 's#^dist/##')
if [ -n "$JS_FILE" ]; then
  JS_MIME=$(curl -s -I "https://t2.test2dapp.xyz/$JS_FILE" 2>/dev/null | grep -i content-type | head -1)
  [[ "$JS_MIME" == *"javascript"* ]] && echo -e "${GREEN}✅${NC} JS MIME 正确" && ((PASSED++)) || { echo -e "${RED}❌${NC} JS MIME 错误"; ((FAILED++)); }
fi

# 测试 5: HTTP 状态码
echo ""
echo -e "${YELLOW}📋 测试 5: HTTP 状态码${NC}"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://t2.test2dapp.xyz/")
[ "$STATUS" -eq 200 ] && echo -e "${GREEN}✅${NC} 首页返回 HTTP 200" && ((PASSED++)) || { echo -e "${RED}❌${NC} 首页返回 HTTP $STATUS"; ((FAILED++)); }

if [ -n "$JS_FILE" ]; then
  JS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://t2.test2dapp.xyz/$JS_FILE")
  [ "$JS_STATUS" -eq 200 ] && echo -e "${GREEN}✅${NC} JS 资源返回 HTTP 200" && ((PASSED++)) || { echo -e "${RED}❌${NC} JS 返回 HTTP $JS_STATUS"; ((FAILED++)); }
fi

# 测试 6: CORS 头
echo ""
echo -e "${YELLOW}📋 测试 6: CORS 配置${NC}"
CORS=$(curl -s -I "https://t2.test2dapp.xyz/" 2>/dev/null | grep -i "access-control-allow-origin")
[ -n "$CORS" ] && echo -e "${GREEN}✅${NC} CORS 头已配置" && ((PASSED++)) || { echo -e "${RED}❌${NC} CORS 头未配置"; ((FAILED++)); }

# 总结
echo ""
TOTAL=$((PASSED + FAILED))
echo -e "┌─────────────────────────────────────────┐"
echo -e "│  ${GREEN}✅ 通过: $PASSED${NC}/${TOTAL}                          │"
echo -e "│  ${RED}❌ 失败: $FAILED${NC}/${TOTAL}                          │"
echo -e "└─────────────────────────────────────────┘"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 所有测试通过！前端已就绪${NC}"
  echo ""
  echo "访问: https://t2.test2dapp.xyz/"
  echo "记得进行硬刷新: Ctrl+Shift+R (Windows/Linux) 或 Cmd+Shift+R (Mac)"
  exit 0
else
  echo -e "${RED}⚠️  存在失败的测试，请检查配置${NC}"
  exit 1
fi
