<p align="center">
  <img src="public/logo.svg" alt="mindvaults logo" width="128" />
</p>

<h1 align="center">mindvaults</h1>
<p align="center">mindvaults = AI 知识库（Mind）+ 私有保险库（Vault），本地/云端双模式 RAG 问答系统，你的数据永远归你所有。</p>


<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React" />
  <br/>
  <img src="https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/pgvector-HNSW-4B8BBE?logo=postgresql&logoColor=white" alt="pgvector" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Ollama-LLM-000000?logo=ollama&logoColor=white" alt="Ollama" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Nginx-Proxy-009639?logo=nginx&logoColor=white" alt="Nginx" />
</p>

---

> mindvaults 是一款支持**本地私有化 + 云端 API 双模式**的 RAG 知识库问答系统。默认 5 容器部署（含 Redis 缓存，LLM/Embedding 走云端 API），加 `--profile full` 启用 Ollama 本地推理实现完全离线运行。基于 FastAPI + Next.js 14 + PostgreSQL/pgvector + Redis 构建。


### 💡 RAG 是怎么工作的？

一个完整的 RAG 问答分为独立的两步，需要**两个不同的 API 各司其职**：

```
用户提问："mindvaults 是什么？"
        │
        ▼
  ① Embedding（向量检索）       ② LLM（生成回答）
     把问题转成向量                 把文档 + 问题喂给大模型
     → 去数据库搜相关文档             → 生成最终回答
     
     例如：硅基流动 / OpenAI         例如：DeepSeek / OpenAI
     某些模型没有 Embedding 能力     某些模型没有生成能力
```

> **常见问题**：DeepSeek 不提供 Embedding 接口，所以需要单独配一个支持 Embedding 的服务（如硅基流动）。两个 Key 可以来自不同厂商，系统会自动区分调用。


## 🚀 核心特性

### 1. 💬 RAG 智能问答
- **语义检索**：pgvector HNSW 索引 + BGE-large-zh-v1.5 向量化，精准匹配私有知识
- **SSE 流式响应**：实时 token 推送 + 打字机效果，progress 事件透明展示意图识别→检索→匹配→生成全链路
- **多轮对话**：session_id 关联会话记忆，支持上下文连续答疑
- **意图识别**：自动分类用户查询意图（知识问答/文档检索/闲聊），适配不同回答策略
- **引用溯源 (Citations)**：答案附带原文片段 + 文档来源 + 相似度评分 + PDF 页码，点击引用角标弹出 CitationDrawer 查看完整原文

### 2. 📚 知识库管理
- **多格式文档导入**：支持 TXT/MD/PDF/Word 文件上传，自动解析、切片、向量化入库
- **批量上传**：拖拽式上传区 + 异步摄入管道（解析→切片→向量化→入库），实时进度展示
- **文档生命周期管理**：文档列表分页查看、软删除、启用/禁用、增量重索引
- **切片管理**：按文档查看切片列表，支持编辑切片内容（自动重向量化）和删除切片
- **检索沙盒**：分屏检索测试，输入查询词 → 返回 Top-K 匹配片段 + 相似度评分
- **双模 Obsidian Vault 智能导入**：支持两种导入模式，完美融合极速前端传输与物理扫描：
  - **文件夹拖拽上传（默认/推荐）**：支持将本地文件夹直接拖入浏览器或点击选择。前端基于 HTML5 Directory API 递归解析文件夹，**智能过滤隐藏目录（如 `.obsidian`、`.git`）与大附件**，将数 GB 的 Vault 深度压缩至几百 KB 到数 MB，流式极速上传。保留 `webkitRelativePath` 供后端进行层级深度还原。
  - **绝对路径本地扫描（极客模式）**：支持在弹窗中直接输入宿主绝对路径，供后端直接扫盘。适合单机环境或已进行 Docker 卷映射（Volume Mapping）的玩家。
  - 均支持提取 YAML frontmatter 属性（title/tags/date/aliases）写入文档描述，且规范化 `[[wikilink]]` 双链。

### 3. 🛠️ 知识库运维（P2）
- **运维管理面板** (`/kb/ops`)：文档启用/禁用切换、重索引、切片查看/编辑/删除
- **问答复盘统计** (`/kb/stats`)：高频问题 Top-N、无答案问题列表、知识库概览卡片
- **Redis 检索缓存**：高频查询结果缓存（TTL 1h），不可用时自动降级至直接查库
- **增量向量更新**：文档重索引 API，删除旧切片 → 重新解析 → 向量化 → 写入，异步完成

