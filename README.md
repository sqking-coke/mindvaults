<p align="center">
  <img src="public/logo.svg" alt="mindvaults logo" width="96" />
</p>

<h1 align="center">mindvaults</h1>
<p align="center">开源、隐私至上的本地 RAG 知识库问答系统。你的数据，永远归你所有。</p>

<p align="center">
  <a href="#-部署"><img src="https://img.shields.io/badge/Docker-部署-2496ED?logo=docker&logoColor=white" /></a>
  <img src="https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi" />
  <img src="https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql" />
  <img src="https://img.shields.io/badge/pgvector-HNSW-4B8BBE" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis" />
  <img src="https://img.shields.io/badge/Ollama-ready-000000?logo=ollama" />
</p>

---

<p align="center">
  <img src="public/screenshots/chat.jpg" alt="mindvaults 对话界面" />
</p>

## 这是什么

mindvaults 是一款 **RAG（检索增强生成）知识库问答系统**，支持本地私有化和云端 API 双模式部署。上传文档 → 自动解析切片向量化 → 自然语言提问 → 大模型结合文档生成带引用溯源的答案。

```mermaid
flowchart LR
    A[📄 文档上传] --> P[🧹 文档预处理<br/>MD/PDF/TXT]
    V[📓 Obsidian Vault] --> P
    P --> B[🔪 语义切片]
    B --> C[🧬 向量化 Embedding]
    C --> D[(💾 pgvector)]

    E[❓ 用户提问] --> R[🧠 智能路由<br/>3 层降级]
    R --> F[🔍 语义检索<br/>HNSW + cosine]
    D --> F
    F --> G[🎯 Reranker 精排]
    G --> H[🤖 LLM 生成]
    K -->|术语注入| H
    H --> I[📎 答案 + 引用溯源]

    C -->|🏷️ 术语抽取| K[🕸️ 概念网络]
    H -->|💡 知识沉淀| J[🗃️ 审核入库]
    W[💬 外部对话<br/>Claude Code] -.->|Skill 推送| J
    J -->|回流| D

    D -->|💊 定期扫描| L[📊 健康报告<br/>5 维诊断]
    L -->|合并/清理| D
```
---

## 知识中心
<p align="center">
  <img src="public/screenshots/kb.jpg" alt="mindvaults 知识库管理" />
</p>

## 推理过程
<p align="center">
  <img src="public/screenshots/thinking.jpg" alt="mindvaults 智能推理过程" />
</p>

## 返回结果
<p align="center">
  <img src="public/screenshots/result.jpg" alt="mindvaults 命中结果" />
</p>

## 引用溯源
<p align="center">
  <img src="public/screenshots/citation.jpg" alt="mindvaults 引用溯源" />
</p>

## 运维管理
<p align="center">
  <img src="public/screenshots/ops.jpg" alt="mindvaults 运维管理" />
</p>

## 问答统计
<p align="center">
  <img src="public/screenshots/stats.jpg" alt="mindvaults 问答统计" />
</p>

## 数据治理
<p align="center">
  <img src="public/screenshots/gov.jpg" alt="mindvaults 数据治理" />
</p>

## 快速开始

```bash
# 1. 拉取代码
git clone https://github.com/sqking-coke/mindvaults.git && cd mindvaults

# 2. 创建配置文件（保留 .env 里已有的 API Key 预设）
cp .env.demo .env

# 3. 一键启动（5 个容器：Nginx + 前端 + 后端 + PostgreSQL + Redis）
docker compose --env-file .env up -d

# 4. 打开浏览器
# http://localhost → 进入系统设置 → 填入 API Key → 开始问答
```

| 部署模式 | 命令 | 说明 |
|------|------|------|
| 云端 API（推荐） | `docker compose --env-file .env up -d` | LLM / Embedding 走 DeepSeek、OpenAI 等 |
| 本地全栈 | `docker compose --profile full --env-file .env up -d` | 加 Ollama 容器，完全离线运行 |
| 演示体验 | `git checkout demo && docker compose --env-file .env.demo up -d` | 预置示例文档，禁止上传 |


## 核心特性

- **RAG 全链路透明**：意图识别 → 向量检索 → Reranker 精排 → LLM 生成，每一步通过 SSE progress 事件实时可见
- **引用溯源**：每个答案标注来源文档、原文片段和相似度评分，点击引用编号查看原文
- **双模式部署**：轻量模式（5 容器，走云端 API）或全栈模式（6 容器，Ollama 本地推理），从 Mac mini 到云服务器都能跑
- **多知识库隔离**：创建多个 KB，文档、切片、会话、配置独立管理，检索自动限定范围（或全局搜索）
- **多格式文档**：支持 PDF / Word / Markdown / TXT 上传，自动解析、切片、向量化
- **Obsidian Vault 导入**：笔记库一键导入，自动提取 YAML frontmatter 属性
- **可拔插模型架构**：LLM 和 Embedding 独立配置，DeepSeek / OpenAI / 硅基流动 / Ollama 自由组合

