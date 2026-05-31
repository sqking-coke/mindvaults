"""Obsidian Vault 本地目录扫描导入服务。

提供目录递归扫描、YAML frontmatter 解析、wikilink 转换和批量导入编排。
"""

import json
import re
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import AsyncSessionLocal
from app.models.document import KbDocument, DOC_STATUS_PROCESSING
from app.services.ingestion_service import schedule_ingestion

# ── 常量 ────────────────────────────────────────────────────────
MAX_VAULT_FILES = 500
_WIKILINK_PATTERN = re.compile(r"(?<!\!)\[\[([^\[\]]+?)\]\]")
_EMBED_PATTERN = re.compile(r"!\[\[.*?\]\]")
_FRONTMATTER_PATTERN = re.compile(r"^---\s*\n(.*?)\n---", re.DOTALL)


# ── 目录扫描 ────────────────────────────────────────────────────

def scan_vault_directory(path: str, max_files: int = MAX_VAULT_FILES) -> list[Path]:
    """递归扫描目录，返回所有 .md 文件路径列表（上限 max_files）。

    Args:
        path: Vault 根目录绝对路径
        max_files: 扫描上限，防止超大 vault 阻塞

    Returns:
        .md 文件 Path 列表

    Raises:
        ValueError: path 不存在或不是目录
    """
    vault = Path(path).resolve()
    if not vault.exists():
        raise ValueError(f"路径不存在: {path}")
    if not vault.is_dir():
        raise ValueError(f"路径不是目录: {path}")

    md_files: list[Path] = []
    for file_path in vault.rglob("*.md"):
        if not file_path.is_file():
            continue
        # 跳过隐藏文件/目录下的 .md
        if any(part.startswith(".") for part in file_path.relative_to(vault).parts):
            continue
        md_files.append(file_path)
        if len(md_files) >= max_files:
            logger.warning(f"Vault 扫描达到上限 {max_files} 个文件，停止扫描")
            break

    logger.info(f"Vault 扫描完成: path={path} files={len(md_files)}")
    return md_files


# ── Frontmatter 解析 ────────────────────────────────────────────

def parse_frontmatter(content: str) -> dict[str, Any] | None:
    """解析 YAML frontmatter（``---`` 分隔块），提取 title / tags / date / aliases。

    Args:
        content: 原始 Markdown 全文

    Returns:
        解析后的 dict（仅含目标字段）或 None（无 frontmatter / 解析失败）
    """
    fm_match = _FRONTMATTER_PATTERN.match(content)
    if not fm_match:
        return None

    yaml_str = fm_match.group(1)
    try:
        import yaml

        fm = yaml.safe_load(yaml_str)
    except ImportError:
        logger.error("pyyaml 未安装，无法解析 frontmatter")
        return None
    except Exception as exc:
        logger.warning(f"YAML frontmatter 解析失败: {exc}")
        return None

    if not isinstance(fm, dict):
        return None

    result: dict[str, Any] = {}
    for key in ("title", "tags", "date", "aliases"):
        if key in fm:
            result[key] = fm[key]

    return result if result else None


# ── Wikilink 转换 ───────────────────────────────────────────────

def normalize_wikilinks(content: str) -> str:
    """将 Obsidian ``[[wikilink]]`` 语法转换为纯文本。

    转换规则（按设计文档）:
    - ``[[Page Name]]`` → ``Page Name``
    - ``[[Page|Alias]]`` → ``Alias``
    - ``[[Page#heading]]`` → ``Page → heading``
    - ``![[...]]`` 嵌入链接保留原样

    Args:
        content: 原始 Markdown 全文

    Returns:
        wikilink 已规范化的文本
    """

    # 先保护嵌入链接 ![[...]]，防止被普通 wikilink 正则误伤
    embeds: list[str] = []
    PLACEHOLDER = "___EMBED_WL_"

    def _save_embed(match: re.Match) -> str:
        embeds.append(match.group(0))
        return f"{PLACEHOLDER}{len(embeds) - 1}___"

    content = _EMBED_PATTERN.sub(_save_embed, content)

    def _convert(match: re.Match) -> str:
        target = match.group(1).strip()
        # 有 alias → 使用 alias
        if "|" in target:
            return target.rsplit("|", 1)[-1].strip()
        # 有 heading → 展示为 "Page → heading"
        if "#" in target:
            page, heading = target.split("#", 1)
            return f"{page.strip()} → {heading.strip()}"
        return target

    content = _WIKILINK_PATTERN.sub(_convert, content)

    # 恢复嵌入链接
    for i, embed in enumerate(embeds):
        content = content.replace(f"{PLACEHOLDER}{i}___", embed)

    return content


# ── 批量导入编排 ────────────────────────────────────────────────

