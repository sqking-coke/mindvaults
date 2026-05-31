# mindvaults 代码部署操作指南

> **适用版本**: v0.0.1 | **最后更新**: 2026-05-31
> **目标读者**: 运维工程师、后端开发、DevOps

---

## 目录

1. [项目结构概览](#1-项目结构概览)
2. [环境依赖](#2-环境依赖)
3. [构建步骤](#3-构建步骤)
   - [3.1 Docker Compose 一键部署](#31-docker-compose-一键部署)
   - [3.2 轻量模式（云端 API）](#32-轻量模式云端-api)
   - [3.3 本地全栈模式（Ollama）](#33-本地全栈模式ollama)
   - [3.4 开发环境手动构建](#34-开发环境手动构建)
4. [云端部署配置](#4-云端部署配置)
   - [4.1 云服务器环境准备](#41-云服务器环境准备)
   - [4.2 环境变量详解](#42-环境变量详解)
   - [4.3 Provider 切换配置](#43-provider-切换配置)
   - [4.4 Nginx HTTPS 配置](#44-nginx-https-配置)
   - [4.5 安全加固清单](#45-安全加固清单)
5. [常见问题排查](#5-常见问题排查)

---

## 1. 项目结构概览

```
mindvaults/
├── backend/                        # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py                 # FastAPI 应用入口，挂载路由与中间件
│   │   ├── config.py               # 基于 pydantic-settings 的环境配置加载
│   │   ├── api/v1/                 # REST API 路由层
│   │   │   ├── router.py           # 顶层路由注册
│   │   │   ├── chat.py             # RAG 问答 SSE 端点
│   │   │   ├── documents.py        # 文档 CRUD 端点
│   │   │   ├── retrieval.py        # 检索测试 + 切片预览
│   │   │   ├── chunks.py           # 切片管理端点
│   │   │   ├── stats.py            # 问答复盘统计
│   │   │   └── health.py           # 健康检查
│   │   ├── models/                 # SQLAlchemy ORM 模型 (Document/Chunk/Session/QARecord)
│   │   ├── schemas/                # Pydantic 请求/响应 Schema
│   │   ├── services/               # 业务逻辑层
│   │   │   ├── chat_service.py     # RAG 问答 + 意图识别
│   │   │   ├── document_service.py # 文档管理 + 重索引
│   │   │   ├── retrieval_service.py# pgvector HNSW 向量检索
│   │   │   ├── ingestion_service.py# 文档→切片→向量化 摄入管道
│   │   │   ├── parser_service.py   # PDF/Word/MD 解析
│   │   │   ├── chunking_service.py # 文本切片 (固定/语义)
│   │   │   ├── embedding_service.py# Embedding 向量生成 (ollama/openai)
│   │   │   ├── llm_service.py      # LLM 调用 (ollama/openai)
│   │   │   ├── cache_service.py    # Redis 检索缓存 (带降级)
│   │   │   └── stats_service.py    # 统计聚合
│   │   └── core/
│   │       ├── database.py         # asyncpg 异步引擎 + 连接池
│   │       ├── redis.py            # Redis 连接管理
│   │       ├── middleware.py        # 限流 + 请求日志中间件
│   │       └── exceptions.py       # 全局异常处理
│   ├── alembic/                    # 数据库迁移
│   │   ├── env.py                  # 迁移环境配置
│   │   └── versions/               # 迁移脚本
│   ├── tests/                      # pytest 测试
│   ├── Dockerfile                  # 后端容器构建
│   ├── entrypoint.sh               # 容器启动脚本 (等DB/Redis/Ollama + 迁移)
│   ├── requirements.txt            # Python 依赖 (精确版本)
│   └── pyproject.toml              # 项目元数据与构建配置
├── src/                            # Next.js 14 前端
│   ├── app/                        # App Router 页面
│   │   ├── layout.tsx              # 全局布局
│   │   ├── page.tsx                # 首页仪表盘
│   │   ├── chat/page.tsx           # 对话页
│   │   └── kb/page.tsx             # 知识库管理
│   ├── components/                 # React 组件
│   │   ├── chat/                   # 对话组件 (消息流/输入框/引用/导出)
│   │   ├── kb/                     # 知识库组件 (文档表/上传区/检索沙盒)
│   │   └── layout/                 # 布局组件 (侧边栏)
│   ├── services/                   # API 调用封装
│   ├── types/                      # TypeScript 类型定义
│   └── utils/                      # 工具函数
├── docs/                           # 项目文档
├── docker-compose.yml              # 容器编排 (6服务: FE/BE/DB/Redis/Ollama/Nginx)
├── nginx.conf                      # Nginx 反向代理配置
├── Dockerfile.frontend             # 前端多阶段构建
├── .env.example                    # 环境变量模板
└── package.json                    # 前端依赖
```

**架构层次**：

```
用户浏览器 → Nginx (:80) ─┬─ / → Frontend (:3000) Next.js SSR
                          └─ /api/* → Backend (:8000) FastAPI
                                          ├── PostgreSQL (:5432) 业务数据 + 向量
                                          ├── Redis (:6379) 检索缓存 + 限流
                                          └── Ollama (:11434) / 云端 API  LLM + Embedding
```

---

## 2. 环境依赖

### 2.1 硬件建议

| 部署模式 | CPU | 内存 | 磁盘 | GPU |
|---------|-----|------|------|-----|
| **轻量模式** (云端API) | 2核+ | 2GB+ | 20GB+ | 不需要 |
| **本地全栈** (Ollama) | 4核+ | 16GB+ | 50GB+ | 推荐但不必须 |

> 本地模式内存消耗大头为 Ollama 模型加载：qwen3 ~4.5GB，BGE-large ~1.3GB，合计约 6GB，加上系统开销和向量检索推荐 16GB+。

### 2.2 软件依赖（Docker 部署）

| 软件 | 最低版本 | 说明 |
|------|---------|------|
| Docker Engine | 24.0+ | 容器运行时 |
| Docker Compose | v2.0+ | 多容器编排 (已内置在 Docker Desktop) |
| Git | 2.x | 克隆仓库 |

### 2.3 软件依赖（手动开发部署）

| 软件 | 最低版本 | 用途 |
|------|---------|------|
| Python | 3.11+ | 后端运行时 |
| pip | 23.x+ | Python 包管理 |
| Node.js | 18.x+ (推荐 20 LTS) | 前端运行时 |
| npm | 9.x+ | 前端包管理 |
| PostgreSQL | 16 | 业务数据 + 向量存储 |
| pgvector 扩展 | 0.7+ | 向量索引 (HNSW) |
| Redis | 7.x | 缓存 |
| Ollama | 最新版 | 本地 LLM + Embedding (可选) |

### 2.4 端口占用

| 服务 | 端口 | 协议 | 外部暴露 |
|------|------|------|---------|
| Nginx | 80 | HTTP | ✅ |
| Frontend | 3000 | HTTP | Docker 内部 |
| Backend | 8000 | HTTP | Docker 内部 |
| PostgreSQL | 5432 | TCP | Docker 内部 |
| Redis | 6379 | TCP | Docker 内部 |
| Ollama | 11434 | HTTP | Docker 内部 |

> 如果主机上已有服务占用 80 端口，修改 `docker-compose.yml` 中 nginx 的 `ports` 映射，例如 `"8080:80"`。

---

## 3. 构建步骤

### 3.1 Docker Compose 一键部署

Docker Compose 是最推荐的部署方式，镜像预配置，无需手动安装运行时依赖。

**双模式切换**：通过 `--profile` 控制。默认启动 5 容器（含 Redis 缓存），加 `--profile full` 启用 Ollama 本地推理。

#### 步骤 1：克隆仓库

```bash
git clone git@github.com:sqking-coke/mindvaults.git
cd mindvaults
```

#### 步骤 2：配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，根据部署模式调整配置 (详见第4节)
```

**关键配置项**：
- `API_KEY`：**必须修改**，用于 API 鉴权
- `LLM_PROVIDER` / `EMBEDDING_PROVIDER`：决定使用本地 Ollama 还是云端 API
- `DATABASE_URL` / `REDIS_URL`：Docker 部署保持默认即可（容器间通过服务名通信）

#### 步骤 3：启动服务

```bash
# 默认模式（5 容器，LLM/Embedding 走云端 API）
docker compose up -d

# 全栈模式（6 容器，Ollama 本地推理，数据完全不出网）
docker compose --profile full up -d
```

#### 步骤 4：等待服务就绪

```bash
# 查看各服务状态
docker compose ps

# 查看后端日志（等待 "Starting FastAPI..." 出现）
docker compose logs -f backend
```

后端 `entrypoint.sh` 会依次等待 PostgreSQL、Redis 就绪后自动执行数据库迁移。

#### 步骤 5：全栈模式 — 拉取模型（仅首次）

```bash
# 拉取 LLM 模型
docker exec -it $(docker compose ps -q ollama) ollama pull qwen3

# 拉取 Embedding 模型
docker exec -it $(docker compose ps -q ollama) ollama pull BAAI/bge-large-zh-v1.5
```

#### 步骤 6：验证部署

```bash
# 健康检查
curl http://localhost/api/v1/health
# 预期响应: {"code":0,"status":"healthy"}

# 浏览器访问
open http://localhost
```

---

### 3.2 默认模式（云端 API + Redis 缓存）

**适用场景**：2核4G 低配服务器、演示环境、不希望在本地运行大模型。

**架构**：Nginx + Frontend + Backend + PostgreSQL + Redis（5容器），LLM/Embedding 通过 API 调用云端服务。

```bash
# 1. 克隆 + 配置
git clone git@github.com:sqking-coke/mindvaults.git && cd mindvaults
cp .env.example .env

# 2. 编辑 .env，配置云端 API Key（默认已指向 DeepSeek）
# LLM_PROVIDER=openai
# LLM_BASE_URL=https://api.deepseek.com/v1
# LLM_MODEL=deepseek-chat
# LLM_API_KEY=sk-your-deepseek-api-key
#
# EMBEDDING_PROVIDER=openai
# EMBEDDING_MODEL=text-embedding-3-small
# EMBEDDING_DIM=1536
# EMBEDDING_API_KEY=sk-your-deepseek-api-key

# 3. 启动
docker compose up -d

# 4. 验证
curl http://localhost/api/v1/health
```

**成本参考**（以 DeepSeek 为例）：
- LLM (deepseek-chat)：¥1/百万 token 输入，¥2/百万 token 输出
- Embedding (text-embedding-3-small)：$0.02/百万 token

---

### 3.3 全栈模式（Ollama 本地推理）

**适用场景**：数据完全不出内网，有 16GB+ 内存的服务器。

**架构**：Nginx + Frontend + Backend + PostgreSQL + Redis + Ollama（6容器），全部本地推理。

```bash
# 1. 克隆 + 配置
git clone git@github.com:sqking-coke/mindvaults.git && cd mindvaults
cp .env.example .env
# 编辑 .env，切换到本地模式：
# LLM_PROVIDER=ollama
# LLM_BASE_URL=http://ollama:11434
# LLM_MODEL=qwen3
# EMBEDDING_PROVIDER=ollama
# EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5
# EMBEDDING_DIM=1024

# 2. 一键启动
docker compose --profile full up -d

# 3. 等待 Ollama 就绪后拉取模型（仅首次）
docker exec -it $(docker compose ps -q ollama) ollama pull qwen3
docker exec -it $(docker compose ps -q ollama) ollama pull BAAI/bge-large-zh-v1.5

# 4. 验证
curl http://localhost/api/v1/health
```

**低配服务器优化**：如果内存不足 16GB，换用更小的模型：

```bash
# .env 中修改
LLM_MODEL=qwen2.5:0.5b          # 约 400MB，原推荐 qwen3 (~4.5GB)
EMBEDDING_MODEL=bge-small-zh-v1.5  # 约 120MB，原 BGE-large (~1.3GB)
EMBEDDING_DIM=384                 # bge-small 的维度

# 拉取小模型
docker exec -it $(docker compose ps -q ollama) ollama pull qwen2.5:0.5b
docker exec -it $(docker compose ps -q ollama) ollama pull bge-small-zh-v1.5
```

---

### 3.4 开发环境手动构建

#### 后端

```bash
cd backend

# 创建虚拟环境（推荐）
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
pip install -e ".[dev]"   # 含 pytest

# 确保 PostgreSQL/Redis 已运行，配置 DATABASE_URL 指向本地实例
# 编辑 .env 或设置环境变量

# 执行数据库迁移
alembic upgrade head

# 启动开发服务器（热重载）
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 运行测试
pytest
pytest -m "not needs_db"  # 跳过需要数据库的集成测试
```

#### 前端

```bash
# 在项目根目录

# 安装依赖
npm install

# 配置 API 地址
# 编辑 .env.local:
# NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# 启动开发服务器（热重载）
npm run dev
# → http://localhost:3000

# 生产构建
npm run build
npm run start

# Lint + 类型检查
npm run lint
npx tsc --noEmit
```

---

## 4. 云端部署配置

### 4.1 云服务器环境准备

以下以 Ubuntu 22.04/24.04 LTS 为例。

```bash
# 1. 更新系统
sudo apt update && sudo apt upgrade -y

# 2. 安装 Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# 重新登录使权限生效

# 3. 安装 Git
sudo apt install -y git

# 4. 配置防火墙 (仅开放必要端口)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS (如果需要)
sudo ufw enable

# 5. 克隆项目
git clone git@github.com:sqking-coke/mindvaults.git
cd mindvaults

# 6. 配置环境变量 (见 4.2)
cp .env.example .env
vim .env

# 7. 启动服务
docker compose up -d     # 默认模式（5 容器）
# 或全栈模式:
# docker compose --profile full up -d
```

### 4.2 环境变量详解

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| **数据库** | | | |
| `DATABASE_URL` | `postgresql+asyncpg://mindvaults:mindvaults@db:5432/mindvaults` | ✅ | 数据库连接串；Docker 模式保持默认 |
| **Redis** | | | |
| `REDIS_URL` | `redis://redis:6379` | ✅ | Redis 连接串 |
| `REDIS_CACHE_TTL` | `3600` | — | 检索缓存过期秒数 |
| `REDIS_CACHE_ENABLED` | `true` | — | 缓存开关，关闭后直接查 PG |
| **LLM** | | | |
| `LLM_PROVIDER` | `ollama` | ✅ | `ollama` 或 `openai` |
| `LLM_BASE_URL` | `http://ollama:11434` | ✅ | 模型服务地址 |
| `LLM_MODEL` | `qwen3` | ✅ | 模型名称 |
| `LLM_API_KEY` | (空) | 条件 | ollama 模式不需要，openai 模式必填 |
| **Embedding** | | | |
| `EMBEDDING_PROVIDER` | `ollama` | ✅ | `ollama` 或 `openai` |
| `EMBEDDING_MODEL` | `BAAI/bge-large-zh-v1.5` | ✅ | Embedding 模型名称 |
| `EMBEDDING_DIM` | `1024` | ✅ | 向量维度，必须与模型匹配 |
| `EMBEDDING_BASE_URL` | (空) | — | 独立 Embedding 地址，留空复用 `LLM_BASE_URL` |
| `EMBEDDING_API_KEY` | (空) | 条件 | 独立 Embedding Key，留空复用 `LLM_API_KEY` |
| **应用** | | | |
| `APP_ENV` | `development` | — | `development` / `production` |
| `APP_DEBUG` | `true` | — | 生产环境建议 `false` |
| `API_KEY` | `change-me-in-production` | ✅⚠️ | **生产环境必须修改** |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost` | — | 允许的跨域来源，逗号分隔 |
| **限流** | | | |
| `RATE_LIMIT_ENABLED` | `true` | — | 限流开关 |
| **日志** | | | |
| `LOG_LEVEL` | `INFO` | — | 日志级别: DEBUG/INFO/WARNING/ERROR |
| `LOG_DIR` | `/app/logs` | — | 日志目录 |
| `LOG_RETENTION` | `30` | — | 日志保留天数 |
| **上传** | | | |
| `UPLOAD_DIR` | `/app/uploads` | — | 上传文件存储目录 |
| `MAX_UPLOAD_SIZE_MB` | `50` | — | 单文件最大上传大小 |
| `ALLOWED_EXTENSIONS` | `txt,md,pdf,docx,doc` | — | 允许的文件扩展名 |
| **前端** | | | |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000` | ✅ | 前端调用后端的 API 地址 |

### 4.3 Provider 切换配置

系统支持两种 LLM/Embedding Provider，且 LLM 和 Embedding 可以独立选择不同的 Provider。

#### 方案 A：纯本地 Ollama

```bash
LLM_PROVIDER=ollama
LLM_BASE_URL=http://ollama:11434
LLM_MODEL=qwen3
LLM_API_KEY=

EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5
EMBEDDING_DIM=1024
```

#### 方案 B：DeepSeek 云端

```bash
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-your-deepseek-key

EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
EMBEDDING_API_KEY=sk-your-deepseek-key
```

#### 方案 C：OpenAI 官方

```bash
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-your-openai-key

EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
EMBEDDING_API_KEY=sk-your-openai-key
```

#### 方案 D：混合模式（本地 Embedding + 云端 LLM）

```bash
# 省去 Embedding 模型的显存开销，同时享受云端 LLM 的质量
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-your-key

EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5
EMBEDDING_DIM=1024
```

> ⚠️ **重要提醒**：切换 Embedding 模型或维度后，之前入库的向量与新模型维度不匹配，必须**重建知识库**（删除旧文档重新上传）或执行数据库向量列迁移。

### 4.4 Nginx HTTPS 配置

生产环境强烈建议启用 HTTPS。以下是配合 Let's Encrypt (Certbot) 的完整方案。

#### 步骤 1：获取 SSL 证书

```bash
# 安装 Certbot
sudo apt install -y certbot

# 先停止 Nginx 容器（释放 80 端口给 certbot 验证）
docker compose stop nginx

# 申请证书（standalone 模式）
sudo certbot certonly --standalone -d your-domain.com

# 证书路径
# 完整链: /etc/letsencrypt/live/your-domain.com/fullchain.pem
# 私钥:   /etc/letsencrypt/live/your-domain.com/privkey.pem
```

#### 步骤 2：更新 nginx.conf 支持 HTTPS

将项目根目录的 `nginx.conf` 替换为以下内容：

```nginx
events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # HTTP → HTTPS 重定向
    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;

        # 前端
        location / {
            proxy_pass http://frontend:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # 后端 API（SSE 免缓冲）
        location /api/ {
            proxy_pass http://backend:8000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_buffering off;
            proxy_cache off;
            proxy_set_header X-Accel-Buffering no;
            proxy_set_header Connection '';
            proxy_read_timeout 300s;
        }
    }
}
```

#### 步骤 3：更新 docker-compose.yml

在 nginx 服务配置中添加证书卷挂载：

```yaml
nginx:
  image: nginx:alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx.conf:/etc/nginx/nginx.conf:ro
    - /etc/letsencrypt/live/your-domain.com/fullchain.pem:/etc/letsencrypt/live/your-domain.com/fullchain.pem:ro
    - /etc/letsencrypt/live/your-domain.com/privkey.pem:/etc/letsencrypt/live/your-domain.com/privkey.pem:ro
  depends_on:
    - frontend
    - backend
  restart: unless-stopped
```

#### 步骤 4：设置证书自动续期

```bash
# 添加 cron 任务
sudo crontab -e
# 添加：
# 0 3 * * * certbot renew --quiet --pre-hook "cd /path/to/mindvaults && docker compose stop nginx" --post-hook "cd /path/to/mindvaults && docker compose start nginx"
```

#### 步骤 5：重启服务

```bash
docker compose up -d --force-recreate nginx
```

### 4.5 安全加固清单

部署到生产环境前，逐项检查以下安全配置：

- [ ] `API_KEY` 已修改为强随机字符串（`openssl rand -hex 32`）
- [ ] `APP_ENV` 设为 `production`
- [ ] `APP_DEBUG` 设为 `false`
- [ ] 数据库密码 `POSTGRES_PASSWORD` 已从默认 `mindvaults` 改为强密码
- [ ] 防火墙仅开放 22(SSH)、80(HTTP)、443(HTTPS) 端口
- [ ] 已启用 HTTPS 并配置 HSTS
- [ ] `CORS_ORIGINS` 限定为实际前端域名
- [ ] API Key 不通过 URL 参数传递（使用 Authorization Header）
- [ ] `.env` 文件权限设为 600（`chmod 600 .env`）
- [ ] 定期更新 Docker 镜像（`docker compose pull`）
- [ ] 已配置日志轮转上限（`LOG_RETENTION=30`）
- [ ] 数据库卷 (`pgdata`) 有定期备份策略

---

## 5. 常见问题排查

### 5.1 后端无法连接数据库

**现象**：`docker compose logs backend` 显示 `could not connect to server` 或 entrypoint.sh 一直卡在 "Waiting for PostgreSQL..."

**排查步骤**：

```bash
# 1. 确认 PostgreSQL 容器是否运行
docker compose ps db

# 2. 检查 PostgreSQL 健康状态
docker compose exec db pg_isready -U mindvaults

# 3. 查看 PostgreSQL 日志
docker compose logs db

# 4. 如果 db 容器 crash-loop，重置数据卷
docker compose down -v   # ⚠️ 会删除所有数据
docker compose up -d
```

### 5.2 Ollama 模型拉取失败或超时

**现象**：`ollama pull` 命令长时间无响应或返回网络错误。

**排查步骤**：

```bash
# 1. 检查 Ollama 容器是否能访问外网
docker compose exec ollama curl -I https://ollama.ai

# 2. 如果网络受限（国内服务器），设置代理或镜像
# 在 docker-compose.yml 的 ollama 服务中添加：
#   environment:
#     - HTTP_PROXY=http://your-proxy:port
#     - HTTPS_PROXY=http://your-proxy:port

# 3. 手动下载模型文件后导入（备选方案）
# 参见: https://github.com/ollama/ollama/blob/main/docs/import.md
```

### 5.3 前端页面加载但无法调用 API

**现象**：浏览器访问首页正常，但对话/上传等操作失败，控制台显示 CORS 错误或 401/403。

**排查步骤**：

```bash
# 1. 确认后端容器正常运行
docker compose ps backend

# 2. 检查 API Key 是否匹配
# 前端请求的 Authorization Header 必须与 .env 中的 API_KEY 一致
docker compose exec backend env | grep API_KEY

# 3. 如果前端直连后端（不经过 Nginx），检查 CORS
# .env 中 CORS_ORIGINS 需包含前端地址

# 4. 检查 Nginx 是否正确代理 /api/ 请求
curl -v http://localhost/api/v1/health
```

### 5.4 向量检索无结果或相似度异常

**现象**：问答时检索不到相关文档，或所有相似度得分异常。

**排查步骤**：

```bash
# 1. 确认 pgvector 扩展已启用
docker compose exec db psql -U mindvaults -d mindvaults -c "SELECT * FROM pg_extension WHERE extname='vector';"

# 2. 检查 Embedding 模型是否正确加载
# 轻量模式：测试 API 连通性
curl -H "Authorization: Bearer $EMBEDDING_API_KEY" \
  "$EMBEDDING_BASE_URL/embeddings" \
  -d '{"model":"text-embedding-3-small","input":"test"}'

# 本地模式：检查 Ollama 模型列表
docker compose exec ollama ollama list

# 3. 确认 EMBEDDING_DIM 与模型实际维度匹配
# BGE-large: 1024, BGE-small: 384, text-embedding-3-small: 1536
# 维度不匹配会导致检索失败或结果异常
```

### 5.5 SSE 流式响应中断或卡住

**现象**：对话页面显示一会后卡住，不再更新。

**排查步骤**：

```bash
# 1. 确认 Nginx 配置中 /api/ 的 buffering 已关闭
grep -A 5 "location /api/" nginx.conf
# 应包含: proxy_buffering off; proxy_cache off;

# 2. 检查 proxy_read_timeout 是否足够
# 当前默认 300s，长文本生成超过此时间会被 Nginx 截断

# 3. 如果使用了 Cloudflare 或其他 CDN
# 需在 CDN 配置中关闭对 /api/* 路径的缓冲
```

### 5.6 Docker 磁盘空间不足

**现象**：`No space left on device` 或服务无法启动。

**排查步骤**：

```bash
# 1. 检查磁盘使用
df -h

# 2. 清理 Docker 未使用的资源
docker system prune -a --volumes  # ⚠️ 会删除未使用的镜像和卷

# 3. 只清理构建缓存（更安全）
docker builder prune

# 4. 检查 Ollama 模型占用
docker compose exec ollama ollama list
# 删除不用的模型
# docker compose exec ollama ollama rm <model-name>
```

### 5.7 数据库迁移失败

**现象**：`alembic upgrade head` 报错，后端无法启动。

**排查步骤**：

```bash
# 1. 查看当前迁移状态
docker compose exec backend alembic current

# 2. 查看迁移历史
docker compose exec backend alembic history

# 3. 如果是迁移脚本冲突，手动回滚到上一版本后重试
docker compose exec backend alembic downgrade -1
docker compose exec backend alembic upgrade head

# 4. 终极方案：重建数据库（数据丢失警告）
docker compose down -v
docker compose up -d
```

### 5.8 日志查看技巧

```bash
# 实时查看所有服务日志
docker compose logs -f

# 只看特定服务
docker compose logs -f backend
docker compose logs -f frontend

# 查看最近 100 行
docker compose logs --tail 100 backend

# 查看后端日志文件（挂载在 ./logs）
tail -f logs/app_$(date +%Y-%m-%d).log

# 查看容器资源使用
docker stats
```

---

## 附录：快速命令参考

```bash
# === 启动与停止 ===
docker compose up -d                         # 默认模式启动（5 容器）
docker compose --profile full up -d          # 全栈模式启动（6 容器）
docker compose down                          # 停止并删除容器
docker compose down -v                       # 停止并删除容器+卷（⚠️ 数据丢失）
docker compose restart backend               # 重启单个服务

# === 查看状态 ===
docker compose ps                            # 服务列表
docker compose logs -f backend               # 后端日志
docker compose exec backend env              # 后端环境变量
curl http://localhost/api/v1/health          # 健康检查

# === 模型管理（本地模式） ===
docker compose exec ollama ollama list       # 已安装模型
docker compose exec ollama ollama pull qwen3 # 拉取模型
docker compose exec ollama ollama rm qwen3   # 删除模型

# === 数据库 ===
docker compose exec backend alembic current  # 当前迁移版本
docker compose exec backend alembic upgrade head  # 执行迁移
docker compose exec db psql -U mindvaults -d mindvaults  # 进入数据库Shell

# === 更新部署 ===
git pull                                      # 拉取最新代码
docker compose build --no-cache backend       # 重新构建后端镜像
docker compose up -d --force-recreate         # 强制重建容器
```
