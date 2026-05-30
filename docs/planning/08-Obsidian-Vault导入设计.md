# 08 - Obsidian Vault 导入设计

> 来源：docs/superpowers/specs/2026-05-30-obsidian-vault-scan-design.md | 状态：✅ 已实现

## 1. 需求概述

允许用户将本地 Obsidian Vault 目录的 `.md` 文件批量导入到指定知识库，复用现有摄入管道（解析 → 切片 → 向量化 → 入库）。

### 核心决策

| 决策项 | 选择 |
|--------|------|
| 导入方式 | 两种：路径扫描 + 文件夹拖拽上传 |
| 同步策略 | 一次性导入，变更后手动重新导入 |
| Obsidian 语法 | YAML frontmatter 解析存入 `doc_desc`，`[[wikilink]]` 转为纯文本 |
| 前端展示 | 复用现有文档列表，`source=obsidian` 区分 |

## 2. API 端点

### `POST /api/v1/kb/vaults/import` — 路径扫描

```json
// Request
{ "path": "/Users/xxx/MyObsidianVault", "source": "obsidian", "kb_id": 1 }
// Response
{
  "code": 0,
  "data": {
    "total_found": 142,
    "imported": 140,
    "failed": 2,
    "errors": [{ "file": "broken.md", "reason": "编码错误" }]
  }
}
```

### `POST /api/v1/kb/vaults/upload` — 拖拽上传

```
multipart/form-data: files[] + source + kb_id
```

## 3. 数据流

```
用户输入路径 / 拖入文件夹
  → 递归扫描 .md 文件（跳过 .obsidian / .git 等隐藏目录）
    → 每个文件:
      ① 读取内容
      ② 解析 YAML frontmatter → doc_desc
      ③ [[wikilink]] → 纯文本
      ④ 写入 uploads/ (UUID 文件名)
      ⑤ 创建 KbDocument (kb_id=X, source=obsidian)
      ⑥ 触发异步摄入 pipeline
    → 返回摘要
```

## 4. 前端交互

- KB 页面右侧 "批量导入 Obsidian Vault" 卡片
- 点击打开 VaultImportDialog 弹窗
- 两个 Tab：拖拽上传（推荐） / 路径扫描（极客模式）
- 导入完成展示结果摘要（总数、成功、失败明细）
