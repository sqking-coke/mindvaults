export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  tags: ("feature" | "fix" | "docs" | "refactor" | "infra")[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v0.9.1",
    date: "2026-06-17",
    title: "MCP HTTP 双模传输 + 监控事件来源追踪",
    description:
      "MCP Server 双模传输：在 stdio 基础上新增 HTTP/SSE 模式，FastAPI 挂载 /mcp 端点，支持 Docker 跨容器部署。监控事件来源追踪：KbMonitorEvent 新增 source 字段（web/mcp/scheduler），基于 ContextVar 在异步上下文中自动标记事件来源。5 个 MCP 工具统一标记 source=mcp，3 个定时任务标记 source=scheduler，前端 AlertManager 支持按 source 来源筛选事件。修复 MCP 上传文档返回字段 bug（result.docs→result.documents）。新增 blog/08-MCP服务与微信ClawBot接入、DB 迁移 0023_add_source_to_monitor_events。",
    tags: ["feature", "fix", "infra", "docs"],
  },
  {
    version: "v0.9.0",
    date: "2026-06-10",
    title: "监控告警系统",
    description:
      "统一监控事件表 kb_monitor_events：一张表承载路由/LLM/提炼/概念/健康/外部推送/文档摄入 7 类事件，resolved_at 字段支持告警解除。监控看板 /kb/monitor 独立页面：暗色主题，折叠告警条 + 8 指标卡（路由+LLM）+ Recharts 趋势图（面积图+堆叠柱状图）+ 耗时分桶直方图 + KB 匹配热度 + 系统事件面板 + 提炼概念摘要 + 告警规则配置面板。告警解除：单条 ✕ + 全部已读，支持看板内修改告警阈值。埋点全链路覆盖：chat/kb_router/insight/external/concept/health/document/ingestion 8 个服务的关键路径。侧边栏新增独立监控看板入口，数据治理移除监控 tab。新增 monitor_service（聚合查询+事件写入）、alert_service（规则检查）、5 个监控 API 端点、seed_monitor_data.py 演示数据脚本。修复新建空会话删除报错（404 静默处理）。blog/07-监控告警系统方案。",
    tags: ["feature", "docs"],
  },
  {
    version: "v0.8.0",
    date: "2026-06-08",
    title: "文档预处理服务 + 知识库健康治理",
    description:
      "文档预处理服务（preprocessor/）：MD 用 Section 树解析+弹性映射（目标 500±30%），代码块/表格 unsplittable 保护，换行归一化。PDF 跨页页眉页脚检测+ASCII 图表移除+断行修复（CJK）+标题识别。TXT 噪声行过滤+空行归拢+邮件头归一化。PreprocessorRouter 按文件类型分发，接入 ingestion_service（parser→preprocessor→chunker）。清除 chunking_service 旧 structured 模式 237 行。健康中心 merge/cleanup/archive 改为物理 DELETE（原文可重索引恢复），同步文档 chunk_count。概念管理：手动创建弹窗加 KB 选择器+查找关联切片+候选列表勾选，一键清理孤岛概念，概念列表不再按 KB 筛选，页面加载自动恢复 localStorage KB 选择。新增 suggest-chunks API（embd 读 DB system_config）。新增 blog/06-知识库健康中心方案.m0d。版本号升至 v0.8.0。",
    tags: ["feature", "refactor", "docs"],
  },
  {
    version: "v0.7.0",
    date: "2026-06-07",
    title: "概念术语关联底座",
    description:
      "概念术语关联完整闭环：文档摄入时 LLM 自动抽取概念术语（Concept），构建知识库级术语表。RAG 检索时自动注入相关概念定义到 System Prompt 上下文，提升 LLM 对领域术语的理解准确度。前端概念管理页支持术语的查看、搜索、编辑、删除，概念 hover 卡片在对话中展示术语释义。抽取结果增量提交（每批 commit），避免大批量导入时单次失败全部回滚。概念注入支持 doc_names 字段（术语关联的源文档名列表）和词边界正则匹配（\\b 包裹），避免短词误匹配。",
    tags: ["feature"],
  },
  {
    version: "v0.6.0",
    date: "2026-06-05",
    title: "数据治理增强 & 稳定性修复",
    description:
      "修复 numpy.float32 JSON 序列化崩溃：done 事件显式 float() 转换 + _SafeJsonEncoder 兜底。修复 ingestion embed_batch 缺失 model 参数导致 DB 配置的 Embedding 模型被忽略。修复文档删除时 NOT NULL 约束崩溃（手动级联删除避免 ORM 设 NULL）。修复 KB 删除时的外键约束问题。数据治理页面代码优化与交互改进（ConfirmDialog 弹窗防误操作、showToast 恢复 warning 类型）。系统信息恢复硬编码展示（Apple M4 Ultra 等）。修复前端删除对话不走后端 API 的问题。",
    tags: ["fix", "refactor"],
  },
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