### 4. 🎨 高级溯源与内容运营（P2）
- **PDF 双屏联动高亮**：引用来源于 PDF 时，CitationDrawer 内嵌 pdf.js 预览，自动翻页至对应页码，引用文本 CSS overlay 高亮
- **微信公众号排版适配**：inline-CSS 转换器，一键复制精美问答卡片到公众号编辑器，适配微信生态安全色与中文字体栈

### 5. 🔒 安全与运维
- **API Key 鉴权**：`Authorization: Bearer <API_KEY>` 保护所有 API 端点
- **限流控制**：问答接口 30次/分钟，上传接口 10次/分钟（可配置）
- **日志轮转**：loguru 结构化日志，每天午夜轮转，保留 30 天
- **Docker Compose 一键部署**：前端 + 后端 + PostgreSQL + Redis + Nginx（默认 5 容器），`--profile full` 加 Ollama

---

## 🛠️ 技术栈

| 层面 | 技术 | 说明 |
|------|------|------|
| **前端** | Next.js 14 (App Router) + TypeScript + TailwindCSS | SSR/SSG 混合渲染，lucide-react 图标 |
| **后端** | FastAPI + Uvicorn | Python 异步框架，自动生成 OpenAPI 文档 |
| **数据库** | PostgreSQL 16 + pgvector | 业务数据 + 向量存储统一管理，HNSW 索引 |
| **缓存** | Redis | 高频检索结果缓存 |
| **ORM** | SQLAlchemy 2.0 + asyncpg | 异步数据库驱动 |
| **LLM** | Ollama (qwen3) / 云端 API | 支持 ollama/openai provider 切换，可选用 DeepSeek/OpenAI/通义千问 |
| **Embedding** | BGE-large-zh-v1.5 / 云端 API | 支持 ollama/openai provider 切换，自动适配向量维度 |
| **文档解析** | PyPDF2, python-docx, markdown | 多格式文档内容提取 |
| **部署** | Docker Compose + Nginx | 默认 5 容器 / `--profile full` 6 容器 |

---

## 📐 系统架构

```mermaid
graph TD
    subgraph Client["🖥️ 用户"]
        B[Browser]
    end

    subgraph Proxy["🔀 Nginx :80"]
        N[反向代理 / 静态资源]
    end

    subgraph Frontend["🎨 Frontend :3000"]
        F[Next.js 14<br/>App Router]
    end

    subgraph Backend["⚙️ Backend :8000"]
        BE[FastAPI<br/>RAG Engine]
    end

    subgraph Storage["💾 数据层"]
        PG[(PostgreSQL<br/>pgvector :5432)]
        RD[(Redis<br/>:6379)]
    end

    subgraph AI["🧠 AI 引擎"]
        OL[Ollama<br/>:11434<br/>LLM + Embedding]
    end

    B -->|"HTTP"| N
    N -->|"/"| F
    N -->|"/api/*"| BE
    F -->|"API calls"| N
    BE -->|"向量检索"| PG
    BE -->|"缓存/会话"| RD
    BE -->|"LLM 推理<br/>Embedding"| OL
```

### 部署拓扑

| 服务 | 端口 | 技术栈 | 用途 |
|------|------|--------|------|
| **Nginx** | 80 | nginx:alpine | 反向代理，路由 `/` 到前端、`/api/*` 到后端，SSE 流式免缓冲 |
| **Frontend** | 3000 | Next.js 14 | 用户交互界面 |
| **Backend** | 8000 | FastAPI + Uvicorn | RAG 核心引擎：文档解析、切片、向量检索、LLM 对话 |
| **PostgreSQL** | 5432 | pgvector/pgvector:pg16 | 文档元数据、切片向量、会话记录、Q&A 记录，HNSW 索引 |
| **Redis** | 6379 | redis:7-alpine | 检索结果缓存、限流计数器 |
| **Ollama** | 11434 | ollama/ollama | 本地 LLM 推理 + Embedding 向量化 |

---

## 📡 API 接口

所有接口以 `/api/v1` 为前缀，需要 `Authorization: Bearer <API_KEY>` 鉴权（health 除外）。

### 文档管理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/kb/documents` | 批量上传文档（multipart/form-data） |
| GET | `/api/v1/kb/documents` | 分页查询文档列表 |
| GET | `/api/v1/kb/documents/{id}` | 获取文档详情 |
| PUT | `/api/v1/kb/documents/{id}` | 更新文档名称/描述 |
| DELETE | `/api/v1/kb/documents/{id}` | 软删除文档 |
| PUT | `/api/v1/kb/documents/{id}/status` | 切换文档启用/禁用 |
| POST | `/api/v1/kb/documents/{id}/reindex` | 增量重索引 |

