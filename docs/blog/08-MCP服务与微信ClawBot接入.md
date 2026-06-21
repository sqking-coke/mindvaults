# 把知识库装进微信：mindvaults MCP 服务 + OpenClaw + ClawBot 部署全指南

> mindvaults 是一个本地私有化的 RAG 知识库。本文记录如何通过 MCP 协议将知识库暴露为标准化 AI 工具，配合 OpenClaw 和微信 ClawBot 插件，实现在手机微信里随时问答你的私有知识库——发文字走 RAG 检索，发文件自动切片入库。

## 一、效果预览

绑定完成后，微信通讯录里出现一个「微信 ClawBot」联系人：

```
你: 列出我的知识库
Bot: 📚 3 个知识库
     | Python 技术文档 | 12 篇 | 45,320 字符
     | 产品 PRD 库     | 8 篇  | 28,100 字符
     | 运维手册        | 5 篇  | 15,600 字符

你: Django ORM 里 select_related 和 prefetch_related 的区别？
Bot: 🔍 匹配知识库: Python 技术文档 (方式: centroid)

     select_related 通过 SQL JOIN 一次性加载关联对象，
     适用于 ForeignKey 和 OneToOne 关系...
     
     📖 引用来源
     1. Django ORM 优化.md (第 14 页) — 匹配度 94.6%
     2. Python 面试题整理.md (第 3 页) — 匹配度 87.2%

你: [发送 PDF 文件]
Bot: ✅ 已摄入《微服务架构实践.pdf》
     - 大小: 2.3MB
     - 切片数: 18
     - 状态: 已完成，可检索
```

全程在手机微信里完成，不需要打开电脑浏览器。

## 二、架构设计

### 2.1 整体链路

#### 整体链路

```
手机微信
  │ 发文字 / 发文件
  ▼
微信服务器 ── ClawBot 插件 ──→ OpenClaw (本地)
                                  │
                                  │ MCP JSON-RPC (stdio)
                                  ▼
                          mindvaults MCP Server
                                  │
                                  ├─ chat_with_kb       → RAG 问答
                                  ├─ upload_document    → 文件入库
                                  ├─ list_knowledge_bases → KB 列表
                                  ├─ list_documents     → 文档列表
                                  └─ get_document_status → 摄入状态
```

关键设计点：

- **微信到 OpenClaw**：微信官方 ClawBot 通道，零公网暴露，不封号
- **OpenClaw 到 mindvaults**：MCP stdio 协议，本地进程间通信，零网络配置
- **mindvaults 处理**：复用完整的 RAG 流水线（智能路由 → 向量检索 → 概念注入 → LLM 生成）

### 2.2 为什么是 MCP 而不是 REST？

| | REST API | MCP 协议 |
|------|:---:|:---:|
| Agent 感知 | 不知道有哪些工具，盲调 | **自动发现**全部工具及参数 schema |
| 多步编排 | 脚本写死流程 | Agent **自主决策**：查 KB 列表 → 选 KB → 问答 |
| 错误处理 | 解析 HTTP 状态码 | 结构化错误，Agent 能理解并重试 |
| 生态复用 | 只能 OpenClaw 用 | Claude Desktop / Cursor / Copilot 通用 |
| 开发量 | 零改动 | MCP Server ~200 行 Python |

当用户问"Python 知识库里关于 Django ORM 的优化文章有哪些"时，OpenClaw Agent 的自主决策链：

```
1. list_knowledge_bases  → 发现 3 个 KB
2. 匹配 "Python"         → kb_id=2
3. list_documents(kb=2)  → 发现 Django ORM 优化.md
4. chat_with_kb("Django ORM 优化", kb_id=2) → RAG 回答
```

这个过程不需要你在 Skill 脚本里写死任何分支判断——Agent 自己知道有哪些工具、怎么用、何时用。

### 2.3 mindvaults MCP 工具清单

| 工具名 | 参数 | 说明 |
|--------|------|------|
| `list_knowledge_bases` | — | 列出所有 KB，含文档数和字符量 |
| `chat_with_kb` | `question`, `kb_id?` | RAG 问答，含路由信息 + 引用来源 |
| `upload_document` | `file_path`, `kb_id` | 上传文档，自动走预处理+切片+向量化 |
| `list_documents` | `kb_id`, `status?` | 列出 KB 中文档，按状态过滤 |
| `get_document_status` | `doc_id` | 查询单个文档摄入状态 |

