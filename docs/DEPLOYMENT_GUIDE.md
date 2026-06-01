# mindvaults 部署指南

> 适用版本：v0.0.1 | 更新：2026-06-01

---

## 一键部署

```bash
git clone https://github.com/sqking-coke/mindvaults.git && cd mindvaults
cp .env.demo .env
docker compose --env-file .env up -d
```

打开 `http://<服务器IP>`，进入系统设置页填入 API Key 即可使用。

| 模式 | 命令 | 说明 |
|------|------|------|
| 云端 API（推荐） | `docker compose --env-file .env up -d` | 5 容器，LLM/Embedding 走云端 |
| 本地全栈 | `docker compose --profile full --env-file .env up -d` | + Ollama 本地推理 |
| 演示体验 | `git checkout demo && docker compose --env-file .env.demo up -d` | 预置数据，禁止上传 |

## 环境要求

| 模式 | CPU | 内存 | 磁盘 |
|------|-----|------|------|
| 云端 API | 2 核 | 2 GB | 20 GB |
| 本地全栈 | 4 核 | 16 GB | 50 GB |

软件：Docker 24+ + Docker Compose v2

## 环境变量

编辑 `.env`，核心配置：

| 变量 | 说明 | 示例 |
|------|------|------|
| `LLM_API_KEY` | 大模型 Key | `sk-xxx` |
| `LLM_BASE_URL` | 模型地址 | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 模型名 | `deepseek-chat` |
| `EMBEDDING_API_KEY` | Embedding Key | `sk-xxx` |
| `EMBEDDING_BASE_URL` | Embedding 地址 | `https://api.siliconflow.cn/v1` |
| `EMBEDDING_MODEL` | Embedding 模型 | `BAAI/bge-large-zh-v1.5` |

> 所有 Key 也可以在系统设置页 UI 里配置，`.env` 只是默认值。完整变量见 `.env.example`。

## Provider 组合

| 方案 | LLM | Embedding | 适用场景 |
|------|-----|-----------|------|
| DeepSeek + 硅基流动 | `api.deepseek.com` | `api.siliconflow.cn` | 国内推荐 |
| OpenAI | `api.openai.com` | `api.openai.com` | 海外 |
| Ollama 本地 | `ollama:11434` | `ollama:11434` | 完全离线 |
| DeepSeek + Ollama | `api.deepseek.com` | Ollama 本地 | 省 Embedding 费用 |

## Nginx HTTPS

```bash
# 1. 获取证书
sudo apt install -y certbot
sudo certbot certonly --standalone -d your-domain.com

# 2. 挂载证书到 docker-compose.yml nginx 服务
#   volumes:
#     - ./nginx.conf:/etc/nginx/nginx.conf:ro
#     - /etc/letsencrypt/live/your-domain.com/fullchain.pem:/etc/ssl/certs/fullchain.pem:ro
#     - /etc/letsencrypt/live/your-domain.com/privkey.pem:/etc/ssl/private/privkey.pem:ro

# 3. nginx.conf 开启 HTTPS（见仓库 nginx.conf 模板）

# 4. 自动续期
#   crontab -e: 0 3 * * * certbot renew -q && docker compose restart nginx
```

## 常见问题

| 问题 | 排查 |
|------|------|
| 端口被占用 | 改 `docker-compose.yml` nginx `ports: - "8080:80"` |
| 数据库连接失败 | `docker compose exec db pg_isready -U mindvaults` |
| 向量检索为空 | 检查 `EMBEDDING_DIM` 与模型维度一致 |
| SSE 流中断 | 确认 nginx `proxy_buffering off` + `proxy_read_timeout 300s` |
| 磁盘不足 | `docker system prune -a` · Ollama 模型 `ollama list` |

## 更新部署

```bash
git pull origin main
docker compose --env-file .env up -d --build
# 数据在 Docker volumes 里，不会丢
```

## 快速命令

```bash
docker compose --env-file .env up -d        # 启动
docker compose down                          # 停止
docker compose logs -f backend               # 日志
docker compose exec backend alembic upgrade head  # 迁移
curl http://localhost/api/v1/health          # 健康检查
```
