"""MCP 工具实现 — 薄封装层，调已有 service 层。

每个工具自管理 DB 会话（不依赖 FastAPI DI），
MCP Server 通过 stdio 运行，需要独立的数据库连接。
"""

import json
import uuid
from pathlib import Path
from typing import Any

from loguru import logger

from app.config import settings
from app.core.database import AsyncSessionLocal


# ═══════════════════════════════════════════════════════════════
# 工具注册
# ═══════════════════════════════════════════════════════════════

def register_tools(mcp) -> None:
    """将所有工具注册到 FastMCP 实例。"""

    # 所有 MCP 工具统一标记来源为 'mcp'
    def _set_mcp_source():
        from app.services.monitor_service import set_event_source
        set_event_source("mcp")

    # ── 1. list_knowledge_bases ──────────────────────────────

    @mcp.tool()
    async def list_knowledge_bases() -> str:
        """列出所有知识库，含文档数量和字符总量。"""
        _set_mcp_source()
        from app.services.kb_service import list_kbs

        async with AsyncSessionLocal() as db:
            kbs = await list_kbs(db)
            await db.commit()

        if not kbs:
            return "📚 暂无知识库。请先通过 Web 端创建知识库并上传文档。"

        lines = ["| ID | 名称 | 文档数 | 字符总量 |", "|----|------|--------|----------|"]
        for kb in kbs:
            lines.append(
                f"| {kb['id']} | {kb['name']} | {kb['doc_count']} | "
                f"{kb.get('total_chars', 0):,} |"
            )

        return "## 知识库列表\n\n" + "\n".join(lines)

    # ── 2. chat_with_kb ─────────────────────────────────────

    @mcp.tool()
    async def chat_with_kb(question: str, kb_id: int | None = None) -> str:
        """向知识库提问，RAG 检索 + LLM 生成回答。

        Args:
            question: 用户的问题
            kb_id: 知识库 ID。None=自动路由匹配，0=全库搜索
        """
        _set_mcp_source()
        from app.schemas.chat import ChatRequest
        from app.services.chat_service import chat_stream

        session_id = f"mcp-{uuid.uuid4().hex[:8]}"
        req = ChatRequest(question=question, session_id=session_id, kb_id=kb_id)

        answer_parts: list[str] = []
        ref_chunks: list[dict] = []
        routing_info: str = ""

        try:
            async with AsyncSessionLocal() as db:
                async for event_type, data_str in chat_stream(db, req):
                    data = json.loads(data_str)

                    if event_type == "progress":
                        phase = data.get("phase", "")
                        if phase == "routing":
                            routing_info = (
                                f"🔍 匹配知识库: {data.get('kb_name', '自动')} "
                                f"(方式: {data.get('method', 'auto')})"
                            )
                    elif event_type == "token":
                        answer_parts.append(data.get("content", ""))
                    elif event_type == "done":
                        ref_chunks = data.get("ref_chunks", [])
                    elif event_type == "error":
                        await db.rollback()
                        return f"❌ 问答出错: {data.get('message', '未知错误')}"

                await db.commit()

        except Exception as exc:
            logger.error(f"mcp_chat_failed error={exc}")
            return f"❌ 知识库问答失败: {exc}"

        # 组装回答
        answer = "".join(answer_parts).strip()
        if not answer:
            return "⚠️ 未检索到相关知识。请尝试换个问法或上传相关文档。"

        # 添加路由信息
        if routing_info:
            answer = routing_info + "\n\n" + answer

        # 添加引用来源
        if ref_chunks:
            sources = "\n\n---\n### 📖 引用来源\n"
            for i, chunk in enumerate(ref_chunks[:5], 1):
                src = f"{i}. **{chunk.get('doc_name', '未知')}**"
                if chunk.get("page"):
                    src += f" (第{chunk['page']}页)"
                src += f" — 匹配度 {chunk.get('similarity', 0):.1%}"
                sources += src + "\n"
            answer += sources

        return answer

    # ── 3. upload_document ──────────────────────────────────

    @mcp.tool()
    async def upload_document(file_path: str, kb_id: int) -> str:
        """上传文档到知识库，自动解析、清洗、切片、向量化。

        Args:
            file_path: 本地文件路径
            kb_id: 目标知识库 ID
        """
        _set_mcp_source()
        from app.services.document_service import upload_documents
        from fastapi import UploadFile

        path = Path(file_path).expanduser().resolve()
        if not path.exists():
            return f"❌ 文件不存在: {file_path}"
        if not path.is_file():
            return f"❌ 路径不是文件: {file_path}"

        ext = path.suffix.lower().lstrip(".")
        allowed = {"txt", "md", "pdf", "docx", "doc"}
        if ext not in allowed:
            return f"❌ 不支持的文件格式: .{ext}（支持: {', '.join(sorted(allowed))}）"

        file_size = path.stat().st_size
        max_size = 50 * 1024 * 1024  # 50MB
        if file_size > max_size:
            return f"❌ 文件过大: {file_size / 1024 / 1024:.1f}MB（限制 50MB）"

        try:
            # 构造 UploadFile对象
            with open(path, "rb") as f:
                content = f.read()

            from io import BytesIO
            upload_file = UploadFile(
                filename=path.name,
                file=BytesIO(content),
                headers={"content-type": "application/octet-stream"},
            )

            async with AsyncSessionLocal() as db:
                result = await upload_documents(db, [upload_file], kb_id)
                await db.commit()

            uploaded = result.documents[0] if result.documents else None
            if uploaded:
                return (
                    f"✅ 文档已上传\n"
                    f"- 文件名: {uploaded.doc_name}\n"
                    f"- 类型: .{ext}\n"
                    f"- 大小: {file_size / 1024:.1f}KB\n"
                    f"- 知识库 ID: {kb_id}\n"
                    f"- 状态: 摄入中（异步处理，稍后可通过 list_documents 查看状态）"
                )
            return "⚠️ 文档上传未返回结果，请检查日志"

        except Exception as exc:
            logger.error(f"mcp_upload_failed path={file_path} kb_id={kb_id} error={exc}")
            return f"❌ 上传失败: {exc}"

    # ── 4. list_documents ───────────────────────────────────

    @mcp.tool()
    async def list_documents(kb_id: int, status: str | None = None) -> str:
        """列出知识库中的文档。

        Args:
            kb_id: 知识库 ID
            status: 可选过滤 — completed / processing / failed
        """
        _set_mcp_source()
        from app.services.document_service import list_documents

        async with AsyncSessionLocal() as db:
            result = await list_documents(db, page=1, page_size=50, kb_id=kb_id)
            await db.commit()

        docs = result.docs
        if status:
            status_map = {"completed": 2, "processing": 1, "failed": 0, "disabled": 3}
            status_code = status_map.get(status)
            if status_code is not None:
                docs = [d for d in docs if d.status == status_code]

        if not docs:
            status_text = f"（状态: {status}）" if status else ""
            return f"📭 知识库 {kb_id} 暂无文档{status_text}。"

        lines = [
            f"## 知识库 {kb_id} 文档列表\n",
            "| ID | 文件名 | 类型 | 状态 | 切片数 |",
            "|----|--------|------|------|--------|",
        ]
        status_names = {0: "❌ 失败", 1: "🔄 处理中", 2: "✅ 完成", 3: "⏸️ 已禁用"}
        for doc in docs:
            s_name = status_names.get(doc.status, f"未知({doc.status})")
            lines.append(
                f"| {doc.id} | {doc.doc_name} | {doc.doc_type} "
                f"| {s_name} | {doc.chunk_count} |"
            )

        return "\n".join(lines)

    # ── 5. get_document_status ──────────────────────────────

    @mcp.tool()
    async def get_document_status(doc_id: int) -> str:
        """查询单个文档的摄入状态。

        Args:
            doc_id: 文档 ID
        """
        _set_mcp_source()
        from app.services.document_service import get_document

        async with AsyncSessionLocal() as db:
            doc = await get_document(db, doc_id)
            await db.commit()

        status_names = {0: "❌ 失败", 1: "🔄 处理中", 2: "✅ 完成", 3: "⏸️ 已禁用"}
        status_detail = ""
        if doc.status_detail and isinstance(doc.status_detail, dict):
            phase = doc.status_detail.get("phase", "")
            if phase:
                status_detail = f"\n- 当前阶段: {phase}"

        return (
            f"## 文档 #{doc.id} 状态\n\n"
            f"- 文件名: {doc.doc_name}\n"
            f"- 类型: {doc.doc_type}\n"
            f"- 知识库: {doc.kb_id}\n"
            f"- 状态: {status_names.get(doc.status, f'未知({doc.status})')}\n"
            f"- 切片数: {doc.chunk_count}"
            f"{status_detail}"
        )
