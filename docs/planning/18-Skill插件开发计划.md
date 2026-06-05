# Skill 插件开发计划

> 状态：🔍 待审批 | 创建：2026-06-05 | 关联：[[17-Skill插件开发指南]] [[17-Skill插件-知识沉淀收集]]

## 设计审查：原方案 vs 最佳实践

对照 `writing-skills` 规范和社区实践，对 `17-Skill插件开发指南.md` 的审查结果：

### 保留的设计 ✅

| 设计 | 理由 |
|------|------|
| Stop Hook + push-qa.sh | 正确的自动化入口，`${CLAUDE_STOP_HOOK_ACTIVE}` 防循环是标准模式 |
| 4 个用户命令（on/off/push/status） | 用户可控、可感知，符合 Skill 设计原则 |
| plugin.json 打包结构 | 社区标准格式 |
| `~/.claude/mindvaults/config.json` 本地配置 | 隐私正确：Key 不离开用户机器 |

### 改进的设计 🔧

| 问题 | 原方案 | 改进 |
|------|--------|------|
| description 触发语 | "知识沉淀收集器。每次对话结束后..." — 描述做了什么 | 改为 "Use when..." 格式，描述触发条件而非工作流 |
| 文档结构 | 全部内容堆在 SKILL.md | 渐进披露：SKILL.md 核心 + `references/config-guide.md` 详细参考 |
| 脚本健壮性 | 无 jq 检查、无 curl 超时 | 加依赖检查、`--connect-timeout`、`--max-time` |
| Hook 配置 | 无 timeout | 加 `"timeout": 15000` |
| 命令格式 | 中文 body | 英文 body + 中文标题（跨环境兼容） |
| SKILL.md body | ~80 行，混入配置细节 | 压缩到 ~45 行，配置细节移入 references |
| 缺少测试 | 无 | 测试 shell 脚本 + subagent 验证 SKILL.md |

---

## 目录结构（最终版）

```
mindvaults-glean/
├── SKILL.md                    # 核心：概述 + 命令表 + 快速配置
├── references/
│   └── config-guide.md         # 详细配置参考（endpoint、Key、轮换）
├── hooks/
│   ├── hooks.json              # Stop hook 配置
│   └── push-qa.sh              # 推送脚本（健壮版）
├── commands/
│   ├── mindvaults-on.md        # /mindvaults on
│   ├── mindvaults-off.md       # /mindvaults off
│   ├── mindvaults-push.md      # /mindvaults push
│   └── mindvaults-status.md    # /mindvaults status
├── .claude-plugin/
│   └── plugin.json
└── README.md
```

---

## SKILL.md 设计

### Frontmatter

```yaml
---
name: mindvaults-glean
description: |
  Use when the user asks about knowledge collection, conversation archiving,
  saving Q&A, syncing to knowledge base, or mentions mindvaults / 知识沉淀 /
  保存对话 / 同步知识库. Also use when configuring automatic dialog capture
  to a private knowledge vault.
user-invocable: true
---
```

关键改进：description 只写触发条件，不写工作流（CSO 原则）— 避免 Claude 只看 description 跳过 body。

### Body（压缩到 ~45 行）

```markdown
# mindvaults 知识沉淀同步

每次对话结束自动推送 QA 到 mindvaults 沉淀库。用户可通过命令控制开关。

## 命令

| 命令 | 功能 |
|------|------|
| `/mindvaults on` | 开启自动收集 |
| `/mindvaults off` | 暂停收集 |
| `/mindvaults push` | 手动推送当前会话 |
| `/mindvaults status` | 查看今日统计 |

## 首次配置

1. 在 mindvaults 设置页获取 API Key
2. 创建 `~/.claude/mindvaults/config.json`
3. 运行 `/mindvaults on`

> 详细配置选项见 `references/config-guide.md`
```

---

## 脚本改进

`push-qa.sh` 对比原方案的关键改动：

| 改动 | 说明 |
|------|------|
| `jq` 依赖检查 | 脚本开头 `command -v jq >/dev/null`，缺失时 exit 1 |
| curl `--connect-timeout 10 --max-time 30` | 避免网络卡死 |
| 响应校验 | 检查 `"code":0` 而非仅 HTTP 200 |
| 幂等写入 | 状态文件使用 `mv` 原子替换 |
| 日志 | 仅关键路径（成功静默，失败记录） |

---

## 开发步骤

| Step | 内容 | 文件 | 估时 |
|------|------|------|------|
| 1 | 创建目录结构 + SKILL.md | SKILL.md | 15min |
| 2 | 编写健壮版 push-qa.sh | hooks/push-qa.sh | 20min |
| 3 | 编写 hooks.json | hooks/hooks.json | 5min |
| 4 | 编写 4 个命令 | commands/*.md | 15min |
| 5 | 编写 plugin.json | .claude-plugin/plugin.json | 5min |
| 6 | 编写 config-guide.md | references/config-guide.md | 15min |
| 7 | 编写 README.md | README.md | 10min |
| 8 | Shell 脚本测试 + 端到端验证 | — | 20min |
| **合计** | | | **~1.5h** |

---

## 待确认事项

1. **目录位置**：skill 放在 `mindvaults-glean/`（项目根目录），最终发布到独立 GitHub 仓库？
2. **hook 事件**：用 `Stop`（对话回合结束）还是 `SubagentStop`（子 agent 结束）？原方案用 Stop，我认为正确——主对话结束才推送
3. **命令语言**：body 用英文（跨环境），标题保留中文，OK？
4. **脚本测试**：写一个独立的 test-push.sh 来验证脚本逻辑，还是依赖端到端手动测试？
