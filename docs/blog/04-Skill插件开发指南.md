# mindvaults-glean 开发指南：从零构建一个 Claude Code 知识沉淀插件

> 想给 mindvaults 写一个 Skill 插件但不知道从哪开始？本文是一份完整的 step-by-step 开发指南，覆盖 Skill 定义、Hook 触发、插件打包、分发安装的全流程。读完你就能写出自己的 Claude Code 插件。

---

## 一、先搞清楚三种扩展机制

Claude Code 的插件系统由三层组成，各司其职：

| 机制 | 文件 | 职责 | mindvaults-glean 的用法 |
|------|------|------|--------------------------|
| **Skill** | `SKILL.md` | 教 Claude 怎么做一件事（自动按关键词匹配加载） | 定义知识收集逻辑和用户命令 |
| **Hook** | `settings.json` 或 `hooks.json` | 事件触发自动执行脚本 | Stop 事件触发推送脚本 |
| **Plugin** | `plugin.json` | 把 Skill + Hook + 命令打包成一个可安装单元 | 发布给用户，一行命令安装 |

一句话总结：**Skill 负责"知道做什么"，Hook 负责"什么时候做"，Plugin 负责"怎么分发"。**

---

## 二、项目结构

```
mindvaults-glean/
├── SKILL.md                # 核心：技能定义 + 指令
├── hooks/
│   ├── hooks.json          # Stop hook 配置（事件 → 脚本映射）
│   └── push-qa.sh          # 推送脚本（实际执行的逻辑）
├── commands/               # 用户命令（每个命令一个 .md）
│   ├── mindvaults-on.md
│   ├── mindvaults-off.md
│   ├── mindvaults-push.md
│   └── mindvaults-status.md
├── .claude-plugin/
│   └── plugin.json         # 插件清单（名称、版本、入口）
└── README.md
```

每个文件逐个拆解。

---

## 三、SKILL.md — 插件的大脑

`SKILL.md` 是插件最核心的文件。它告诉 Claude Code：这个插件叫什么、做什么、什么时候触发、有哪些命令。

```markdown
---
name: mindvaults-glean
description: |
  知识沉淀收集器。每次对话结束后自动推送 QA 到 mindvaults 知识库。
  支持 /mindvaults-glean on|off|push|status 命令控制收集行为。
  触发关键词：知识沉淀、mindvaults、保存对话、同步知识库
user-invocable: true
---

# mindvaults 知识沉淀同步

## 自动收集

每次对话回合结束，Stop hook 自动运行：
1. 检查收集开关（`~/.claude/mindvaults/config.json` 中的 `enabled` 字段）
2. 提取本轮 QA 对
3. POST 到用户配置的 mindvaults 实例 `/api/v1/kb/external/push`
4. 成功静默处理，失败记录到 pending 重试队列

## 用户命令

| 命令 | 功能 |
|------|------|
| `/mindvaults-glean on` | 开启自动收集 |
| `/mindvaults-glean off` | 暂停收集 |
| `/mindvaults-glean push` | 手动推送当前会话全部 QA |
| `/mindvaults-glean status` | 查看今日推送统计 |

## 配置

首次使用需配置（在 mindvaults 设置页获取）：
- `endpoint`：mindvaults 部署地址
- `api_key`：沉淀库 API Key

配置文件位置：`~/.claude/mindvaults/config.json`
```

### 关键字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 插件唯一标识符，和 `plugin.json` 中的 `name` 一致 |
| `description` | ✅ | 包含触发关键词——当用户的输入匹配这些词时自动加载此 Skill |
| `user-invocable` | 可选 | 设为 `true` 后用户可以手动 `/mindvaults-glean` 调用 |

---

## 四、Stop Hook — 对话结束自动触发

### 4.1 hooks.json

Hook 配置告诉 Claude Code：**当某个事件发生时，执行什么脚本**。

```json
{
  "Stop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/push-qa.sh"
        }
      ]
    }
  ]
}
```

`${CLAUDE_PLUGIN_ROOT}` 是 Claude Code 自动注入的环境变量，指向插件根目录。不用写死绝对路径。

### 4.2 push-qa.sh — 核心推送脚本

这是真正干活的脚本。设计要点：

1. **开关检查** — 用户可通过 `/mindvaults-glean off` 随时暂停
2. **防无限循环** — 检查 `CLAUDE_STOP_HOOK_ACTIVE` 环境变量，避免 Stop hook 触发自身
3. **静默失败** — 始终返回 `exit 0`，不打断用户对话
4. **本地状态追踪** — 记录每日推送计数，支持 `/mindvaults-glean status` 查询

