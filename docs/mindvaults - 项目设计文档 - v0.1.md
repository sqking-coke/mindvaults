# mindvaults Agent - 项目设计文档

> **版本：v1.1** | 最后更新：2026-05-29 | 本文档为 mindvaults 初代产品基线文档，记录完整的产品方向、架构决策、交互设计与竞争策略。

## 1. 项目概述

### 1.1 项目背景

在企业办公、研发运维、业务运营、新人培训场景中，存在大量私有、专属、内部保密的知识数据，包含企业规章制度、业务手册、研发文档、运维手册、接口文档、常见问题FAQ、项目沉淀资料等。传统知识查询方式依赖人工翻阅文档、咨询老员工、检索本地文件，存在查询效率低、知识分散、沉淀困难、新人上手慢、人力成本高的痛点。

通用大模型存在**知识滞后、无法适配企业私有业务、数据隐私泄露**三大核心问题，无法回答企业内部专属问题，也不能加载本地私密文档，无法满足企业私有化、本地化、私密化的智能问答需求。同时传统RAG项目大多依赖第三方向量云服务、存在数据上传外网、部署复杂、私有化适配差的问题。

基于以上行业痛点，本项目实现**纯本地私有化知识库问答Agent**，全程数据本地化处理、不上传外网、不依赖第三方云服务，基于本地文档解析、文本切片、向量化存储、语义检索、大模型增强问答，构建企业私有专属智能问答知识库，实现内部知识智能问答、精准检索、智能答疑、知识沉淀闭环。

### 1.2 项目定位

面向企业私有化部署的**本地RAG私有知识库智能问答Agent实战项目**，属于AI落地刚需场景，专注解决企业内部私有知识无法智能问答、文档分散、知识无法沉淀、隐私数据不安全的问题，支持本地文档离线问答、私有知识精准召回、专属业务问题智能解答。

区别于通用AI问答项目，本项目核心是 **纯本地私有化部署 + RAG检索增强生成 + 私有知识精准问答 + 数据绝对安全可控**：

- 所有文档、向量数据、问答记录全部本地存储，零外网上传，保障企业数据隐私安全
- 通过RAG检索增强技术，让大模型学习企业私有文档，回答专属业务问题
- 实现知识统一沉淀、智能检索、精准答疑，替代人工查阅文档、咨询答疑

### 1.3 竞品差异化定位

当前 RAG 知识库赛道已有多个开源/商业产品，mindvaults 的核心差异化在于 **纯本地私有化 + 多 Agent 协同自学 + 内容运营闭环**：

| 维度 | 典型 RAG 产品（Dify / FastGPT / AnythingLLM） | mindvaults |
|------|------|------|
| **数据隐私** | 依赖外部 API / 云向量库，部分文档需上传第三方 | **纯本地闭环**，零外网上传，数据不出内网 |
| **知识更新** | 手动上传文档触发入库 | **主动订阅 + 自动学习**（P2-P3），定时抓取 → 清洗 → 入库 |
| **内容运营** | 无 | **知识卡片 + 日报 + 公众号适配**，知识可对外分享传播 |
| **多场景覆盖** | 单一企业问答 | **企业团队 + 个人技能成长双模式**，同一架构覆盖 B 端和 C 端 |
| **质量控制** | 无审核机制，脏数据直接入库 | **沙盒审核 + 相似度去重**，源头把控知识质量 |
| **引用溯源** | 基础引用文本展示 | **Hover Popover 悬浮预览 + 双屏联动 + PDF 页码高亮定位** |
| **部署复杂度** | 依赖云服务注册/付费 | **Docker Compose 一键部署**，本地 Ollama 开箱即用 |
| **用户信任** | 黑盒问答，无法验证推理过程 | **SSE 进度透传**，可视化展示意图识别→检索→匹配→生成全链路 |

### 1.4 核心目标

- 搭建纯本地私有化RAG知识库系统，支持多格式本地文档批量导入、解析、入库
- 实现私有知识语义检索、精准召回，解决关键词检索匹配度低、检索不准的问题
- 基于本地私有知识智能问答，让大模型精准回答企业内部业务、研发、运维问题
- 实现文档管理、切片管理、向量管理、问答记录、知识复盘全闭环能力
- 保证所有数据本地化、私有化、无外网泄露风险，适配企业内网部署场景
- 支持知识库动态更新、增量学习、无效知识清理，持续迭代企业私有知识体系

## 2. 需求分析

### 2.1 功能需求

#### 2.1.1 本地文档导入与解析

- 支持本地PDF、Word、TXT、Markdown等主流文档格式批量上传、导入知识库
- 自动解析文档内容、过滤空白内容、清洗无效格式、提取有效文本信息
- 支持单文件上传、批量文件夹导入、手动文本录入多种知识录入方式
- 支持文档新增、删除、更新、禁用，实现知识库动态维护

#### 2.1.2 文本切片与预处理

- 智能分段切片，根据语义边界、段落结构自动拆分文本，避免语义截断
- 支持自定义切片大小、重叠长度，适配不同文档类型与问答场景
- 文本清洗、去重、降噪处理，提升后续检索精准度与问答质量

#### 2.1.3 本地向量存储与检索

- 本地生成文本向量，无需上传原始文档至第三方平台
- 基于向量数据库实现语义相似度检索，区别于传统模糊匹配、关键词检索
- 支持Top-K相似度召回、相似度阈值过滤，精准匹配用户问题对应的私有知识
- 增量向量更新，文档修改后自动更新对应向量数据，保证知识时效性

#### 2.1.4 私有知识智能问答

- 用户输入自然语言问题，Agent自动检索本地私有知识库
- 结合检索结果+大模型能力，生成贴合企业私有业务的精准答案
- 支持引用原文出处、关联文档片段，保证答案可溯源、可验证
- 无匹配知识时智能提示，避免大模型幻觉、编造虚假业务信息
- 支持多轮上下文对话，保留会话记忆，实现连续答疑

#### 2.1.5 知识库管理与复盘

- 文档列表、切片数据、向量数据可视化管理
- 问答记录全留存，支持历史问答查询、溯源
- 统计高频问题、无答案问题，辅助补充完善企业知识库
- 支持知识库批量清理、无效知识剔除、知识迭代优化

### 2.2 非功能需求

