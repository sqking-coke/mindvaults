# Skill 插件开发指南

> 状态：✅ 已实现 | 创建：2026-06-04 | 更新：2026-06-11 | 关联：[[16-Skill插件-知识沉淀收集]]

## 概述

mindvaults skill 是一个 Claude Code 插件，让用户在其他平台的对话自动推送到自己的 mindvaults 沉淀库，走提炼 + 审核管道。

用户安装后，每次对话结束自动收集 QA 对，POST 到 `/api/v1/kb/external/push`。

---

## 核心概念：三种扩展机制

| 机制 | 干什么 | 本项目用哪个 |
|------|--------|---------------|
| **Skill** (`SKILL.md`) | 教 Claude 怎么做一件事（自动匹配加载） | ✅ 知识收集逻辑 |
| **Hook** (`settings.json`) | 事件触发自动执行（Stop/PreToolUse 等） | ✅ 对话结束自动推送 |
| **Plugin** (`plugin.json`) | 把 Skill + Hook + 命令打包分发 | ✅ 发布给用户安装 |

---

## Skill 开发

### 文件结构

```
mindvaults-glean/
├── SKILL.md           # 核心：技能定义 + 指令
├── hooks/
│   ├── hooks.json     # Stop hook 配置
│   └── push-qa.sh     # 推送脚本
├── commands/          # 用户命令
│   ├── mindvaults-on.md
│   ├── mindvaults-off.md
│   ├── mindvaults-push.md
│   └── mindvaults-status.md
├── .claude-plugin/
│   └── plugin.json    # 插件清单
└── README.md
```

### SKILL.md（完整版）

```markdown
---
name: mindvaults-glean
description: |
  知识沉淀收集器。每次对话结束后自动推送 QA 到 mindvaults 知识库。
  支持 /mindvaults on|off|push|status 命令控制收集行为。
  触发关键词：知识沉淀、mindvaults、保存对话、同步知识库
user-invocable: true
---

# mindvaults 知识沉淀同步

## 自动收集

每次对话回合结束，Stop hook 自动运行：
1. 检查收集开关（~/.claude/mindvaults/config.json 中的 enabled 字段）
2. 提取本轮 QA 对
3. POST 到用户配置的 mindvaults 实例 `/api/v1/kb/external/push`
4. 成功静默处理，失败记录到 pending 重试队列

## 用户命令

| 命令 | 功能 |
|------|------|
| `/mindvaults on` | 开启自动收集 |
| `/mindvaults off` | 暂停收集 |
| `/mindvaults push` | 手动推送当前会话全部 QA |
| `/mindvaults status` | 查看今日推送统计 |

## 配置

首次使用需配置（在 mindvaults 设置页获取）：
- endpoint：mindvaults 部署地址
- api_key：沉淀库 API Key

配置文件位置：`~/.claude/mindvaults/config.json`
```

### Stop Hook 配置

`hooks/hooks.json`：
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

### 推送脚本

`hooks/push-qa.sh`：
```bash
#!/bin/bash
set -euo pipefail

CONFIG="$HOME/.claude/mindvaults/config.json"
STATE="$HOME/.claude/mindvaults/state.json"

# --- 防止 stop hook 无限循环 ---
if [ "${CLAUDE_STOP_HOOK_ACTIVE:-0}" = "1" ]; then
  exit 0
fi

# --- 检查开关 ---
enabled=$(jq -r '.enabled // false' "$CONFIG" 2>/dev/null)
if [ "$enabled" != "true" ]; then
  exit 0
fi

endpoint=$(jq -r '.endpoint' "$CONFIG")
api_key=$(jq -r '.api_key' "$CONFIG")

if [ -z "$endpoint" ] || [ -z "$api_key" ] || [ "$api_key" = "null" ]; then
  exit 0
fi

# --- 提取本轮 QA ---
question=$(jq -r '.last_user_message // ""' "$CLAUDE_TRANSCRIPT_PATH" 2>/dev/null)
answer=$(jq -r '.last_assistant_message // ""' "$CLAUDE_TRANSCRIPT_PATH" 2>/dev/null)

if [ -z "$question" ] || [ -z "$answer" ]; then
  exit 0
fi

# --- 推送 ---
http_code=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "${endpoint}/api/v1/kb/external/push" \
  -H "Authorization: Bearer ${api_key}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg q "$question" \
    --arg a "$answer" \
    '{platform: "claude_code", qa_pairs: [{question: $q, answer: $a}]}')")

# --- 记录状态 ---
today=$(date +%Y-%m-%d)
count=$(jq -r ".daily.\"$today\" // 0" "$STATE" 2>/dev/null || echo 0)
count=$((count + 1))
jq --arg today "$today" --arg count "$count" --arg time "$(date -Iseconds)" \
  '.daily[$today] = ($count | tonumber) | .last_push_at = $time' \
  "$STATE" > "${STATE}.tmp" && mv "${STATE}.tmp" "$STATE"

if [ "$http_code" != "200" ]; then
  # 失败记录到重试队列
  echo "$(date -Iseconds) | HTTP $http_code | $question" >> "$HOME/.claude/mindvaults/pending.log"
fi

exit 0  # 始终返回 0，不打断对话
```