```bash
#!/bin/bash
set -euo pipefail

CONFIG="$HOME/.claude/mindvaults/config.json"
STATE="$HOME/.claude/mindvaults/state.json"

# 1. 防止 Stop hook 无限循环
if [ "${CLAUDE_STOP_HOOK_ACTIVE:-0}" = "1" ]; then
  exit 0
fi

# 2. 检查收集开关
enabled=$(jq -r '.enabled // false' "$CONFIG" 2>/dev/null)
if [ "$enabled" != "true" ]; then
  exit 0
fi

endpoint=$(jq -r '.endpoint' "$CONFIG")
api_key=$(jq -r '.api_key' "$CONFIG")

if [ -z "$endpoint" ] || [ -z "$api_key" ] || [ "$api_key" = "null" ]; then
  exit 0
fi

# 3. 提取本轮 QA
question=$(jq -r '.last_user_message // ""' "$CLAUDE_TRANSCRIPT_PATH" 2>/dev/null)
answer=$(jq -r '.last_assistant_message // ""' "$CLAUDE_TRANSCRIPT_PATH" 2>/dev/null)

if [ -z "$question" ] || [ -z "$answer" ]; then
  exit 0
fi

# 4. 推送到 mindvaults
http_code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${endpoint}/api/v1/kb/external/push" \
  -H "Authorization: Bearer ${api_key}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg q "$question" \
    --arg a "$answer" \
    '{platform: "claude_code", qa_pairs: [{question: $q, answer: $a}]}')")

# 5. 记录状态
today=$(date +%Y-%m-%d)
count=$(jq -r ".daily.\"$today\" // 0" "$STATE" 2>/dev/null || echo 0)
count=$((count + 1))
jq --arg today "$today" --argjson count "$count" --arg time "$(date -Iseconds)" \
  '.daily[$today] = $count | .last_push_at = $time' \
  "$STATE" > "${STATE}.tmp" && mv "${STATE}.tmp" "$STATE"

# 6. 失败重试
if [ "$http_code" != "200" ]; then
  echo "$(date -Iseconds) | HTTP $http_code | $question" >> "$HOME/.claude/mindvaults/pending.log"
fi

exit 0  # 始终返回 0，不打断对话
```

### 4.3 用户状态文件

`~/.claude/mindvaults/state.json`（脚本自动维护，无需用户手动编辑）：

```json
{
  "daily": { "2026-06-05": 15 },
  "last_push_at": "2026-06-05T17:30:00+08:00",
  "pending_retry": 0
}
```

`/mindvaults-glean status` 命令读取这个文件，展示今日推送统计。

---

## 五、用户命令 — 四个斜杠命令

每个命令一个 markdown 文件，放在 `commands/` 目录下。Claude Code 会自动注册为斜杠命令。

### mindvaults-on.md

```markdown
开启 mindvaults 对话自动收集。将 `~/.claude/mindvaults/config.json` 中的 enabled 设为 true。
```

### mindvaults-off.md

```markdown
暂停 mindvaults 对话自动收集。将 `~/.claude/mindvaults/config.json` 中的 enabled 设为 false。
```

### mindvaults-push.md

```markdown
手动推送当前会话的全部 QA 对到 mindvaults 沉淀库。
```

### mindvaults-status.md

```markdown
查看今日推送统计：已推送条数、收集开关状态、目标端点地址。
```

---

## 六、Plugin 打包 — plugin.json

`plugin.json` 是插件的"身份证"，告诉 Claude Code 这个插件的基本信息：

```json
{
  "name": "mindvaults-glean",
  "version": "1.0.0",
  "description": "自动推送 Claude Code 对话到 mindvaults 知识沉淀系统",
  "author": {
    "name": "mindvaults",
    "url": "https://github.com/coke/mindvaults"
  },
  "license": "MIT",
  "hooks": { "source": "./hooks/hooks.json" }
}
```

| 字段 | 说明 |
|------|------|
| `name` | 和 `SKILL.md` 中的 `name` 保持严格一致 |
| `version` | 语义化版本，用户升级时按版本判断 |
| `hooks.source` | 指向 hooks 配置文件路径（相对于插件根目录） |

---

## 七、用户配置

用户安装后需要两步配置：

