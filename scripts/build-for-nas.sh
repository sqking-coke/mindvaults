#!/bin/bash
# =============================================================================
# 本地构建镜像 → 导出 tar → 用于 NAS 部署
#
# 用法:
#   chmod +x scripts/build-for-nas.sh
#   ./scripts/build-for-nas.sh              # 构建 + 导出
#   ./scripts/build-for-nas.sh --push NAS_IP # 构建 + 导出 + scp 到 NAS
# =============================================================================
set -euo pipefail

NAS_IP="${2:-}"
OUT_DIR="./docker-images"
PLATFORM="linux/amd64"  # 极空间 Z4 是 x86_64，Mac Apple Silicon 需交叉编译

# --------------- 构建镜像 ---------------
build_images() {
  echo "=== [1/3] 构建 frontend 镜像 ==="
  docker build --platform "$PLATFORM" -t mindvaults-frontend:latest -f Dockerfile.frontend .

  echo ""
  echo "=== [2/3] 构建 backend 镜像 ==="
  docker build --platform "$PLATFORM" -t mindvaults-backend:latest -f backend/Dockerfile backend/

  echo ""
  echo "=== [3/3] 拉取公共镜像（如果本地没有） ==="
  for img in \
    "pgvector/pgvector:pg16" \
    "nginx:alpine" \
    "redis:7-alpine" \
    "ghcr.io/openclaw/openclaw:latest" \
    "ollama/ollama:latest"; do
    echo "  pulling $img ..."
    docker pull --platform "$PLATFORM" "$img"
  done
}

# --------------- 导出镜像为 tar ---------------
export_images() {
  mkdir -p "$OUT_DIR"

  echo ""
  echo "=== 导出镜像到 $OUT_DIR/ ==="

  echo "  exporting mindvaults-frontend:latest ..."
  docker save mindvaults-frontend:latest | gzip > "$OUT_DIR/mindvaults-frontend.tar.gz"

  echo "  exporting mindvaults-backend:latest ..."
  docker save mindvaults-backend:latest | gzip > "$OUT_DIR/mindvaults-backend.tar.gz"

  # 公共镜像也打包，免得 NAS 上还要拉
  echo "  exporting pgvector/pgvector:pg16 ..."
  docker save pgvector/pgvector:pg16 | gzip > "$OUT_DIR/pgvector-pg16.tar.gz"

  echo "  exporting nginx:alpine ..."
  docker save nginx:alpine | gzip > "$OUT_DIR/nginx-alpine.tar.gz"

  echo "  exporting redis:7-alpine ..."
  docker save redis:7-alpine | gzip > "$OUT_DIR/redis-7-alpine.tar.gz"

  echo "  exporting openclaw:latest ..."
  docker save ghcr.io/openclaw/openclaw:latest | gzip > "$OUT_DIR/openclaw-latest.tar.gz"

  echo "  exporting ollama:latest ..."
  docker save ollama/ollama:latest | gzip > "$OUT_DIR/ollama-latest.tar.gz"

  echo ""
  echo "=== 导出完成，文件大小 ==="
  du -sh "$OUT_DIR"/*.tar.gz
}

# --------------- 推送到 NAS ---------------
push_to_nas() {
  local target="$1"
  echo ""
  echo "=== 上传到 NAS: $target ==="
  ssh "$target" "mkdir -p ~/mindvaults-docker-images"
  scp "$OUT_DIR"/*.tar.gz "$target:~/mindvaults-docker-images/"
  echo ""
  echo "=== 上传完成 ==="
  echo ""
  echo "在 NAS 上执行以下命令加载镜像："
  echo "  cd ~/mindvaults-docker-images"
  echo "  for f in *.tar.gz; do gunzip -c \$f | docker load; done"
  echo ""
  echo "然后进入项目目录启动："
  echo "  cd /path/to/mindvaults"
  echo "  docker compose up -d"
}

# --------------- main ---------------
build_images
export_images

if [ -n "$NAS_IP" ]; then
  push_to_nas "$NAS_IP"
else
  echo ""
  echo "=== 下一步 ==="
  echo "将 $OUT_DIR/ 目录传到 NAS，然后执行："
  echo ""
  echo "  # 1. 加载镜像"
  echo "  cd ~/mindvaults-docker-images  # 你的存放目录"
  echo "  for f in *.tar.gz; do gunzip -c \$f | docker load; done"
  echo ""
  echo "  # 2. 启动服务（需要先把项目代码也同步到 NAS）"
  echo "  cd /path/to/mindvaults"
  echo "  docker compose up -d"
  echo ""
  echo "  # 或者用 rsync 一键传镜像："
  echo "  rsync -avP $OUT_DIR/ NAS_IP:~/mindvaults-docker-images/"
fi
