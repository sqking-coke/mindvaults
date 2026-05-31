#!/usr/bin/env bash
# =============================================================================
# mindvaults Demo 一键部署脚本
# 用法：在服务器上运行 bash deploy-demo.sh
# =============================================================================
set -euo pipefail

echo "=== mindvaults Demo 部署 ==="

# 1. 检查依赖
command -v docker >/dev/null 2>&1 || { echo "请先安装 Docker: curl -fsSL https://get.docker.com | sudo sh"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "需要 Docker Compose v2"; exit 1; }

# 2. 检查 .env.demo 是否已配置
if grep -q "sk-your-deepseek-api-key-here" .env.demo 2>/dev/null; then
  echo "⚠️  请先编辑 .env.demo，填入真实的 LLM_API_KEY 和 EMBEDDING_API_KEY"
  echo "   vim .env.demo"
  exit 1
fi

# 3. 拉取最新代码
echo ">>> 拉取代码..."
git pull origin demo

# 4. 构建并启动
echo ">>> 构建镜像..."
docker compose --env-file .env.demo build --no-cache

echo ">>> 启动服务..."
docker compose --env-file .env.demo up -d

# 5. 等待就绪
echo ">>> 等待服务就绪..."
sleep 5
docker compose ps

# 6. 健康检查
echo ">>> 健康检查..."
sleep 2
curl -s http://localhost/api/v1/health || echo "⚠️  后端尚未就绪，请等待片刻后重试"

echo ""
echo "=== 部署完成 ==="
echo "访问地址: http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP')"
echo "查看日志: docker compose logs -f"
echo "停止服务: docker compose down"
echo ""
echo "配置 HTTPS (可选):"
echo "  sudo apt install -y certbot"
echo "  sudo certbot certonly --standalone -d mindvaults.app -d www.mindvaults.app"
echo "  然后更新 nginx.conf 并重启: docker compose restart nginx"
