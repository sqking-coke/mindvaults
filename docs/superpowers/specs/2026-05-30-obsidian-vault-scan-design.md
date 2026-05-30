# Obsidian Vault 本地目录扫描导入 — 设计文档

**日期**: 2026-05-30  
**关联 Issue**: COKE-59  
**状态**: 待确认

---

## 1. 需求概述

允许用户在 MindVault 中选择本地 Obsidian vault 目录，系统递归扫描该目录下所有 `.md` 文件，批量导入到知识库中，复用现有摄入管道（解析 → 切片 → 向量化 → 入库）。

### 核心决策

| 决策项 | 选择 |
|--------|------|
| 导入方式 | 本地目录扫描（输入路径） |
| 同步策略 | 一次性导入，变更后手动重新导入 |
| Obsidian 语法处理 | 保留元数据：YAML frontmatter 解析存入 doc_desc，`[[wikilink]]` 转为纯文本 |
| 前端展示 | 复用现有文档列表，加 `source=obsidian` 标识区分 |

---

## 2. 架构设计

### 2.1 整体数据流

```
用户输入目录路径 → API 接收路径 → 递归扫描 .md 文件
  → 每个文件: 解析 frontmatter → 处理 wikilink → 写入物理文件
  → 走现有 ingest_document() 管道 → 向量化入库
  → 返回导入摘要（文件数、成功/失败数）
```

### 2.2 不改动现有组件

- `KbDocument` 模型：复用现有字段，`doc_desc` 存 frontmatter JSON
- `ingestion_service.py`：不修改，完全复用
- `chunking_service.py`：不修改
- `embedding_service.py`：不修改
- 文档列表 API：不修改

### 2.3 新增组件

```
backend/
├── app/
│   ├── api/v1/
│   │   └── vault.py              # NEW: vault scan endpoint
│   ├── services/
│   │   └── vault_service.py      # NEW: directory scan + frontmatter parsing
│   ├── schemas/
│   │   └── vault.py              # NEW: request/response schemas
│   └── api/v1/router.py          # MODIFY: register vault router

src/
├── components/kb/
│   └── VaultImportDialog.tsx     # NEW: vault import modal
└── context/
    └── mindvaultsContext.tsx     # MODIFY: add importVault action
```

---

## 3. 后端设计

### 3.1 API 端点

**`POST /api/v1/kb/vaults/import`**

请求体：
```json
{
  "path": "/Users/xxx/Documents/ObsidianVault",
  "source": "obsidian"
}
```

响应体：
```json
{
  "code": 200,
  "data": {
    "total_found": 42,
    "imported": 40,
    "failed": 2,
    "errors": [
      {"file": "broken.md", "reason": "文件读取失败"}
    ],
    "documents": [
      {"id": 101, "doc_name": "note1.md", "status": 1},
      ...
    ]
  }
}
```

### 3.2 Vault Service 核心逻辑

```python
# vault_service.py

async def scan_vault_directory(path: str) -> list[Path]:
    """递归扫描目录，返回所有 .md 文件路径列表"""
    
async def parse_frontmatter(content: str) -> dict | None:
    """解析 YAML frontmatter，返回 dict（title/tags/date 等）"""
    
async def normalize_wikilinks(content: str) -> str:
    """将 [[Page Name]] 和 [[Page|Alias]] 转换为纯文本"""
    
async def import_vault(db: AsyncSession, vault_path: str, source: str) -> VaultImportResponse:
    """扫描 → 解析 → 写入临时文件 → 调度摄入管道"""
```

### 3.3 Frontmatter 解析规则

- 匹配 `---\n...\n---` 格式的 YAML 头
- 提取字段：`title`、`tags`、`date`、`aliases`
- 序列化存入 `KbDocument.doc_desc`（JSON 格式）
- 保留原始 frontmatter 在文档正文中（不影响现有解析）

### 3.4 Wikilink 处理规则