### 智能问答
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/kb/chat` | RAG 问答（SSE 流式响应） |
| GET | `/api/v1/kb/chat/history` | 会话问答历史（分页） |
| GET | `/api/v1/kb/chat/sessions` | 会话列表 |

### 检索与切片
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/kb/retrieval/test` | 检索测试沙盒 |
| GET | `/api/v1/kb/chunks/{id}/preview` | 切片预览 |
| POST | `/api/v1/kb/chunks/{id}/locate` | 切片定位（页码+偏移量+高亮锚点） |
| GET | `/api/v1/kb/documents/{id}/chunks` | 文档切片列表 |
| PUT | `/api/v1/kb/chunks/{id}` | 编辑切片（自动重向量化） |
| DELETE | `/api/v1/kb/chunks/{id}` | 删除切片 |

### 问答复盘统计
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/kb/stats/overview` | 知识库运维概览 |
| GET | `/api/v1/kb/stats/frequent-questions` | 高频问题 Top-N |
| GET | `/api/v1/kb/stats/unanswered` | 无答案问题列表 |

### 健康检查
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/health` | 服务健康检查（无需鉴权） |

### Vault 导入与拖拽上传
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/kb/vaults/import` | 扫描本地宿主目录导入 Obsidian Vault（接收 JSON `{"path":"...", "source":"obsidian"}`） |
| POST | `/api/v1/kb/vaults/upload` | 批量上传本地文件夹导入 Obsidian Vault（接收 Multipart Form-Data，包含 `files` 列表与 `source`） |

---

## 🐳 部署指南

```bash
# 默认模式（5 容器，LLM 走云端 API）
docker compose up -d

# 全栈模式（6 容器，Ollama 本地推理，数据不出网）
docker compose --profile full up -d
```

### 🖥️ 本地开发

```bash
# 环境依赖：Python 3.12 + Node.js 22 + PostgreSQL 16 (pgvector) + Redis

# 1. 后端
cd backend
source venv/bin/activate
# 如果 venv shebang 路径损坏（目录重命名导致），改用：
#   venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. 前端
npx next dev