**Step 1** — 在 mindvaults 设置页（`/settings`）获取 API Key 和端点地址，创建 `~/.claude/mindvaults/config.json`：

```json
{
  "endpoint": "http://localhost:8000",
  "api_key": "mv-dep-xxxxxxxxxxxx",
  "enabled": true
}
```

**Step 2** — 确认开启：

```bash
/mindvaults-glean on
/mindvaults-glean status
# 今日已推送 0 条 | 收集状态: 开启 | 目标: http://localhost:8000
```

---

## 八、发布与分发

### 方式一：GitHub 直接安装（推荐）

不需要注册任何插件市场。把仓库设为 public，用户一行命令安装：

```bash
/plugin install github.com/wsq/mindvaults-glean
```

更新也简单：

```bash
/plugin update mindvaults-glean
```

### 方式二：创建自己的 Marketplace

如果有多个插件需要集中分发，可以建一个 marketplace 仓库：

1. 创建 `mindvaults-marketplace` 仓库
2. 添加 `.claude-plugin/marketplace.json`：

```json
{
  "plugins": {
    "mindvaults-glean": {
      "source": "github",
      "repo": "wsq/mindvaults-glean"
    }
  }
}
```

3. 用户注册 marketplace 后安装：

```bash
/plugin marketplace add wsq/mindvaults-marketplace
/plugin install mindvaults-glean@mindvaults-marketplace
```

### 版本管理

- 用 GitHub Releases 打 tag（`v1.0.0`、`v1.1.0`）
- 用户执行 `/plugin update` 自动拉取最新 release
- 破坏性变更走 major version bump，用户不会意外升级

---

## 九、后端对接 — Push API 速览

插件推送的目标端点（完整设计见 [03-Skill插件-知识沉淀收集](./03-Skill插件-知识沉淀收集.md)）：

```
POST /api/v1/kb/external/push
Authorization: Bearer <external_api_key>
Content-Type: application/json

{
  "platform": "claude_code",
  "qa_pairs": [
    {"question": "什么是 Python GIL？", "answer": "GIL 是全局解释器锁..."}
  ]
}
```

后端接管后的数据流：

```
kb_external_entries（暂存）
    → 定时 LLM 提炼（复用 insight_service）
    → kb_insights（source_type=external，端到端可追溯）
    → 审核中心（支持按来源过滤：全部/本地 QA/外部收集）
    → 审核通过 → kb_chunks → 参与 RAG 检索
```

---

## 十、安全设计

| 层级 | 措施 |
|------|------|
| 传输 | HTTPS 加密 |
| 鉴权 | 独立 `external_api_key`，仅对 push 端点有效，泄露不影响其他 API |
| 存储 | API Key 存在用户本机 `~/.claude/mindvaults/config.json`，不离开本地 |
| 控制 | 用户随时 `/mindvaults-glean off` 暂停，Key 泄露后在设置页一键轮换 |
| 脚本 | `exit 0` 保证任何错误不影响 Claude Code 正常运行 |

---

## 十一、开发检查清单

开发一个可发布的 Skill 插件，对着这个清单逐项打勾：

- [ ] `SKILL.md` 的 `name` 和 `plugin.json` 的 `name` 一致
- [ ] `description` 中包含触发关键词
- [ ] Stop hook 脚本检查了 `CLAUDE_STOP_HOOK_ACTIVE` 防止无限循环
- [ ] Stop hook 脚本始终 `exit 0`，不打断对话
- [ ] 异常路径都有兜底（端点不可达、Key 过期、QA 为空）
- [ ] 用户配置文件和状态文件路径正确（`~/.claude/mindvaults/`）
- [ ] README 包含安装步骤和首次配置说明
- [ ] GitHub Releases 打了版本 tag
- [ ] 仓库设为 public

---

## 十二、后续规划

| 阶段 | 内容 |
|------|------|
| Step 2 | Copilot CLI 适配（同架构，改 `source_platform` 标识） |
| Step 3 | 完整多轮会话推送（`messages_json` 字段已预留） |
| Step 4 | 推送仪表板（skill 端 `/mindvaults dashboard`） |
| Step 5 | 重试队列自动恢复（pending.log 定时重推） |
| Step 6 | ChatGPT Plugin 适配 |

---

> **关联文档**：[03-Skill插件-知识沉淀收集](./03-Skill插件-知识沉淀收集.md) — 完整的架构设计和后端 API 方案；[17-Skill插件开发计划](../planning/17-Skill插件开发计划.md) — 开发任务拆分和时间线。