async def import_vault(
    db: AsyncSession, vault_path: str, source: str = "obsidian", kb_id: int = 1
) -> dict[str, Any]:
    """扫描 Vault → 解析 frontmatter → 处理 wikilink → 写入暂存区 → 调度摄入管道。

    流程:
    1. 递归扫描目录下所有 .md 文件（上限 {MAX_VAULT_FILES}）
    2. 逐文件：读取 → 解析 frontmatter → 规范化 wikilink
    3. 将处理后的文本写入 UPLOAD_DIR 暂存区
    4. 创建 KbDocument 记录，doc_desc 存入 frontmatter JSON
    5. 通过 schedule_ingestion() 调度后台摄入管道
    6. 汇总结果并返回

    Args:
        db: 异步数据库会话
        vault_path: Vault 根目录路径
        source: 来源标识（默认 "obsidian"）

    Returns:
        {
            "total_found": int,    # 扫描到的 .md 文件总数
            "imported": int,       # 成功导入数
            "failed": int,         # 失败数
            "errors": [{"file": str, "reason": str}],
            "documents": [{"id": int, "doc_name": str, "status": int}],
        }
    """
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # 1. 扫描目录
    try:
        md_files = scan_vault_directory(vault_path)
    except ValueError as exc:
        logger.error(f"Vault 目录无效: {exc}")
        return {
            "total_found": 0,
            "imported": 0,
            "failed": 1,
            "errors": [{"file": vault_path, "reason": str(exc)}],
            "documents": [],
        }

    if not md_files:
        logger.info(f"Vault 目录无 .md 文件: {vault_path}")
        return {
            "total_found": 0,
            "imported": 0,
            "failed": 0,
            "errors": [],
            "documents": [],
        }

    documents: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    imported = 0
    failed = 0

    for file_path in md_files:
        try:
            # 2. 读取文件
            raw = file_path.read_text(encoding="utf-8", errors="replace")

            # 3. 解析 frontmatter
            fm = parse_frontmatter(raw)

            # 4. 规范化 wikilink
            processed = normalize_wikilinks(raw)

            # 5. 构建 doc_desc（JSON）
            desc_parts: dict[str, Any] = {"source": source}
            if fm:
                desc_parts["frontmatter"] = fm
            doc_desc = json.dumps(desc_parts, ensure_ascii=False, default=str)

            # 6. 将处理后的文本写入暂存区
            stored_name = f"{uuid.uuid4().hex}.md"
            dest_path = upload_dir / stored_name
            dest_path.write_text(processed, encoding="utf-8", errors="replace")

            # 7. 创建文档记录
            doc = KbDocument(
                kb_id=kb_id,
                source=source,
                doc_name=file_path.name,
                doc_type="md",
                doc_desc=doc_desc,
                file_path=str(dest_path),
                status=DOC_STATUS_PROCESSING,
                chunk_count=0,
                file_size=dest_path.stat().st_size,
            )
            db.add(doc)
            await db.flush()

            # 8. 调度后台摄入管道（使用独立会话）
            schedule_ingestion(AsyncSessionLocal, doc.id, "md", str(dest_path))

            documents.append(
                {
                    "id": doc.id,
                    "doc_name": doc.doc_name,
                    "status": doc.status,
                }
            )
            imported += 1
            logger.debug(f"Vault 文件已暂存: {file_path.name} → doc_id={doc.id}")

        except Exception as exc:
            logger.error(f"Vault 文件导入失败: {file_path.name} — {exc}")
            await db.rollback()  # 重置损坏的会话状态
            errors.append({"file": file_path.name, "reason": str(exc)})
            failed += 1

    await db.commit()

    result = {
        "total_found": len(md_files),
        "imported": imported,
        "failed": failed,
        "errors": errors,
        "documents": documents,
    }

    logger.info(
        f"Vault 导入完成: path={vault_path} "
        f"total={len(md_files)} imported={imported} failed={failed}"
    )
    return result


async def import_vault_files(
    db: AsyncSession, files: list[UploadFile], source: str = "obsidian", kb_id: int = 1
) -> dict[str, Any]:
    """处理前端上传的 Vault 多文件流，解析 frontmatter 与 wikilinks 并批量导入入库。

    Args:
        db: 异步数据库会话
        files: 上传的文件列表 (包含 webkitRelativePath 在 filename 中)
        source: 来源标识（默认 "obsidian"）

    Returns:
        与 import_vault 一致的汇总字典结构
    """
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    documents: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    imported = 0
    failed = 0

    for file in files:
        try:
            # 1. 读取文件二进制内容并转码为 utf-8
            content_bytes = await file.read()
            raw = content_bytes.decode("utf-8", errors="replace")

            # 2. 解析 frontmatter
            fm = parse_frontmatter(raw)

            # 3. 规范化 wikilink
            processed = normalize_wikilinks(raw)

            # 4. 构建 doc_desc (JSON)
            desc_parts: dict[str, Any] = {"source": source}
            if fm:
                desc_parts["frontmatter"] = fm
            if file.filename:
                desc_parts["relative_path"] = file.filename
            doc_desc = json.dumps(desc_parts, ensure_ascii=False, default=str)

            # 5. 将处理后的文本写入暂存区
            stored_name = f"{uuid.uuid4().hex}.md"
            dest_path = upload_dir / stored_name
            dest_path.write_text(processed, encoding="utf-8", errors="replace")

            # 6. 获取文档展示名称
            base_name = Path(file.filename).name if file.filename else "untitled.md"

            # 7. 创建数据库文档记录
            doc = KbDocument(
                kb_id=kb_id,
                source=source,
                doc_name=base_name,
                doc_type="md",
                doc_desc=doc_desc,
                file_path=str(dest_path),
                status=DOC_STATUS_PROCESSING,
                chunk_count=0,
                file_size=dest_path.stat().st_size,
            )
            db.add(doc)
            await db.flush()

            # 8. 调度后台摄入管道
            schedule_ingestion(AsyncSessionLocal, doc.id, "md", str(dest_path))

            documents.append(
                {
                    "id": doc.id,
                    "doc_name": doc.doc_name,
                    "status": doc.status,
                }
            )
            imported += 1
            logger.debug(f"Vault 上传文件已暂存: {base_name} → doc_id={doc.id}")

        except Exception as exc:
            logger.error(f"Vault 上传文件导入失败: {file.filename} — {exc}")
            await db.rollback()  # 重置损坏的会话状态
            errors.append({"file": file.filename or "unknown", "reason": str(exc)})
            failed += 1

    await db.commit()

    result = {
        "total_found": len(files),
        "imported": imported,
        "failed": failed,
        "errors": errors,
        "documents": documents,
    }

    logger.info(
        f"Vault 上传导入完成: total={len(files)} imported={imported} failed={failed}"
    )
    return result