代码位置：`backend/app/mcp/`，`tools.py` 每个工具 ~30 行，薄封装已有 service 层。

### 2.4 监控：区分微信 vs Web 来源

MCP 调用通过 `ContextVar` 自动标记 `source='mcp'`，Web 端操作默认 `source='web'`，定时任务 `source='scheduler'`。

在 `/kb/monitor` 看板中可清晰区分：

```
今日路由: 156 (web: 142 | mcp: 14)
LLM 调用: 1,247 (web: 1,180 | mcp: 67)
```

MCP 调用的每次问答、文件入库都有完整的事件记录和告警覆盖。

## 三、前置条件

| 条件 | 说明 |
|------|------|
| Node.js | ≥ 22（推荐 24+）。`node -v` 确认 |
| mindvaults | 后端 + 数据库已启动，`localhost:8000` 可达 |
| API Key | DeepSeek / OpenAI 等 LLM 的有效 API Key |
| Python | 3.12+，mindvaults 后端 venv 中已安装 `mcp>=1.27` |
| 微信 | 手机端已安装微信，版本 ≥ 8.0.70 |

## 四、部署步骤

### Step 1：安装 mindvaults MCP 依赖

```bash
cd mindvaults/backend
source venv/bin/activate
pip install "mcp>=1.27"
```

验证：

```bash
python -c "from app.mcp.server import mcp; print(mcp.name)"
# 输出: mindvaults
```

### Step 2：安装 OpenClaw

macOS / Linux 一键安装：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

或通过 npm：

```bash
npm install -g openclaw@latest
openclaw --version
# 输出: OpenClaw 2026.6.x
```

启动 Gateway（允许无配置文件启动，后续再配置）：

```bash
openclaw gateway --port 18789 --allow-unconfigured &
```

确认 Gateway 运行：

```bash
openclaw status
# Dashboard: http://127.0.0.1:18789/
# Gateway: local · ws://127.0.0.1:18789
```

### Step 3：配置 LLM Provider

编辑 `~/.openclaw/openclaw.json`（首次启动后自动生成），配置 `models.providers`：

**使用 DeepSeek：**

```json
{
  "models": {
    "providers": {
      "openai": {
        "baseUrl": "https://api.deepseek.com/v1",
        "apiKey": "sk-你的DeepSeek密钥",
        "models": [
          {
            "id": "deepseek-v4-flash",
            "name": "DeepSeek V4 Flash",
            "contextWindow": 128000,
            "maxTokens": 8192,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0 }
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/deepseek-v4-flash"
      }
    }
  }
}
```

**使用 Ollama 本地模型：**

```json
{
  "models": {
    "providers": {
      "openai": {
        "baseUrl": "http://localhost:11434/v1",
        "apiKey": "ollama",
        "models": [
          {
            "id": "qwen3:8b",
            "name": "Qwen 3 8B",
            "contextWindow": 32768,
            "maxTokens": 4096,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0 }
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/qwen3:8b"
      }
    }
  }
}
```

重启 Gateway：

```bash
pkill -f "openclaw gateway"
openclaw gateway --port 18789 --allow-unconfigured &
```

### Step 4：配置 mindvaults MCP Server（stdio）

在 `~/.openclaw/openclaw.json` 中添加 MCP 配置：

```json
{
  "mcp": {
    "servers": {
      "mindvaults": {
        "enabled": true,
        "command": "/path/to/mindvaults/backend/venv/bin/python",
        "args": ["-m", "app.mcp.server"],
        "cwd": "/path/to/mindvaults/backend"
      }
    }
  }
}
```

> `command` 必须指向 mindvaults 后端 venv 中的 python 可执行文件。`which python`（在 venv 激活后）获取路径。

或通过命令行配置：

```bash
openclaw config set mcp.servers.mindvaults.enabled true
openclaw config set mcp.servers.mindvaults.command "/path/to/venv/bin/python"
openclaw config set mcp.servers.mindvaults.args '["-m", "app.mcp.server"]' --strict-json
openclaw config set mcp.servers.mindvaults.cwd "/path/to/mindvaults/backend"
```

重启 Gateway 生效。

### Step 5：安装微信 ClawBot 插件

```bash
npx -y @tencent-weixin/openclaw-weixin-cli@latest install
```