## 数据治理系统

mindvaults 不只是单向检索管道——**数据治理系统**让知识形成闭环：对话中产生的价值回流到知识库，内容质量被持续监控和优化，概念网络让孤立的知识片段变成可导航的图谱。

```mermaid
flowchart TB
    subgraph 输入["📥 知识输入"]
        A[📄 文档上传]
        B[📓 Obsidian Vault]
        C[💬 外部对话<br/>Claude Code]
    end

    subgraph 管道["⚙️ 摄入管道"]
        P[🧹 文档预处理<br/>MD Section 树<br/>PDF 跨页清洗<br/>TXT 噪声过滤]
        S[🔪 语义切片]
        E[🧬 向量化]
    end

    subgraph 检索["🔍 检索问答"]
        R[🧠 智能路由]
        Q[📎 RAG 问答<br/>引用溯源 + 概念注入]
    end

    subgraph 治理["🗃️ 数据治理"]
        K[🏷️ 概念网络<br/>自动抽取 / 手动创建<br/>查找关联切片]
        F[💡 知识沉淀<br/>QA 提炼 → 审核 → 入库]
        H[💊 健康中心<br/>5 维诊断 / 物理合并<br/>孤岛清理]
    end

    A --> P
    B --> P
    P --> S --> E --> D[(💾 pgvector)]

    C -.->|Skill 推送| F
    R --> Q
    D --> R
    D --> Q
    Q --> F
    Q --> K
    E --> K

    D -->|定期扫描| H
    H -->|合并/清理| D
    F -->|回流| D
```

### 🧠 智能路由 — 不用手动选知识库

用户提问时系统自动判断最匹配的知识库，**三层降级匹配**：质心向量匹配（日常 90% 命中）→ LLM 路由 → 用户引导。前端新建会话默认"自动"，thinking SSE 流实时展示路由决策过程。

### 💡 知识沉淀 — LLM 生成的价值不再用完即丢

- **内部 QA 沉淀**：定时批处理用 LLM 从对话中提炼独立知识点，去重后进入审核队列，用户确认后入库成为可检索的知识
- **外部对话回流**：通过 Skill 插件，Claude Code 等外部平台的对话自动推送到沉淀库，复用同一条提炼 + 审核管道
- **联合检索**：检索时同时命中上传文档和已沉淀知识点，回答标注来源类型（📄 文档 / 💡 知识沉淀），可追溯原始对话

### 🏷️ 概念网络 — 让知识库从文档堆变成知识图谱

- **自动抽取**：文档摄入时 LLM 提取专业术语并生成定义，仅对 ≥500 字的 chunk 抽取以控制成本
- **上下文注入**：RAG 检索时自动注入相关概念摘要（≤200 字），让 LLM 更准确理解你的领域术语
- **Hover 解释**：前端回答中术语自动下划线，hover 弹出概念卡片（定义 + 相关文档 + 关联概念）

### 💊 内容治理 — 知识库越用越干净

- **多维度诊断**：近重复检测（向量相似度）、低质量识别（短 chunk / 纯符号）、过时标记（版本号 / 时间衰减）、孤岛清理、碎片簇发现
- **健康报告**：定期全库扫描生成健康度评分，量化知识库质量，用户逐条决策（采纳推荐 / 合并 / 保留链接 / 跳过）
- **生命周期管理**：合并/清理直接物理删除重复/低质量切片，原文不受影响，重索引即可恢复

> 📖 详细设计：[文档预处理](docs/planning/20-文档预处理服务.md) · [智能路由](docs/planning/15-KB智能路由.md) · [知识沉淀](docs/planning/16-对话知识沉淀.md) · [Skill 集成](docs/planning/17-Skill集成-知识沉淀入口.md) · [概念关联](docs/planning/18-概念术语关联.md) · [内容再组织](docs/planning/19-知识库内容再组织.md)

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | Next.js 14 (App Router) + TypeScript + TailwindCSS |
| 后端 | FastAPI + Uvicorn + SQLAlchemy 2.0 |
| 数据库 | PostgreSQL 16 + pgvector (HNSW 索引) |
| 缓存 | Redis 7 |
| LLM | DeepSeek / OpenAI / 通义千问 / Ollama 本地 |
| Embedding | 硅基流动 / OpenAI / Ollama (BGE-large-zh-v1.5) |
| 部署 | Docker Compose + Nginx |

## 本地开发

依赖 Python 3.12 + Node.js 22 + PostgreSQL 16 + Redis。

```bash
# 后端
cd backend && cp ../.env . && source venv/bin/activate
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 前端
npx next dev
```

访问 `http://localhost:3000`，API 文档 `http://localhost:8000/docs`。

## 文档

- [API 接口契约](docs/planning/03-API接口契约.md)
- [数据库设计](docs/planning/05-数据库设计.md)
- [系统架构设计](docs/planning/02-系统架构设计.md)
- [部署运维](docs/DEPLOYMENT_GUIDE.md)
- [全部文档索引](docs/planning/README.md)
