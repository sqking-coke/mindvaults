import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import KbDocument
from app.core.exceptions import DocNotFoundError
from app.schemas.document import DocumentUpdateRequest
from app.services.document_service import (
    get_document,
    list_documents,
    update_document,
    hard_delete_document,
    _validate_file,
)
from app.core.exceptions import DocFormatUnsupportedError


async def _make_document(db: AsyncSession, name: str = "test.txt", doc_type: str = "txt",
                         file_path: str = "/tmp/test.txt", status: int = 1) -> KbDocument:
    doc = KbDocument(doc_name=name, doc_type=doc_type, file_path=file_path, status=status, chunk_count=0)
    db.add(doc)
    await db.flush()
    return doc


class TestValidateFile:
    def test_valid_extension(self):
        from fastapi import UploadFile
        from io import BytesIO
        f = UploadFile(filename="test.txt", file=BytesIO(b"hello"))
        assert _validate_file(f) == "txt"

    def test_empty_filename_raises(self):
        from fastapi import UploadFile
        from io import BytesIO
        f = UploadFile(filename="", file=BytesIO(b"hello"))
        with pytest.raises(DocFormatUnsupportedError):
            _validate_file(f)

    def test_unsupported_extension_raises(self):
        from fastapi import UploadFile
        from io import BytesIO
        f = UploadFile(filename="test.exe", file=BytesIO(b"hello"))
        with pytest.raises(DocFormatUnsupportedError):
            _validate_file(f)

    def test_no_extension(self):
        from fastapi import UploadFile
        from io import BytesIO
        f = UploadFile(filename="Makefile", file=BytesIO(b"hello"))
        with pytest.raises(DocFormatUnsupportedError):
            _validate_file(f)


class TestGetDocument:
    @pytest.mark.asyncio
    async def test_get_existing_document(self, db_session: AsyncSession):
        doc = await _make_document(db_session)
        await db_session.commit()

        result = await get_document(db_session, doc.id)
        assert result.id == doc.id
        assert result.doc_name == "test.txt"
        assert result.status == 1

    @pytest.mark.asyncio
    async def test_get_nonexistent_raises(self, db_session: AsyncSession):
        with pytest.raises(DocNotFoundError):
            await get_document(db_session, 99999)

    @pytest.mark.asyncio
    async def test_get_soft_deleted_raises(self, db_session: AsyncSession):
        from datetime import datetime, timezone
        doc = KbDocument(doc_name="deleted.txt", doc_type="txt", file_path="/tmp/deleted.txt",
                         status=1, chunk_count=0, deleted_at=datetime.now(timezone.utc))
        db_session.add(doc)
        await db_session.commit()

        with pytest.raises(DocNotFoundError):
            await get_document(db_session, doc.id)


class TestListDocuments:
    @pytest.mark.asyncio
    async def test_empty_list(self, db_session: AsyncSession):
        result = await list_documents(db_session)
        assert result.total == 0
        assert result.items == []

    @pytest.mark.asyncio
    async def test_pagination(self, db_session: AsyncSession):
        for i in range(5):
            await _make_document(db_session, name=f"doc{i}.txt", file_path=f"/tmp/doc{i}.txt")
        await db_session.commit()

        result = await list_documents(db_session, page=1, page_size=2)
        assert result.total == 5
        assert len(result.items) == 2
        assert result.page == 1
        assert result.page_size == 2

    @pytest.mark.asyncio
    async def test_excludes_soft_deleted(self, db_session: AsyncSession):
        from datetime import datetime, timezone
        active = await _make_document(db_session, name="active.txt")
        deleted = KbDocument(doc_name="deleted.txt", doc_type="txt", file_path="/tmp/deleted.txt",
                             status=1, chunk_count=0, deleted_at=datetime.now(timezone.utc))
        db_session.add(deleted)
        await db_session.commit()

        result = await list_documents(db_session)
        assert result.total == 1
        assert result.items[0].id == active.id


class TestUpdateDocument:
    @pytest.mark.asyncio
    async def test_update_name(self, db_session: AsyncSession):
        doc = await _make_document(db_session)
        await db_session.commit()

        req = DocumentUpdateRequest(doc_name="renamed.txt")
        result = await update_document(db_session, doc.id, req)
        assert result.doc_name == "renamed.txt"

    @pytest.mark.asyncio
    async def test_update_nonexistent_raises(self, db_session: AsyncSession):
        req = DocumentUpdateRequest(doc_name="nope.txt")
        with pytest.raises(DocNotFoundError):
            await update_document(db_session, 99999, req)


class TestSoftDeleteDocument:
    @pytest.mark.asyncio
    async def test_soft_delete(self, db_session: AsyncSession):
        doc = await _make_document(db_session)
        await db_session.commit()

        await hard_delete_document(db_session, doc.id)
        # After soft delete, get should raise
        with pytest.raises(DocNotFoundError):
            await get_document(db_session, doc.id)

    @pytest.mark.asyncio
    async def test_soft_delete_nonexistent_raises(self, db_session: AsyncSession):
        with pytest.raises(DocNotFoundError):
            await hard_delete_document(db_session, 99999)
