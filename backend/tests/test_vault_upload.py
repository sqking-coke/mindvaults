import json
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.document import KbDocument


class TestVaultUploadAPI:
    @pytest.mark.asyncio
    async def test_upload_vault_empty(self, client: AsyncClient):
        """测试上传不带任何文件的空请求或无有效.md文档的请求。"""
        # 1. 没有任何文件
        resp = await client.post(
            "/api/v1/kb/vaults/upload",
            files=[],
            data={"source": "obsidian"},
        )
        # FastAPI will return 422 since files are required
        assert resp.status_code == 422

        # 2. 只有非 .md 文件
        non_md_files = [
            ("files", ("image.png", b"fake png data", "image/png")),
            ("files", ("config.json", b"{}", "application/json")),
        ]
        resp = await client.post(
            "/api/v1/kb/vaults/upload",
            files=non_md_files,
            data={"source": "obsidian"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["code"] != 0  # 应该返回错误响应，因为过滤后没有 markdown 文件
        assert "未检测到任何 Markdown" in data["message"]

    @pytest.mark.asyncio
    async def test_upload_vault_success(self, client: AsyncClient, db: AsyncSession):
        """测试成功上传带有 wikilink 和 frontmatter 的 markdown 目录。"""
        md_content_1 = """---
title: My First Note
tags: [work, project]
date: 2026-05-30
---
# Hello
This is [[My Second Note|Second Note]] link and [[My Third Note#Heading]] reference.
"""
        md_content_2 = """---
title: My Second Note
---
# Welcome
Body text here.
"""
        
        vault_files = [
            ("files", ("MyVault/First Note.md", md_content_1.encode("utf-8"), "text/markdown")),
            ("files", ("MyVault/Folder/My Second Note.md", md_content_2.encode("utf-8"), "text/markdown")),
            ("files", ("MyVault/ignore_this.png", b"binary", "image/png")),  # 应该被自动过滤掉
        ]

        resp = await client.post(
            "/api/v1/kb/vaults/upload",
            files=vault_files,
            data={"source": "obsidian"},
        )
        
        assert resp.status_code == 200
        res_data = resp.json()
        assert res_data["code"] == 0
        
        data = res_data["data"]
        assert data["total_found"] == 2
        assert data["imported"] == 2
        assert data["failed"] == 0
        assert len(data["errors"]) == 0
        assert len(data["documents"]) == 2

        # 校验数据库中的文档和属性
        stmt = select(KbDocument).where(KbDocument.doc_type == "md")
        result = await db.execute(stmt)
        docs = result.scalars().all()
        
        assert len(docs) >= 2
        
        doc_names = [d.doc_name for d in docs]
        assert "First Note.md" in doc_names
        assert "My Second Note.md" in doc_names

        # 校验 wikilinks 规范化转换和相对路径存储
        for d in docs:
            desc = json.loads(d.doc_desc)
            assert desc["source"] == "obsidian"
            assert "relative_path" in desc
            assert desc["relative_path"].startswith("MyVault/")

            # 读取暂存文件，确认 wikilink 转换是否生效
            with open(d.file_path, "r", encoding="utf-8") as f:
                processed_content = f.read()
                
            if d.doc_name == "First Note.md":
                # [[My Second Note|Second Note]] -> Second Note
                assert "Second Note" in processed_content
                assert "[[My Second Note|Second Note]]" not in processed_content
                # [[My Third Note#Heading]] -> My Third Note → Heading
                assert "My Third Note → Heading" in processed_content
                assert "[[My Third Note#Heading]]" not in processed_content