# 3. 访问
#   前端: http://localhost:3000
#   后端 API 文档: http://localhost:8000/docs
#   健康检查: http://localhost:8000/api/v1/health
```

> **端口冲突?** `lsof -ti:8000 | xargs kill -9`  
> **venv pip 报错?** 改用 `venv/bin/python -m pip install <pkg>`  
> 完整排查见 `docs/planning/15-本地开发环境启动.md`

> 📖 完整部署文档请参阅 **[docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)**，涵盖：
> - Docker Compose Profiles 双模式部署
> - 24 项环境变量详解 + 4 种 Provider 组合方案
> - 云服务器初始化 + Nginx HTTPS + 安全加固清单
> - 8 个典型故障排查场景
> - 开发环境手动构建 + 代码质量检查

---

## 🎨 品牌视觉与变体

mindvaults 精心设计了三款不同风格的高精细度 **SVG 矢量品牌徽标 (Logo)**，完全适配暗黑/明亮模式以及移动端自适应。

> 🎨 完整设计规范与多模态素材，请参阅 **[docs/BRANDING_GUIDE.md](docs/BRANDING_GUIDE.md)**，包含：
> - **Option A (默认)**: Cyber RAG Vault (赛博大脑与密码锁)
> - **Option B**: Minimalist Monogram (极简 MV 向量交织丝带)
> - **Option C**: Enterprise Shield (企业级高主权高防卫盾牌)
> - **微信公众号排版规范** (次图尺寸、首图 Banner 及微信安全调色板)
> - **网页 Favicon 转换及 Web App Manifest 配置指引**

---

## 📁 代码目录结构

```text
mindvaults/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI 应用入口
│   │   ├── config.py               # 环境变量配置
│   │   ├── api/
│   │   │   ├── deps.py             # 依赖注入（DB/鉴权）
│   │   │   └── v1/
│   │   │       ├── router.py       # 路由注册
│   │   │       ├── chat.py         # 问答 SSE 端点
│   │   │       ├── documents.py    # 文档 CRUD 端点
│   │   │       ├── retrieval.py    # 检索测试 + 切片预览
│   │   │       ├── chunks.py       # 切片管理端点
│   │   │       ├── stats.py        # 问答复盘统计端点
│   │   │       └── health.py       # 健康检查
│   │   ├── models/                 # SQLAlchemy 数据模型
│   │   │   ├── document.py         # KbDocument
│   │   │   ├── chunk.py            # KbChunk (含 pgvector)
│   │   │   ├── session.py          # KbSession
│   │   │   ├── qa_record.py        # KbQaRecord
│   │   │   └── config.py           # KbConfig
│   │   ├── schemas/                # Pydantic 请求/响应模型
│   │   ├── services/               # 业务逻辑层
│   │   │   ├── chat_service.py     # RAG 问答 + 意图识别
│   │   │   ├── document_service.py # 文档管理 + 重索引
│   │   │   ├── retrieval_service.py# pgvector 向量检索
│   │   │   ├── ingestion_service.py# 摄入管道编排
│   │   │   ├── parser_service.py   # 文档解析（PDF/Word/MD）
│   │   │   ├── chunking_service.py # 文本切片（固定/语义）
│   │   │   ├── embedding_service.py# BGE 向量生成
│   │   │   ├── llm_service.py      # Ollama LLM 调用
│   │   │   ├── cache_service.py    # Redis 缓存
│   │   │   ├── stats_service.py    # 问答统计聚合
│   │   │   └── chunk_service.py    # 切片 CRUD
│   │   └── core/
│   │       ├── database.py         # 异步数据库引擎
│   │       ├── redis.py            # Redis 连接管理
│   │       ├── middleware.py        # 限流 + 请求日志
│   │       └── exceptions.py       # 全局异常处理器
│   └── tests/                      # pytest 测试套件
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 全局布局（Sidebar + Context）
│   │   ├── page.tsx                # 首页仪表盘
│   │   ├── chat/page.tsx           # 对话页
│   │   └── kb/
│   │       ├── page.tsx            # 知识库管理主页
│   │       ├── ops/page.tsx        # 运维管理面板
│   │       └── stats/page.tsx      # 问答复盘统计看板
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatMessageList.tsx  # 消息流 + 打字机效果
│   │   │   ├── ChatInputArea.tsx    # 输入框 + 快捷模板
│   │   │   ├── CitationDrawer.tsx   # 引用溯源抽屉（PDF联动）
│   │   │   ├── KnowledgeCard.tsx    # 知识卡片生成
│   │   │   └── WechatExport.tsx     # 公众号排版导出
│   │   ├── kb/
│   │   │   ├── KBDashboard.tsx      # 知识库概览卡片网格
│   │   │   ├── DocumentTable.tsx    # 文档列表 + 操作
│   │   │   ├── UploadZone.tsx       # 拖拽文件上传
│   │   │   ├── RetrievalSandbox.tsx # 检索测试分屏
│   │   │   ├── KBOpsPanel.tsx       # 运维管理面板
│   │   │   ├── KBStatsPanel.tsx     # 统计面板容器
│   │   │   ├── ChunkList.tsx        # 切片列表
│   │   │   ├── ChunkEditor.tsx      # 切片编辑器
│   │   │   ├── FrequentQuestions.tsx# 高频问题表格
│   │   │   ├── UnansweredList.tsx   # 无答案问题列表
│   │   │   └── OverviewCards.tsx    # 概览统计卡片
│   │   └── layout/
│   │       └── Sidebar.tsx          # 自适应导航侧边栏
│   ├── services/
│   │   ├── apiClient.ts            # API 调用封装
│   │   ├── ragService.ts           # RAG 服务层
│   │   ├── intentRouter.ts         # 意图路由配置
│   │   └── mockRagService.ts       # Mock 数据（开发用）
│   ├── context/
│   │   └── mindvaultsContext.tsx     # 全局状态管理
│   ├── types/
│   │   └── api.ts                  # TypeScript API 类型定义
│   └── utils/
│       └── wechatFormat.ts         # 公众号 inline-CSS 转换器
├── docker-compose.yml              # Docker Compose 编排
├── nginx.conf                      # Nginx 反向代理配置
├── Dockerfile.frontend             # 前端 Docker 构建
├── CLAUDE.md                       # 项目 AI Agent 指南
├── docs/planning/                  # 分阶段规划文档 (P0/P1/P2)
├── task_plan.md                    # 当前阶段任务规划
├── findings.md                     # 技术研究发现
└── progress.md                     # 进度日志
```

---

## ✨ 设计亮点

- **双模式灵活部署**：轻量模式（4 容器，~1.5GB，走云端 API）和全栈模式（6 容器，Ollama 本地推理），从树莓派到 GPU 服务器都能跑
- **你的数据，永远归你所有**：文档、向量、问答记录全部本地存储，零外网上传。即使断网，知识库依然完整可用
- **LLM / Embedding 可拔插架构**：Provider 独立配置，Ollama · DeepSeek · OpenAI · 通义千问 自由组合，API Key 一键切换，不锁定任何厂商
- **SSE 全链路透明**：意图识别 → 向量检索 → 片段匹配 → 答案生成，四阶段 progress 事件实时可见，RAG 不再是黑盒
- **韧性降级设计**：Redis 缓存不可用时自动回退 pgvector 直查；Ollama 不可用时自动切换云端 API，核心问答链路永不断线
- **引用溯源闭环**：每条答案精确标注原文片段 + 文档来源 + 相似度评分 + PDF 页码，点击即定位，知识可审计、可复核
