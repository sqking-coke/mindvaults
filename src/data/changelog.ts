export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  tags: ("feature" | "fix" | "docs" | "refactor" | "infra")[];
}

const TAG_LABELS: Record<string, string> = {
  feature: "新功能",
  fix: "修复",
  docs: "文档",
  refactor: "重构",
  infra: "基础设施",
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v0.1",
    date: "2026-05-28",
    title: "项目立项 & MVP 基线",
    description:
      "确定纯本地私有化 RAG 知识库定位。完成项目骨架搭建：Next.js 14 前端原型（Chat/KB 页面、Sidebar、Mock 演示）、FastAPI 后端骨架、PostgreSQL+pgvector 数据库、Docker Compose 一键部署。跑通文档上传→解析切片→向量入库→单轮问答最小闭环。",
    tags: ["feature", "infra"],
  },
  {
    version: "v0.2",
    date: "2026-05-29",
    title: "P1 产品化增强",
    description:
      "多轮对话上下文注入、意图识别、API Key 鉴权、接口限流、日志轮转。前端新增知识卡片分享、微信公众号排版导出、移动端响应式适配。文档解析支持 PDF/Word/Markdown/TXT/CSV。",
    tags: ["feature", "fix"],
  },
  {
    version: "v0.3",
    date: "2026-05-30",
    title: "大模型动态切换 & Obsidian Vault 导入",
    description:
      "LLM/Embedding Provider 可配置，支持本地 Ollama 和云端 API 热切换。新增 Obsidian Vault 批量导入（路径扫描 + 拖拽上传），自动解析 YAML Frontmatter 和 Wiki 链接。项目重命名 mindvaults，重组文档体系。",
    tags: ["feature", "refactor"],
  },
  {
    version: "v0.4",
    date: "2026-05-30",
    title: "多知识库支持 & 推理过程可视化",
    description:
      "完整多 KB 架构：knowledge_bases 表 + CRUD API + 前端管理面板。检索按 KB 隔离，文档归属 KB，会话绑定 KB。推理过程实时面板（SSE progress 事件捕获），历史对话删除持久化。首页 Mockup 对接真实配置，提问模板动态高频问题。侧边栏系统状态实时 CPU/内存监控。",
    tags: ["feature", "refactor"],
  },
  {
    version: "v0.5",
    date: "2026-05-31",
    title: "推理 Redis 缓存 & 基础优化",
    description:
      "推理过程 Redis 缓存（7 天 TTL），session 删除时同步清理。统一日期格式化工具 `date.ts`，知识库类型 snake_case 对齐后端 API。摄入管道竞态修复，Toast 去演示化。前端 `KnowledgeBase` 类型从 mock 改为真实 API 持久化。",
    tags: ["feature", "fix"],
  },
  {
    version: "v0.6",
    date: "2026-05-31",
    title: "企业级规范制定",
    description:
      "企业级日志规范（毫秒级时间戳、traceId 全链路追踪、sessionId、请求/响应体 JSON 日志、敏感字段脱敏、慢操作阈值、监控指标预留）。统一异常处理规范（三层异常体系、18 个错误码、全局异常处理器）。",
    tags: ["docs", "infra"],
  },
];