- **数据安全性**：全程本地私有化处理，原始文档、向量数据、问答记录均不上传外网，杜绝隐私泄露
- **问答准确性**：依托语义检索+阈值过滤，大幅降低大模型幻觉，保证私有知识问答精准可靠
- **可用性**：检索异常、大模型调用超时具备兜底策略，优先返回相似知识片段
- **可扩展性**：支持新增文档格式、新增检索策略、适配本地轻量模型部署
- **高性能**：向量检索高效快速、缓存优化、切片异步处理，支持大批量文档入库

## 3. 整体架构设计

### 3.1 当前系统现状

> **我们在哪**：一个已有前端原型、后端待建的单体 RAG 系统起点。

**前端当前状态**

当前仓库中的 Next.js 14 前端为 **Mock 原型阶段**，Chat 问答页面（`src/app/chat`）和知识库管理页面（`src/app/kb`）已实现基本交互框架，但存在以下待优化项（详见 `REFACTOR_PLAN.md`）：

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | 代码瘦身 | 移除冗余状态管理、合并重复逻辑、精简内联样式 |
| P0 | 组件拆分 | ChatContainer 拆分为 ChatPanel / MessageList / InputArea / CitationDrawer |
| P0 | 路由骨架 | 增加首页路由 `/`、意图路由配置化 |
| P1 | 流式响应增强 | SSE 解析器 + 进度事件支持 + 打字机效果 |
| P2 | 意图路由配置化 | JSON 配置驱动，支持新增意图类型无需改代码 |

前端重构完成后再对接真实后端 API。

**后端当前状态**

- 后端代码为零：无 API 层、无数据库连接、无向量存储
- 无文档解析、切片、检索、问答等核心 RAG 能力
- 无用户认证、限流、日志等基础设施

**基础设施现状**

- 无 Docker Compose 编排文件
- 无 CI/CD 流水线
- 本地开发环境依赖手动配置

### 3.2 目标分层架构

> **我们去哪**：纯本地私有化 RAG 知识库问答系统完整蓝图。

采用**前后端分离 + 本地私有化RAG架构 + Agent智能问答闭环**。前端基于 Next.js 14 构建交互界面，后端基于 FastAPI 提供 REST API，遵循「文档接入→解析切片→向量生成→本地存储→语义检索→增强问答→结果返回」的标准RAG执行链路。全程无外网数据交互、无第三方云依赖，所有数据处理、向量计算、知识匹配、问答生成均在本地完成。

```
┌──────────────────────────────────────────────────────────────────┐
│                    前端层 (Next.js 14 App Router)                  │
│  Chat 问答界面 │ KB 知识库管理 │ 引用溯源面板 │ Mermaid 图表渲染     │
│  Hover Popover 悬浮预览 │ 知识卡片生成 │ 移动端响应式布局             │
└────────────────────────────┬─────────────────────────────────────┘
                             │ REST API (JSON) + SSE (流式)
┌────────────────────────────▼─────────────────────────────────────┐
│                  API 网关层 (FastAPI)                              │
│  请求校验 │ 路由分发 │ API Key 鉴权 │ 限流控制 │ CORS               │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                RAG Agent 核心层                                    │
│  文档接收 │ 内容解析 │ 智能切片 │ Prompt组装                        │
│  向量生成 │ 语义检索 │ 大模型问答 │ 结果整理                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                核心能力引擎层                                       │
│  文档解析引擎 │ 文本切片引擎 │ 向量生成与检索引擎                      │
│  Prompt增强引擎 │ 知识库运维引擎 │ SSE进度事件引擎                    │
└────────────────────────────┬─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                 数据持久层                                         │
│  PostgreSQL + pgvector (HNSW索引) │ Redis 缓存 │ 本地文件存储         │
│  文档信息 │ 切片数据 │ 向量数据 │ 会话数据 │ 问答记录                   │
└──────────────────────────────────────────────────────────────────┘
```

#### 核心业务流程（RAG标准闭环）

**知识库构建流程**

1. **文档导入**：用户通过前端上传本地私有文档或手动录入知识文本
2. **文档解析清洗**：后端自动解析文档内容，过滤无效格式、空白内容、冗余信息
3. **智能切片**：基于语义边界拆分文本，生成标准化知识片段
4. **向量生成**：本地 Embedding 模型对切片文本生成语义向量
5. **本地化存储**：文档信息、切片内容写入 PostgreSQL，向量数据写入 pgvector（HNSW 索引），完成知识库构建

**智能问答流程**

1. **问题接入**：用户在前端 Chat 界面输入自然语言私有业务问题，携带 session_id 关联会话
2. **意图识别**：后端识别用户查询意图类型（知识问答/文档检索/闲聊），通过 SSE progress 事件推送识别结果
3. **问题向量化**：后端将用户问题转为语义向量
4. **语义检索召回**：在 pgvector 中通过 HNSW 索引匹配相似度最高的知识片段
5. **阈值过滤降噪**：过滤低相似度无效内容，保证知识精准度
6. **Prompt上下文组装**：将用户问题+本地私有知识片段+对话历史拼接为结构化Prompt
7. **大模型增强问答**：大模型基于私有知识精准作答，SSE 流式返回
8. **结果返回与记录**：返回问答结果+原文溯源（含 chunk_id、doc_name、content、similarity），前端渲染引用角标，支持 Hover Popover 悬浮预览，同时持久化问答记录

#### 前后端分离与接口契约

项目采用前后端分离架构：

- **前端**：Next.js 14 (App Router)，包含 Chat 问答页面（`src/app/chat`）和知识库管理页面（`src/app/kb`），包含引用溯源面板、意图路由、流式响应等交互设计
- **后端**：FastAPI，提供 RESTful API，负责文档处理、向量检索、大模型调用等核心能力
- **通信协议**：HTTP REST API + SSE 流式推送，JSON格式；后期可扩展 gRPC 用于内部服务间通信
- **接口契约**：前端已有的交互设计（意图路由、引用溯源、流式响应）反向约束后端 API 设计，保证前后端无缝对接

### 3.3 演进路线

> **怎么去**：从当前 Mock 原型到完整产品的关键跨越。

| 阶段 | 从（当前） | 到（目标） | 交付周期 |
|------|-----------|-----------|---------|
| P0 | Mock 前端原型 + 零后端 | 生产级 Next.js 前端 + FastAPI + PostgreSQL + pgvector | MVP |
| P0 | 无 RAG 能力 | 文件上传 → 解析切片 → 向量入库 → 单轮问答完整闭环 | MVP |
| P1 | 单轮问答 | 多轮对话 + 检索沙盒 + 产品化 UI/UX | 增强 |
| P1 | 基础交互 | SSE progress 状态透传 + 知识卡片 + 移动端适配 | 增强 |
| P2 | 基础功能 | 知识库运维管理 + 高级溯源 + 增量更新 | 完善 |
| P3 | 单体 FastAPI | Java 业务层 + Python AI 层拆分 + 多租户 + 权限 | 企业级 |