### 用户配置示例

`~/.claude/mindvaults/config.json`（用户首次配置时创建）：
```json
{
  "endpoint": "https://your-instance.com",
  "api_key": "mv-dep-xxxxxxxxxxxx",
  "enabled": true
}
```

`~/.claude/mindvaults/state.json`（自动维护）：
```json
{
  "daily": { "2026-06-04": 15 },
  "last_push_at": "2026-06-04T17:30:00Z",
  "pending_retry": 0
}
```

---

## Plugin 打包

### plugin.json

```json
{
  "name": "mindvaults-glean",
  "version": "1.0.0",
  "description": "自动推送 Claude Code 对话到 mindvaults 知识沉淀系统",
  "author": { "name": "mindvaults", "url": "https://github.com/coke/mindvaults" },
  "license": "MIT",
  "hooks": { "source": "./hooks/hooks.json" }
}
```

### 目录结构

```
mindvaults-glean/
├── .claude-plugin/
│   └── plugin.json
├── SKILL.md
├── hooks/
│   ├── hooks.json
│   └── push-qa.sh
├── commands/
│   ├── mindvaults-on.md
│   ├── mindvaults-off.md
│   ├── mindvaults-push.md
│   └── mindvaults-status.md
└── README.md
```

---

## 发布 & 分发

### 发布到 GitHub Marketplace

1. 将项目推到 GitHub 公开仓库
2. 用户直接安装：
```bash
/plugin install github.com/your-username/mindvaults-glean
```

### 创建自己的 Marketplace

1. 创建 `mindvaults-marketplace` 仓库
2. 添加 `.claude-plugin/marketplace.json`：
```json
{
  "plugins": {
    "mindvaults-glean": {
      "source": "github",
      "repo": "your-username/mindvaults-glean"
    }
  }
}
```
3. 用户注册并安装：
```bash
/plugin marketplace add your-username/mindvaults-marketplace
/plugin install mindvaults-glean@mindvaults-marketplace
```

### 用户安装后的首次配置

```bash
# 在 mindvaults 设置页获取 API Key 后
/mindvaults config --endpoint https://my-instance.com --api-key mv-dep-xxx
/mindvaults on
/mindvaults status
```

---

## 数据流

```
Claude Code 对话回合结束
        │
        ▼
   Stop Hook 触发
        │
        ▼
   push-qa.sh 检查 enabled 开关
        │ enabled=false → 静默退出
        │ enabled=true
        ▼
   提取 QA 对 + session_id
        │
        ▼
   POST /api/v1/kb/external/push
   Header: Authorization: Bearer <api_key>
   Body: { platform, qa_pairs }
        │
        ▼
   mindvaults 沉淀库（去重 + 入库）
        │
        ▼
   定时 LLM 提炼 → insight → 审核中心 → 目标 KB
```

---

## 安全

- API Key 存在用户本机 `~/.claude/mindvaults/config.json`
- 对话内容 HTTPS 加密传输
- Key 仅限推送权限，不暴露其他 API
- 用户可通过 `/mindvaults off` 随时暂停
- Key 泄露后可在 mindvaults 设置页轮换

---

## 后续规划

- [ ] Copilot CLI 适配（同架构，改 platform 标识）
- [ ] ChatGPT Plugin 适配
- [ ] 支持完整多轮会话推送（`collect_full_session: true`）
- [ ] 推送仪表板（skill 端 `/mindvaults dashboard`）
- [ ] 重试队列自动恢复
