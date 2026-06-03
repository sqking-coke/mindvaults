export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  tags: ("feature" | "fix" | "docs" | "refactor" | "infra")[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v0.5.0",
    date: "2026-06-03",
    title: "对话知识沉淀 #16 实现 & 基座加固",
    description:
      "实现对话知识沉淀完整闭环：LLM 定时/手动提炼 QA 对话为知识点（非流式，temperature=0）、向量相似度去重（阈值 0.92）、用户审核（通过/拒绝/删除+目标 KB 分配）、审核通过后自动落 kb_chunk 参与联合检索。新增 kb_insights 表、沉积服务 insight_service、APScheduler 后台定时调度器（每日凌晨触发）。统一系统知识库（默认系统库，id=1，不可删除，启动自愈）。数据治理页面新增知识审核、概念管理、健康中心、监控看板四个模块，审核卡片展示置信度、标签、目标 KB 选择器。系统设置新增对话知识沉淀配置（启用开关、定时时间、去重阈值、自动通过阈值）。Step 0/1 遗留修复：KbConfig ORM 补全 LLM/Embedding 字段、vault.py 替换裸 HTTPException、apiClient 提取 X-Trace-Id、main.py 过期迁移逻辑清理、chat_service 拆出 session_service。修复 reranker URL 拼接 bug（/v1/v1/rerank → /v1/rerank）、reindex 竞态条件（先 commit 再 schedule）、前端删除对话不走后端、引用编号 [0] → [1] 对齐 LLM 输出。CLAUDE.md 精简重构，新增 Import 顶层集中、写前先搜索、lifespan 只做自愈不做迁移等硬约束。",
    tags: ["feature", "fix", "refactor", "docs"],
  },
  {
    version: "v0.4.0",
    date: "2026-06-02",
    title: "KB 智能路由方案 & 数据治理蓝图",
    description:
      "KB 智能路由三层降级匹配方案：质心向量匹配（<1ms）→ LLM 语义路由（~300ms）→ 用户引导，覆盖 9 种异常兜底场景。数据治理系统蓝图：对话知识沉淀（QA 定时提炼→审核→入库）、Skill 集成（Claude Code 外部对话收集入口）、概念/术语关联（摄入时 LLM 抽取+RAG 上下文注入+hover 展示）、知识库内容再组织（多维度诊断+用户决策治理），新增 5 份设计文档。前端 KB 选择器从原生 select 重构为浮动面板，支持自动（智能路由）/指定 KB/全库搜索三种模式。system_config 表补充进数据库设计文档。",
    tags: ["feature", "docs", "refactor"],
  },
  {
    version: "v0.3.0",
    date: "2026-05-31",
    title: "架构重构 & 规范体系建立",
    description:
      "Sidebar 提升至共享 Route Group Layout，路由切换不再重新挂载，彻底解决导航闪烁与系统状态重复请求。设置面板独立为 /settings 页面。统一品牌图标与日期格式化工具。推理过程 Redis 缓存（7 天 TTL），session 删除时同步清理。摄入管道竞态修复，前端 KnowledgeBase 从 mock 改为真实 API 持久化。制定企业级日志规范（毫秒级时间戳、traceId 全链路追踪、敏感字段脱敏）与统一异常处理规范（三层异常体系、18 个错误码）。新增独立更新日志页面。",
    tags: ["feature", "refactor", "fix", "docs", "infra"],
  },
  {
    version: "v0.2.0",
    date: "2026-05-30",
    title: "多知识库架构 & 模型动态切换 & Obsidian 导入",
    description:
      "完整多 KB 架构：knowledge_bases 表 + CRUD API + 前端管理面板，检索/文档/会话均按 KB 隔离。推理过程实时可视化面板（SSE progress 事件捕获）。LLM/Embedding Provider 可配置，支持本地 Ollama 和云端 API 热切换。新增 Obsidian Vault 批量导入（路径扫描 + 拖拽上传），自动解析 YAML Frontmatter 和 Wiki 链接。项目重命名 mindvaults，重组文档体系。侧边栏系统状态实时 CPU/内存监控。",
    tags: ["feature", "refactor"],
  },
  {
    version: "v0.1.0",
    date: "2026-05-29",
    title: "P1 产品化增强",
    description:
      "多轮对话上下文注入、意图识别、API Key 鉴权、接口限流、日志轮转。前端新增知识卡片分享、微信公众号排版导出、移动端响应式适配。文档解析支持 PDF、Word、Markdown、TXT、CSV。",
    tags: ["feature", "fix"],
  },
  {
    version: "v0.0.1",
    date: "2026-05-28",
    title: "项目立项 & MVP 基线",
    description:
      "确定纯本地私有化 RAG 知识库定位。完成项目骨架搭建：Next.js 14 前端原型（Chat/KB 页面、Sidebar、Mock 演示）、FastAPI 后端骨架、PostgreSQL+pgvector 数据库、Docker Compose 一键部署。跑通文档上传→解析切片→向量入库→单轮问答最小闭环。",
    tags: ["feature", "infra"],
  },
];
