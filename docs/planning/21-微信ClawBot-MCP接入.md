# 微信 ClawBot MCP 接入 — 方案设计

> 状态：🚧 施工中 | 创建：2026-06-11 | 关联：[[03-API接口契约]] [[02-系统架构设计]]

## 目标

通过 MCP 协议将 mindvaults 暴露为标准化工具集，使 OpenClaw 等 AI Agent 能自动发现并调用知识库能力。结合微信 ClawBot 插件，实现手机微信内问答 + 文件入库。

## 架构

```
手机微信 → ClawBot插件 → OpenClaw ──(MCP stdio JSON-RPC)──→ mindvaults MCP Server
                              │                                    │
                              │  tool/list                          │ 已有 service 层
                              │  tool/call → chat_with_kb          │ chat_service
                              │  tool/call → upload_document       │ document_service
                              │  tool/call → list_knowledge_bases  │ kb_service
                              │  tool/call → list_documents        │ document_service
```

## MCP 工具清单

| 工具名 | 参数 | 说明 |
|--------|------|------|
| `list_knowledge_bases` | — | 列出所有 KB，含文档数和字符量 |
| `chat_with_kb` | `question`, `kb_id?` | RAG 问答，自动路由或指定 KB |
| `upload_document` | `file_path`, `kb_id` | 上传文档到 KB，异步摄入 |
| `list_documents` | `kb_id`, `status?` | 列出 KB 中文档，按状态过滤 |
| `get_document_status` | `doc_id` | 查询单个文档摄入状态 |

## 关键设计决策

| 决策 | 结论 |
|------|------|
| 传输方式 | **stdio**（OpenClaw 拉起子进程，零网络配置） |
| MCP SDK | **FastMCP**（官方 `mcp>=1.27`，装饰器 API） |
| DB 会话 | 直接使用 `AsyncSessionLocal`，每个工具自管理会话 |
| 聊天输出 | 收集 SSE 流 → 拼接完整回答 + 引用 → 返回 Markdown |
| 文件上传 | 接收本地路径 → 读文件 → 调已有 `upload_documents` |

## 文件结构

```
backend/app/mcp/
├── __init__.py
├── server.py          # FastMCP 入口，工具注册
└── tools.py           # 工具实现（薄封装 → 调 service 层）
```

## 依赖

```
# requirements.txt 新增
mcp>=1.27
```

## 验收标准

- [ ] `python -m app.mcp.server` 可启动，stdio 通信正常
- [ ] OpenClaw MCP adapter 可发现 mindvaults 工具
- [ ] 微信发文字 → RAG 回答返回（含引用来源）
- [ ] 微信发文件 → 文档摄入成功 → 可被检索
- [ ] 无 FastAPI 依赖，独立进程运行