| 原始语法 | 转换为 |
|----------|--------|
| `[[Page Name]]` | `Page Name` |
| `[[Page\|Alias]]` | `Alias` |
| `[[Page#heading]]` | `Page → heading` |
| `![[]]` (嵌入) | 保留原样（无法解析外部文件） |

### 3.5 安全约束

- 路径校验：必须是存在的目录，拒绝文件路径
- 目录大小限制：最多扫描 500 个 `.md` 文件（可配置）
- 单文件大小限制：复用 `MAX_UPLOAD_SIZE_MB`（默认 50MB）
- Docker 部署注意：需要在 `docker-compose.yml` 中挂载宿主目录

---

## 4. 前端设计

### 4.1 VaultImportDialog 组件

位置：知识库管理页面 `UploadZone` 旁边新增按钮

交互流程：
1. 点击「导入 Obsidian Vault」按钮
2. 弹出 Modal，输入本地目录路径（文本输入框 + 文件夹选择器）
3. 点击「开始导入」
4. 显示导入进度（已扫描 N 个文件...）
5. 完成后关闭 Modal，刷新文档列表

### 4.2 文档列表展示

导入的文档在现有 `DocumentTable` 中展示，复用现有列表结构：
- 文件名：原始 `.md` 文件名
- 类型标签：`md` + 🗂️ vault 图标
- 描述列：显示 frontmatter 中的 title（如有）
- 来源标识：通过 `doc_desc` 中的 `source` 字段区分

### 4.3 新增 API 调用（ragService.ts）

```typescript
// ragService.ts
export async function importVault(
  path: string,
  signal?: AbortSignal,
): Promise<VaultImportResponse> {
  return api.post<VaultImportResponse>("/api/v1/kb/vaults/import", { path }, signal);
}
```

---

## 5. 数据库

**无需 Schema 变更**。`KbDocument` 现有字段完全够用：

| 字段 | 用途 |
|------|------|
| `doc_name` | 原始 `.md` 文件名 |
| `doc_type` | `"md"` |
| `doc_desc` | JSON: `{"source": "obsidian", "frontmatter": {"title": "...", "tags": [...]}}` |
| `file_path` | 复制的临时文件路径（原始文件不动） |
| `status` | 复用现有状态机（processing → completed） |

---

## 6. 任务拆分

### T1: 后端 — Vault Service（核心逻辑）
- 新建 `backend/app/services/vault_service.py`
- 实现：目录扫描、frontmatter 解析、wikilink 转换、批量导入编排
- 依赖：无新增依赖（YAML 解析用内置 `re` 或新增 `pyyaml`）

### T2: 后端 — Vault API 端点
- 新建 `backend/app/api/v1/vault.py` + `backend/app/schemas/vault.py`
- 实现 `POST /api/v1/kb/vaults/import` 端点
- 在 `router.py` 注册路由

### T3: 前端 — VaultImportDialog 组件
- 新建 `src/components/kb/VaultImportDialog.tsx`
- 路径输入框 + 导入按钮 + 进度反馈
- 调用 `importVault()` API

### T4: 前端 — 集成到知识库页面
- 在 `UploadZone` 旁边添加导入入口按钮
- 在 `mindvaultsContext.tsx` 添加 `importVault` action
- 导入完成后自动刷新文档列表

### T5: Docker 部署适配（如适用）
- `docker-compose.yml` 添加 volumes 挂载说明
- 文档更新

---

## 7. 风险和注意事项

- **路径可访问性**：Docker 容器内需要能访问宿主目录，需卷挂载
- **编码问题**：Obsidian 文件可能有各种编码，统一用 UTF-8 with `errors="replace"`
- **大 Vault 性能**：限制单次导入最多 500 个文件，大 vault 可分批导入
- **重复导入**：不做去重检测，每次导入都是新增记录；用户需手动删除旧记录后再重新导入