详细的分阶段交付范围见第 4 章「MVP 分阶段交付计划」。

## 4. MVP 分阶段交付计划

> **⚠️ MVP 范围收紧提醒：** 当前文档涉及的功能模块已超过 20 个，P0 已包含引用溯源、Mermaid 渲染、Hover Popover、A11y 等交互增强特性。**P0 的唯一目标是跑通「上传 → 切分 → 问答」最小闭环**。交互体验优化（知识卡片、移动端适配、SSE progress）、自学能力（订阅源、沙盒审核）、企业级安全（限流、日志轮转）均应留在 P1 及以后。每个迭代周期严格按下方范围交付，避免功能蔓延导致 MVP 迟迟无法上线。

### P0（MVP — RAG 最小闭环）

**目标**：跑通「文档上传 → 解析切片 → 向量入库 → 单轮问答」完整链路。

| 模块 | 范围 |
|------|------|
| 文档导入 | 单文件上传（TXT/MD/PDF），文本解析与清洗 |
| 文本切片 | 固定长度切片 + 语义切片双模式 |
| 向量存储 | pgvector HNSW 索引，BGE-large-zh-v1.5 Embedding |
| 智能问答 | 单轮问答 + SSE 流式响应 + ref_chunks 引用溯源 |
| 数据库 | kb_document、kb_chunk、kb_session、kb_qa_record、kb_config |
| API | 文档管理 CRUD、`POST /api/v1/kb/chat`、`GET /api/v1/kb/chunks/{id}/preview` |
| 前端 | Chat 问答页面 + KB 管理页面 + 引用溯源面板 + Mermaid 渲染 + Hover Popover + A11y |
| 部署 | Docker Compose + nginx 反向代理 + Ollama 模型自动拉取 |

### P1（增强 — 可用产品）

**目标**：多格式支持 + 多轮对话 + 检索沙盒 + 产品化交互。

| 模块 | 范围 |
|------|------|
| 文档导入 | Word 支持 + 批量文件上传 |
| 智能问答 | 多轮对话（session_id）+ SSE progress 事件 + 意图状态透传 |
| 检索测试 | `POST /api/v1/kb/retrieval/test` 检索沙盒 |
| 前端 | 知识卡片生成 + 移动端响应式适配 |
| 安全 | API Key 鉴权 + 限流 |
| 运维 | loguru 日志轮转 + 环境变量完整配置 |

### P2（完善 — 完整功能）

**目标**：知识库运维管理 + 高频问题统计 + 增量更新 + 高级溯源。

| 模块 | 范围 |
|------|------|
| 知识库运维 | 文档禁用/删除 + 切片手动优化 + 增量向量更新 |
| 问答复盘 | 高频问题统计 + 无答案问题汇总 |
| 文档解析 | PDF 页码元信息保留 |
| 前端 | 双屏联动 PDF 高亮定位 + 微信公众号排版适配 |
| 缓存 | Redis 高频检索缓存 |

### P3（企业级扩展）

| 模块 | 范围 |
|------|------|
| 架构 | Java 业务层拆分 + REST/gRPC 解耦 |
| 权限 | JWT + RBAC 多用户权限管理 |
| 向量库 | Milvus / Qdrant 替代 pgvector，支撑千万级知识库 |
| 多租户 | 多团队知识库隔离 |

## 5. 技术栈选型与决策

### 5.1 最终技术决策