终端会显示二维码，用手机微信扫码确认授权：

```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
█ ▄▄▄▄▄ █  ...  █ ▄▄▄▄▄ █
█ █   █ █  ...  █ █   █ █
...
```

扫码成功后，微信通讯录中出现「微信 ClawBot」联系人。

验证通道状态：

```bash
openclaw status
# Channels
# ┌─────────────────┬─────────┬────────┬─────────────┐
# │ Channel         │ Enabled │ State  │ Detail      │
# ├─────────────────┼─────────┼────────┼─────────────┤
# │ openclaw-weixin │ ON      │ OK     │ configured  │
# └─────────────────┴─────────┴────────┴─────────────┘
```

### Step 6：测试验证

在微信 ClawBot 对话框中发送：

**测试 1：列出知识库**
```
列出我的知识库
```
预期返回所有 KB 的表格。

**测试 2：RAG 问答**
```
帮我查一下 Python GIL 锁的优化方案
```
预期返回带引用来源的回答。

**测试 3：文件入库**
```
[发送一个 PDF / MD 文件]
```
预期返回摄入确认消息，包含切片数和完成状态。

**测试 4：查看监控**
打开 `http://localhost:3000/kb/monitor`，确认能看到 `source='mcp'` 的事件。

## 五、常见问题

### Q1：Gateway 报 "Missing API key for provider openai"

配置文件中的 `apiKey` 无效。检查步骤：
1. `curl -H "Authorization: Bearer sk-你的key" https://api.deepseek.com/v1/models` 确认 key 可用
2. 清除 Agent 认证缓存：`rm -f ~/.openclaw/agents/main/agent/openclaw-agent.sqlite`
3. 重启 Gateway

### Q2：微信消息回复 "Something went wrong"

查看 Gateway 日志定位具体错误：

```bash
tail -100 /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | grep -i error
```

常见原因：
- LLM API Key 无效或余额不足
- mindvaults 后端未启动（`curl localhost:8000/api/v1/health` 检查）
- MCP Server Python 路径不正确

### Q3：MCP 工具未被 OpenClaw 发现

确认配置正确后，在微信中发送"列出我的知识库"——这会触发 `list_knowledge_bases` 工具调用。如果 Agent 没有调用工具而是自己编造回答，检查：

- `mcp.servers.mindvaults.enabled` 是否为 `true`
- `command` 路径是否正确
- Gateway 重启后日志是否有 MCP 进程启动信息

### Q4：能在群聊中使用吗？

微信 ClawBot 当前**仅支持私聊**。如需群聊场景，可考虑企业微信插件（`@tencent-weixin/openclaw-wecom`）。

### Q5：文件上传后多久能检索到？

取决于文件大小。典型耗时：
- Markdown < 1MB：~5 秒（解析 + 预处理 + 切片 + 向量化）
- PDF < 10MB：~15-30 秒
- 大文档 > 10MB：可能需要 1 分钟以上

通过 `get_document_status` 工具或 Web 端可查询实时处理状态。

## 六、配置参考

完整的 `~/.openclaw/openclaw.json` 参考：

```json
{
  "mcp": {
    "servers": {
      "mindvaults": {
        "enabled": true,
        "command": "/path/to/mindvaults/backend/venv/bin/python",
        "args": ["-m", "app.mcp.server"],
        "cwd": "/path/to/mindvaults/backend"
      }
    }
  },
  "models": {
    "providers": {
      "openai": {
        "baseUrl": "https://api.deepseek.com/v1",
        "apiKey": "sk-你的密钥",
        "models": [
          {
            "id": "deepseek-v4-flash",
            "name": "DeepSeek V4 Flash",
            "contextWindow": 128000,
            "maxTokens": 8192,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0 }
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/deepseek-v4-flash"
      }
    }
  },
  "plugins": {
    "entries": {
      "openclaw-weixin": {
        "enabled": true
      }
    }
  }
}
```

## 七、相关文档

- [21-微信ClawBot-MCP接入](../planning/21-微信ClawBot-MCP接入.md) — 设计文档
- [03-API接口契约](../planning/03-API接口契约.md) — mindvaults REST API
- [20-监控告警系统](../planning/20-监控告警系统.md) — kb_monitor_events 表结构
- [OpenClaw 官方文档](https://docs.openclaw.ai)
- [MCP 协议规范](https://modelcontextprotocol.io)