经过团队多轮讨论（详见 issue [COKE-9](mention://issue/6dbb8181-1f5b-4502-a3c4-5c37c3993e1b) 讨论线程），技术栈决策如下：

**主技术栈：FastAPI 全栈（Python）**

决策理由：
- Python 生态在文档解析、向量生成、语义检索、大模型调用等 AI 推理链路上一等公民地位不可替代
- FastAPI 异步性能优秀，SSE 流式响应天然支持，自动生成 OpenAPI 文档
- MVP 阶段为单用户本地部署，无需 Java 企业级特性（RBAC、工作流引擎、审计日志）
- 单一语言栈降低开发部署复杂度，加速 P0 闭环

**Java 业务层拆分：延后至 P3**

Java 的价值在于多用户场景下的强类型约束、事务管理、工作流引擎、RBAC 权限模型。这些需求在 MVP 阶段不存在。当前 FastAPI 代码通过模块间清晰的接口抽象预留拆分边界，P3 触发时（多团队、多租户、复杂业务流程），工作量可控。

> **原则：不在 MVP 阶段引入第二个语言栈。先跑通闭环，再谈拆分。**

### 5.2 当前技术栈

| 层面 | 技术选型 | 说明 |
|------|---------|------|
| **前端框架** | Next.js 14 (App Router) + TypeScript | 已实现 Chat/KB 页面，支持流式响应、Mermaid 渲染 |
| **前端样式** | Tailwind CSS | 已配置 |
| **前端图表** | Mermaid.js | Markdown 代码块实时渲染流程图、时序图 |
| **后端框架** | FastAPI + uvicorn | Python 异步框架，性能优秀，自动生成 OpenAPI 文档 |
| **ORM / 数据访问** | SQLAlchemy 2.0 + asyncpg | 异步数据库驱动，支持 pgvector |
| **数据库迁移** | Alembic | Schema 版本管理与迁移 |
| **数据校验** | Pydantic v2 | FastAPI 原生集成，类型安全 |
| **数据库** | PostgreSQL 16 + pgvector | 业务数据 + 向量存储统一管理，HNSW 索引 |
| **缓存** | Redis | 高频检索结果缓存、会话状态 |
| **文档解析** | python-docx, PyPDF2, markdown | 多格式文档内容提取 |
| **文本切片** | langchain-text-splitters 或自研 | 语义切片 + 固定切片双模式 |
| **Embedding 模型** | BGE-large-zh-v1.5（向量维度 1024） | 本地部署，中文语义向量化 |
| **向量检索** | pgvector HNSW 索引 | PostgreSQL 原生向量扩展，高性能近似搜索 |
| **大模型接入** | httpx + OpenAI 兼容 API | 支持 OpenAI / Ollama / vLLM 等兼容接口 |
| **异步任务** | asyncio + Celery / arq | 文档解析、切片、向量生成异步处理 |
| **日志** | loguru | 结构化日志，支持轮转和保留策略 |
| **部署** | Docker Compose + nginx/Caddy | 前端 + 后端 + PostgreSQL + Redis + Ollama 一键部署 |

### 5.3 后期扩展：Java 业务层 + Python AI 推理层

当前阶段后端全部使用 Python FastAPI 实现。随着业务复杂度增长，后期可引入 Java 作为业务层，与 Python AI 推理层解耦协作：

```
┌──────────────────────────────────────────┐
│              前端 (Next.js)               │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│          Java 业务层 (SpringBoot)          │
│   用户管理 │ 权限控制 │ 工作流引擎            │
│   业务规则校验 │ 审计日志 │ 数据报表          │
└──────────────────┬───────────────────────┘
                   │ REST / gRPC
┌──────────────────▼───────────────────────┐
│        Python AI 推理层 (FastAPI)         │
│   文档解析 │ 文本切片 │ 向量生成             │
│   语义检索 │ Prompt组装 │ 大模型调用         │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│          PostgreSQL + pgvector            │
└──────────────────────────────────────────┘
```

**为什么这样分工：**

- **Java 团队维护核心业务逻辑**：类型安全、规范性强、企业级生态成熟（工作流、权限、事务管理），适合管理用户、组织、权限、业务规则等需要严格类型约束的模块
- **Python 只负责 AI 相关模块**：体积小、接口清晰，专注于文档解析、向量化、语义检索、大模型调用等 AI 推理链路，这些是 Python 生态最成熟的领域
- **两者通过 REST/gRPC 解耦**：Java 业务层调用 Python AI 推理层的标准化 API，各自独立部署、独立扩缩容。Python AI 层可单独扩容应对高并发检索和推理请求，Java 业务层单独扩容应对用户增长

**过渡策略**：当前阶段全部由 FastAPI 承担，但在模块边界上预留清晰的接口抽象，确保后期拆分时不影响前端和数据库。

## 6. 核心模块详细设计

### 6.1 多格式文档解析模块

负责本地各类私有文档的读取与内容提取，是知识库数据源入口：

- 适配TXT、MD、PDF、Word等主流办公与技术文档格式
- 基于 python-docx、PyPDF2、python-pptx、markdown 等库实现解析
- PDF 解析时保留页码元信息，为后续双屏联动高亮定位提供数据基础（P2）
- 自动过滤页眉页脚、空段落、特殊符号、无效格式字符
- 保留原文层级结构、段落逻辑，保证切片语义完整性
- 支持批量导入与异步处理，通过 asyncio 并发加速

### 6.2 智能文本切片模块

解决固定切片导致语义断裂、问答不准的核心问题：

- 支持固定长度切片+语义智能切片双模式，适配不同文档场景
- 可配置切片重叠长度，解决段落边界知识丢失问题
- 自动合并零散短句、过滤无效碎片，保证切片内容有效可用
- 基于 langchain-text-splitters 或自研实现，支持自定义切片策略

### 6.3 本地向量生成与检索模块（核心）

本项目核心差异化模块，实现**纯本地向量处理**：

- 使用本地 Embedding 模型（BGE-large-zh-v1.5，向量维度 1024）生成文本向量
- 基于 pgvector 实现向量存储，创建 HNSW 索引加速语义相似度检索
- 支持 Top-K 召回、相似度阈值筛选、结果去重排序
- 增量向量更新机制，文档更新后自动同步对应向量数据
- 高频检索结果缓存（Redis），提升问答响应速度
- 在 `kb_config` 表中预留 `embedding_dim` 配置项，换用其他维度模型时无需改表结构

### 6.4 智能问答生成模块

基于检索到的私有知识，结合大模型能力生成精准问答结果：

- 结构化 Prompt 约束大模型，强制基于本地知识库内容作答
- 无匹配知识时智能告知，不编造虚假业务信息
- 答案附带原文片段与文档来源（ref_chunks），支持溯源校验
- 支持多轮上下文问答，基于 session_id 保留对话记忆，实现连续答疑
- 兼容 OpenAI 兼容 API 和本地模型（Ollama / vLLM）
- SSE 流式响应扩展：除最终答案 token 外，推送 progress 事件（意图识别→检索→匹配→生成），前端展示精细化的思考状态指示条

### 6.5 知识库运维管理模块

实现企业知识库全生命周期管理：

- 文档管理：新增、查看、启用、禁用、删除、更新知识库文档
- 切片管理：查看、导出、手动优化知识切片内容
- 问答管理：历史问答记录查询、高频问题统计、无效问题汇总
- 知识迭代：基于用户问答盲区，辅助补充完善企业私有知识库

### 6.6 异常容错与兜底模块

保障系统稳定运行：

- 文档解析异常兜底，跳过损坏文件，不影响批量导入任务
- 向量检索超时/异常兜底，降级返回关键词匹配结果
- 大模型调用失败兜底，直接返回相似知识片段供用户参考
- 全流程日志记录（loguru），精准定位导入、问答异常

## 7. 数据库设计

使用 PostgreSQL 16 + pgvector 扩展，业务表与向量存储统一管理。数据库迁移使用 **Alembic** 进行版本管理。

### 7.1 知识库文档主表（kb_document）

|字段|类型|说明|
|---|---|---|
|id|bigserial|主键ID|
|doc_name|varchar(255)|文档名称|
|doc_type|varchar(50)|文档类型（txt/pdf/md/docx）|
|doc_desc|text|文档描述|
|file_path|varchar(500)|本地文件存储路径|
|status|smallint|0禁用 1启用，默认1|
|created_at|timestamptz|创建时间|
|updated_at|timestamptz|更新时间|

索引：`status` 字段建立 B-tree 索引，加速按状态过滤查询。

### 7.2 知识切片数据表（kb_chunk）

|字段|类型|说明|
|---|---|---|
|id|bigserial|主键|
|doc_id|bigint|关联文档ID，外键|
|chunk_content|text|知识切片内容|
|chunk_index|int|切片序号|
|embedding|vector(1024)|向量字段（pgvector），1024 对应 BGE-large-zh-v1.5 维度|
|status|smallint|0失效 1有效，默认1|
|created_at|timestamptz|创建时间|

索引策略：
- `doc_id` 建立 B-tree 索引，加速按文档查询切片
- `embedding` 建立 **HNSW 索引**（`m=16, ef_construction=200`），实现高性能向量相似度检索
- 如使用 IVFFlat 索引，需在建表后通过 `SELECT set_config('ivfflat.probes', '10', false)` 调优

### 7.3 会话表（kb_session）

|字段|类型|说明|
|---|---|---|
|id|bigserial|主键|
|session_id|varchar(64)|会话唯一标识（UUID），唯一索引|
|title|varchar(255)|会话标题（自动生成或用户编辑）|
|created_at|timestamptz|创建时间|
|updated_at|timestamptz|最后活跃时间|

### 7.4 问答记录表（kb_qa_record）

|字段|类型|说明|
|---|---|---|
|id|bigserial|主键|
|session_id|varchar(64)|会话ID，关联 kb_session，索引|
|question|text|用户问题|
|answer|text|AI回答结果|
|ref_chunks|jsonb|参考知识片段，结构见下方示例|
|model_name|varchar(100)|使用的大模型名称|
|created_at|timestamptz|问答时间|

索引：`session_id` 建立 B-tree 索引，加速按会话查询历史记录。

`ref_chunks` JSONB 结构示例：

```json
[
  {
    "chunk_id": 42,
    "doc_name": "系统架构设计手册.md",
    "content": "微服务间通过 gRPC 进行同步通信，通过 Kafka 进行异步事件发布...",
    "similarity": 0.92
  },
  {
    "chunk_id": 107,
    "doc_name": "运维手册.md",
    "content": "服务部署采用 Docker Compose 编排，每个服务独立容器...",
    "similarity": 0.85
  }
]
```

### 7.5 知识库配置表（kb_config）

|字段|类型|说明|
|---|---|---|
|id|bigserial|主键|
|config_key|varchar(100)|配置键，唯一索引|
|config_value|text|配置值|
|config_desc|varchar(255)|配置描述|
|updated_at|timestamptz|更新时间|

预置配置项：

| config_key | 示例值 | 说明 |
|---|---|---|
| embedding_dim | 1024 | Embedding 向量维度，换用其他模型时修改此值 |
| chunk_size | 512 | 默认切片大小 |
| chunk_overlap | 64 | 默认切片重叠长度 |
| top_k | 5 | 检索召回数量 |
| similarity_threshold | 0.7 | 相似度过滤阈值 |

### 7.6 数据库迁移

使用 Alembic 管理数据库 schema 版本：

```
alembic init alembic
alembic revision --autogenerate -m "init schema"
alembic upgrade head
```

## 8. 核心接口设计

所有接口以 `/api/v1` 为前缀，遵循 RESTful 规范。

### 8.1 知识库文档管理

|方法|路径|说明|
|---|---|---|
|POST|/api/v1/kb/documents|上传导入知识库文档（multipart/form-data）|
|GET|/api/v1/kb/documents|获取文档列表（分页）|
|GET|/api/v1/kb/documents/{id}|获取单个文档详情|
|DELETE|/api/v1/kb/documents/{id}|删除/禁用知识库文档|
|PUT|/api/v1/kb/documents/{id}|更新文档信息|

**POST /api/v1/kb/documents 约束：**

- 最大文件大小：50MB（可通过环境变量 `MAX_UPLOAD_SIZE_MB` 配置）
- 允许的 MIME 类型：`text/plain`、`text/markdown`、`text/x-markdown`、`application/pdf`、`application/vnd.openxmlformats-officedocument.wordprocessingml.document`、`application/msword`
- 支持单次上传多个文件（`files` 字段为数组）

**Request 示例：**

```http
POST /api/v1/kb/documents
Content-Type: multipart/form-data

files: [architecture.md, api-guide.pdf]
```

**Response 示例：**

```json
{
  "code": 0,
  "data": {
    "documents": [
      {"id": 1, "doc_name": "architecture.md", "status": 1, "chunk_count": 15},
      {"id": 2, "doc_name": "api-guide.pdf", "status": 1, "chunk_count": 23}
    ],
    "total": 2
  }
}
```

### 8.2 智能问答

|方法|路径|说明|
|---|---|---|
|POST|/api/v1/kb/chat|私有知识智能问答（SSE 流式响应 + progress 事件）|
|GET|/api/v1/kb/chat/history|获取历史问答记录（按会话）|
|GET|/api/v1/kb/chat/sessions|获取会话列表|

**POST /api/v1/kb/chat Request：**

```json
{
  "question": "微服务之间如何通信？",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**POST /api/v1/kb/chat SSE 流式 Response：**

```
event: progress
data: {"phase": "intent", "message": "正在识别查询意图...", "intent": "系统架构提问"}

event: progress
data: {"phase": "retrieval", "message": "检索本地知识库 [系统架构设计手册.md]", "elapsed_ms": 1200}

event: progress
data: {"phase": "matching", "message": "语义向量匹配", "similarity": 0.92}

event: progress
data: {"phase": "generating", "message": "正在整理最佳方案..."}

event: token
data: {"content": "微服务"}

event: token
data: {"content": "之间"}

event: token
data: {"content": "通过"}

...

event: done
data: {"ref_chunks": [{"chunk_id": 42, "doc_name": "系统架构设计手册.md", "content": "微服务间通过 gRPC...", "similarity": 0.92}]}
```

前端监听 `progress` 事件渲染思考状态指示条，监听 `token` 事件渲染打字机效果，监听 `done` 事件完成渲染并展示引用溯源。

### 8.3 检索测试

|方法|路径|说明|
|---|---|---|
|POST|/api/v1/kb/retrieval/test|检索测试：输入query，返回Top-K匹配片段及相似度|
|GET|/api/v1/kb/chunks/{id}/preview|切片预览：返回切片前200字+相似度+文档名（P0）|
|POST|/api/v1/kb/chunks/{id}/locate|文档定位：返回页码+文本偏移量+高亮锚点（P2）|

**GET /api/v1/kb/chunks/{id}/preview Response：**

```json
{
  "code": 0,
  "data": {
    "chunk_id": 42,
    "doc_name": "系统架构设计手册.md",
    "preview": "微服务间通过 gRPC 进行同步通信，通过 Kafka 进行异步事件发布。每个服务拥有独立的数据库...",
    "similarity": 0.92
  }
}
```

### 8.4 知识库配置

|方法|路径|说明|
|---|---|---|
|GET|/api/v1/kb/config|获取知识库全局配置|
|PUT|/api/v1/kb/config|更新知识库全局配置|

### 8.5 健康检查

|方法|路径|说明|
|---|---|---|
|GET|/api/v1/health|服务健康检查|

## 9. 前端交互与体验设计

### 9.1 多模态内容渲染（P0）

- **Mermaid 图表渲染**：前端 Markdown 渲染层集成 `Mermaid.js`，大模型输出系统设计、运维工作流时，Chat 聊天流中直接渲染流程图、时序图，支持点击放大和高清导出
- **图片/表格切片预览**：当知识片段包含表格或图片时，前端展示"图片预览卡片"和自适应原生表格，而非纯文本 OCR 字符

### 9.2 引用溯源交互（P0-P2）

- **P0 — Hover Popover 悬浮预览**：鼠标悬停引用角标 `[1]` 时，弹出 Popover 浮层展示切片前 100 字内容、相似度评分和"一键复制原文"按钮。数据源来自 `GET /api/v1/kb/chunks/{id}/preview`
- **P0 — CitationDrawer**：点击引用角标，打开右侧 Drawer 展示完整引用切片内容，已实现基础版本
- **P2 — 双屏联动 PDF 高亮**：引用来源于 PDF 时，Drawer 内嵌 PDF 预览，自动定位到对应页码，引用文本高亮标注。依赖后端 PDF 解析时保留页码元信息

### 9.3 意图处理状态透传（P1）

替代传统 Loading 菊花图，设计科技感状态指示条，通过 SSE `progress` 事件实时展示底层处理链路：

- `🔍 正在识别用户查询意图... [系统架构提问]`
- `📚 检索本地知识库 [系统架构设计手册.md] [1.2s]`
- `🧠 正在匹配语义向量 (Similarity: 92%)`
- `✍️ 正在通过本地 Qwen 整理最佳方案...`

将 RAG 底层链路透明、友好地透传给用户，降低等待焦虑。

### 9.4 知识卡片生成与分享（P1）

- **一键生成分享卡片**：Chat 优质回答旁增加"生成分享卡片"按钮，前端利用 `html2canvas` 渲染精美知识卡片
- 支持切换 3~4 种皮肤（高雅极简、暗黑科技、企业蓝渐变、护眼羊皮纸）
- 包含标题、结构化解答、溯源文件名称、防伪水印
- 便于在企业微信、飞书、钉钉中一键转发

### 9.5 移动端响应式与无障碍（P0-P1）

- **P1 — 移动端适配**：侧边栏在 768px 以下自动转为底部 Tab 栏或汉堡菜单；输入框固定触底，键盘弹出不遮挡消息流（iOS Safe Area inset 适配）
- **P0 — A11y 聚焦环**：所有交互元素定义 `focus-visible:ring-2 focus-visible:ring-indigo-500`，保证键盘 Tab 键全功能无障碍使用

## 10. 安全与运维

### 10.1 API 鉴权

- 本地部署阶段提供简单的 **API Key 鉴权**机制，前端请求携带 `Authorization: Bearer <API_KEY>` 头
- API Key 通过环境变量 `API_KEY` 配置，为后期多用户权限扩展预留接口抽象
- 后期扩展为 JWT Token + RBAC 权限模型

### 10.2 限流策略

- 大模型问答接口 `POST /api/v1/kb/chat`：单 IP 每分钟 30 次（可配置）
- 文件上传接口 `POST /api/v1/kb/documents`：单 IP 每分钟 10 次
- 使用 slowapi 或自研中间件实现，环境变量 `RATE_LIMIT_ENABLED=true` 控制开关

### 10.3 环境变量清单

| 变量 | 说明 | 示例值 |
|------|------|--------|
| DATABASE_URL | PostgreSQL 连接串 | `postgresql+asyncpg://user:pass@db:5432/mindvaults` |
| REDIS_URL | Redis 连接串 | `redis://redis:6379` |
| API_KEY | API 鉴权密钥 | `sk-mindvaults-xxx` |
| EMBEDDING_MODEL | Embedding 模型名 | `BAAI/bge-large-zh-v1.5` |
| EMBEDDING_DIM | 向量维度 | `1024` |
| LLM_BASE_URL | 大模型 API 地址 | `http://ollama:11434/v1` |
| LLM_MODEL | 大模型名称 | `qwen3` |
| MAX_UPLOAD_SIZE_MB | 文件上传大小限制(MB) | `50` |
| RATE_LIMIT_ENABLED | 是否启用限流 | `true` |
| LOG_LEVEL | 日志级别 | `INFO` |
| LOG_RETENTION | 日志保留天数 | `30` |

### 10.4 日志与监控

- **日志框架**：loguru，输出到文件和控制台
- **轮转策略**：每天午夜轮转，保留 30 天
- **关键监控指标**：
  - 问答请求 QPS 和 P99 延迟
  - 向量检索平均耗时
  - 大模型调用成功率
  - 文档解析失败率
  - 向量索引大小和增长速度

## 11. 部署架构

### 11.1 Docker Compose 编排

```yaml
# docker-compose.yml
services:
  frontend:
    build:
      context: ..
      dockerfile: ../Dockerfile.frontend
    ports: [ "3000:3000" ]
    depends_on: [ backend ]

  backend:
    build:
      context: ../backend
      dockerfile: ../backend/Dockerfile
    ports: [ "8000:8000" ]
    environment:
      - DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/mindvaults
      - REDIS_URL=redis://redis:6379
      - API_KEY=${API_KEY:-sk-mindvaults-dev}
      - EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5
      - EMBEDDING_DIM=1024
      - LLM_BASE_URL=http://ollama:11434/v1
      - LLM_MODEL=qwen3
      - MAX_UPLOAD_SIZE_MB=50
    volumes:
      - uploads_data:/app/uploads
    depends_on: [ db, redis, ollama ]

  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: mindvaults
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  ollama:
    image: ollama/ollama
    volumes:
      - ollama_data:/root/.ollama
    # 启动后拉取模型
    entrypoint: [ "/bin/sh", "-c" ]
    command:
      - |
        ollama serve &
        sleep 5
        ollama pull qwen3
        ollama pull nomic-embed-text
        wait

  nginx:
    image: nginx:alpine
    ports: [ "80:80" ]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on: [ frontend, backend ]

volumes:
  pgdata:
  ollama_data:
  uploads_data:
```

### 11.2 nginx 反向代理配置

```nginx
# nginx.conf
events { worker_connections 1024; }

http {
    server {
        listen 80;

        # 前端
        location / {
            proxy_pass http://frontend:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }

        # 后端 API（含 SSE 流式端点，需关闭缓冲）
        location /api/ {
            proxy_pass http://backend:8000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_buffering off;              # SSE 流式响应必须关闭缓冲
            proxy_cache off;
            proxy_set_header X-Accel-Buffering no;
            proxy_set_header Connection '';
            proxy_read_timeout 300s;
        }
    }
}
```

### 11.3 前端 Dockerfile（Dockerfile.frontend）

```dockerfile
# Dockerfile.frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "start"]
```

### 11.4 部署流程

1. 复制 `.env.example` 为 `.env`，配置 API_KEY、数据库密码等环境变量
2. 启动 Docker Compose：`docker compose up -d`
3. Ollama 容器启动后自动拉取 `qwen3` 和 `nomic-embed-text` 模型（首次启动需等待模型下载）
4. 后端自动执行 Alembic migration 初始化数据库表和 pgvector 扩展
5. 通过 `http://localhost` 访问应用
6. 上传本地私有文档，系统自动完成解析、切片、向量入库
7. 通过 Chat 界面输入私有业务问题，验证全流程

## 12. "自我进化"型行业智能数据团设计 (Active/Agentic RAG)

随着股票分析、行业研报、竞品监控等高时效性领域对知识时效性的极高要求，静态知识库（Passive RAG）已无法完全满足决策层。本项目引入**主动式、自我进化型 RAG（Active/Agentic RAG）**机制，赋予私有知识库"自学、自吞吐、自迭代"的能力，构建本地可靠的行业智能数据团。

### 12.1 整体架构与多 Agent 协同

实现自我进化的闭环需要多 Agent 强强联手、协同分工：

1. **调度 Agent (Scheduler)**：负责管理定时流程与主动轮询。例如：每日 16:00（收盘后）触发 A 股行情与公告爬取，每小时爬取特定财经网站的新闻或行业快讯。
2. **Claude Code（后端与复杂推理）**：负责底层数据采集（对接金融数据 APIs 或 Web Scraper 爬虫）、文本清洗、长文本智能切片（结合研报及公告的专业格式）、去重降噪以及本地 pgvector 向量数据库的增量写入与索引维护。
3. **Gemini（前端设计与内容运营）**：负责将底层的复杂数据流与自学进度进行优雅的可视化展现，并将其智能提炼为高价值的业务内容、直观的可视化图表与高颜值的图文知识卡片。

### 12.2 知识吞吐流水线 (Ingestion Pipeline)

整个自学数据流转包含以下五个核心阶段，全程提供可视化进度回传：

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  采集 (Fetch) │ ──> │  清洗 (Clean) │ ──> │  切片 (Chunk) │ ──> │  过滤 (Filter)│ ──> │ 向量入库(Embed)│
│  API/Scraper │     │  去噪、去重  │     │ 语义智能拆分 │     │ 沙盒或阈值审阅│     │ pgvector存储 │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

1. **自动采集**：通过 API 或爬虫，自动、低频、合规地抓取订阅源数据。
2. **文本清洗**：剔除 HTML 标签、广告推广和无意义的免责声明，保证知识纯净度。
3. **智能切片**：根据行业公告和研报的特定排版格式（如财务报表、分析师观点），进行格式敏感的智能切片。
4. **审核与去重**：判断内容相似度，去重并过滤。脏数据和敏感数据进入"知识审核沙盒"，由分析师决定是否入库。
5. **向量化入库**：调用 Embedding 模型生成向量，写入 PostgreSQL 数据库，更新 HNSW 索引。

### 12.3 数据库模型扩展

为了支持自学功能，我们需要扩展两张核心表：订阅源管理表与审核沙盒切片表。

#### 12.3.1 知识吞吐订阅源表 (kb_ingestion_source)

记录自学的数据源、爬取规则、定时任务状态和历史吞吐量：

| 字段名 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | 订阅源唯一标识 |
| source_name | VARCHAR(100) | NOT NULL | 数据源名称（如"巨潮资讯-公司公告"） |
| source_url | VARCHAR(255) | NOT NULL | 订阅源地址或接口 API |
| source_type | VARCHAR(50) | NOT NULL | 类型（api, scraper, rss, link） |
| cron_expression| VARCHAR(100)| NOT NULL | 定时任务表达式（如 `0 30 16 * * *`） |
| is_active | BOOLEAN | DEFAULT TRUE | 是否激活当前订阅源 |
| total_ingested | INTEGER | DEFAULT 0 | 累计吸纳的文档/知识点数量 |
| last_run_at | TIMESTAMP | NULL | 上次自动爬取时间 |
| status | VARCHAR(50) | DEFAULT 'idle' | 状态（idle, fetching, indexing, error） |

#### 12.3.2 审核沙盒切片表 (kb_sandbox_chunk)

存储已被采集并切片、但未获准入库的暂存切片，供分析师审核：

| 字段名 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | SERIAL | PRIMARY KEY | 临时切片 ID |
| source_id | INTEGER | FOREIGN KEY | 关联 kb_ingestion_source(id) |
| doc_title | VARCHAR(255) | NOT NULL | 临时文档标题 |
| content | TEXT | NOT NULL | 知识切片原文 |
| similarity_score| NUMERIC(4,3) | NULL | 与已有库的相似度（辅助去重） |
| filter_reason | VARCHAR(255) | NULL | 拦截入沙盒原因（如：低于相似度阈值） |
| created_at | TIMESTAMP | DEFAULT NOW() | 临时切片生成时间 |

### 12.4 接口设计

#### 12.4.1 获取/更新订阅源 API

*   **`GET /api/v1/kb/ingestion/sources`**：获取所有自学订阅源。
*   **`PATCH /api/v1/kb/ingestion/sources/{id}`**：控制自学源的启用/禁用。

#### 12.4.2 审核沙盒审核/忽略 API

*   **`GET /api/v1/kb/ingestion/sandbox`**：拉取待审核的沙盒暂存切片。
*   **`POST /api/v1/kb/ingestion/sandbox/action`**：一键批准或忽略。
    *   *Request Body*:
        ```json
        {
          "chunk_ids": [12, 13, 14],
          "action": "approve" // approve (入库) | ignore (忽略)
        }
        ```

### 12.5 前端交互与内容运营 UI 设计 (Gemini)

作为前端设计与内容运营专家，Gemini 为该功能设计了以下极具温湿度、消除用户黑盒焦虑的 UI 交互：

#### 12.5.1 "知识吞吐"可视化看板 (Data Ingestion Dashboard)

自学不应该是"冷冰冰的黑盒"。前端设计高科技感看板，包含：
*   **自学源监控卡片**：展示所有自学数据订阅源的实时状态，通过精美的绿色闪烁光环代表"自学中"，并提供极简开关。
*   **流水线吞吐动效 (Pipeline Flow Animation)**：在前端采用半透明流体渐变线条，可视化呈现 `抓取 (Fetch) ➡️ 清洗 (Clean) ➡️ 智能切片 (Chunk) ➡️ 向量化 (Embed) ➡️ 成功入库 (Indexed)` 的每一个流转节奏。
*   **自学周报统计**：今日新增多少个有效知识节点、清除了多少失效数据，直观展示知识库的自我生命力。

#### 12.5.2 "知识审核沙盒"面板 (Ingestion Sandbox)

对于金融、股票、医疗等严谨领域，防止脏数据入库是绝对刚需。
*   切片完成后，先进入沙盒暂存区，在前端呈现为高可读性的"可滑动卡片列表"。
*   每一张卡片清晰标注"拦截原因"（如：疑似广告、相似度较低、包含非高价值信息）及相似度数值。
*   分析师可以通过轻量点击 `Approve` 快速入库，或 `Ignore` 剔除，极低摩擦。

#### 12.5.3 动态数据可视化 (Dynamic Chat Chart)

当大模型在 RAG 问答中检索到具有高度时效性、含有大量数值趋势的自学数据（如"近一周半导体板块的资金流向和主力动向"）时：
*   前端 Markdown 引擎**自动拦截数值表格，渲染为交互式折线图、柱状图或关系图**（基于 ECharts 等轻量级库）。
*   将枯燥的多维度数值转换为生动、动态、可点击的图表，为分析决策提供极佳的视觉冲击。

#### 12.5.4 "行业速递/日报"卡片与公众号适配

自学数据不仅要用于回答，还要支持对外的知识传播和日常运营。
*   **一键拼装行业日报**：自学积累的行业要闻或重要数据，支持一键提炼前 5 大核心热点，智能排版，利用 `html2canvas` 导出为高颜值的精美图片卡片。
*   **微信公众号排版引擎**：针对微信公众号和飞书等排版错乱、样式丢失问题，提供特殊的"一键复制到公众号"按钮，通过 inline-CSS 适配器注入符合各平台渲染规范的样式，实现自学内容到一键内容运营分发的全过程。

### 12.6 交付阶段划分

| 特性 | 后端与算法依赖 | 建议阶段 |
|------|---------|---------|
| 知识吞吐看板 UI 骨架 | 无（静态 mock 动效） | P1 |
| 审核沙盒 UI 与卡片交互 | 无（静态 mock 交互） | P1 |
| 订阅源与沙盒接口 | 订阅源/沙盒 CRUD 接口 | P2 |
| 多 Agent 协同定时抓取 | 定时框架、Scraper 爬虫集成 | P3 |
| 主动语义去重与时效过期 | 语义除重算法、过期清理机制 | P3 |

---

## 13. 产品延展性证明：个人技能知识库场景

mindvaults 的架构设计天然支持从「企业知识库」到「个人技能成长副驾驶」的场景延展。以下以「Python 技能知识库」为例，证明同一套系统无需架构改动即可覆盖 C 端个人学习场景，验证产品的通用性和市场延展性。

### 13.1 场景描述

一位准备晋升的开发者，需要系统学习 Python 高级特性（asyncio、GIL、元类、装饰器等）。他使用 mindvaults 建立个人「Python 技能进阶知识库」，实现从信源采集到知识沉淀的完整学习闭环。

### 13.2 场景适配验证

| 产品能力 | 企业场景（已验证） | 个人学习场景（延展） | 是否需要架构改动 |
|---------|-------------------|---------------------|-----------------|
| 多源文档导入 | 上传内部 PDF/Word/MD 文档 | 上传《Python高级编程》PDF、PEP 提案、技术博客、个人练习代码 | 否 |
| 订阅源 + 自学 | 定时抓取行业研报、公司公告 | 订阅 Python 官方 PEP、优质技术 RSS | 否 |
| 沙盒审核 | 审核抓取的行业数据切片 | 过滤低质量教程/广告，保留深度源码分析 | 否 |
| 语义检索 + 问答 | "微服务之间如何通信" | "asyncio 事件循环如何调度协程" | 否 |
| SSE 进度透传 | 展示检索链路 | 展示学习思考路径，强化学习心流 | 否 |
| Mermaid 渲染 | 渲染系统架构图 | 渲染 MRO 继承链、GC 分代回收流程图 | 否 |
| 引用溯源 | Hover Popover + CitationDrawer | Hover 查看 PEP 原文，Drawer 定位 PDF 页码 | 否 |
| 知识卡片 | 生成行业速递日报 | 生成 Anki 式双面复习卡片（问题→原理图→源码引文） | 否 |
| 移动端 | 企业微信/飞书内访问 | 通勤路上手机翻卡片复习 | 否 |
| 数据隐私 | 企业敏感文档不外泄 | 个人代码/笔记不外泄，可放心贴敏感代码让 AI 诊断 | 否 |

### 13.3 延展性结论

**零架构改动**即可从企业知识库切换到个人学习场景。区别仅在于：
- 数据内容：企业文档 vs 个人学习资料
- 使用模式：团队共享 vs 个人专属
- 运营方式：日报分发给团队 vs 复习卡片自用

这证明了 mindvaults 的架构具有**场景无关的通用性**，核心链路（文档解析→切片→向量化→检索→生成）不绑定任何特定领域。未来的个人版、教育版、研究版均可基于同一套代码基座衍生。

---

## 14. 项目扩展方向

- 引入专业向量数据库（Milvus / Qdrant）替代 pgvector，支撑千万级大规模知识库
- 接入本地私有大模型（Ollama / vLLM），实现完全离线智能问答
- 新增知识库权限与多租户管理，实现不同角色查看不同私有知识
- 按 5.3 方案引入 Java 业务层，形成 Java 业务 + Python AI 的分层架构
- 对接多 Agent 协同系统，为工单Agent、文档Agent、答疑Agent提供全局私有知识底座
