"""Tests for external push service — Skill plugin entry point."""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_config import SystemConfig
from app.models.knowledge_base import KnowledgeBase
from app.models.external_entry import KbExternalEntry
from app.services.external_push_service import (
    push_external_entries,
    get_external_config,
    rotate_external_key,
    _validate_external_key,
    generate_api_key,
    _SYSTEM_KB_ID,
    _API_KEY_PREFIX,
)


async def _ensure_system_kb(db_session: AsyncSession) -> KnowledgeBase:
    """Ensure system KB (id=1) exists for FK constraint."""
    kb = await db_session.get(KnowledgeBase, _SYSTEM_KB_ID)
    if kb is None:
        kb = KnowledgeBase(id=_SYSTEM_KB_ID, name="系统库", kb_type="general")
        db_session.add(kb)
        await db_session.flush()
    return kb


class TestGenerateApiKey:
    def test_prefix(self):
        key = generate_api_key()
        assert key.startswith(_API_KEY_PREFIX)

    def test_length(self):
        key = generate_api_key()
        # prefix(7) + 48 hex chars = 55
        assert len(key) == 7 + 48

    def test_uniqueness(self):
        keys = {generate_api_key() for _ in range(10)}
        assert len(keys) == 10


class TestPushExternalEntries:
    @pytest.mark.asyncio
    async def test_push_single_qa(self, db_session: AsyncSession):
        await _ensure_system_kb(db_session)
        result = await push_external_entries(
            db_session,
            platform="claude_code",
            session_id="sess-001",
            qa_pairs=[{"question": "什么是 GIL", "answer": "GIL 是全局解释器锁..."}],
        )
        assert result["received"] == 1
        assert result["skipped"] == 0
        assert len(result["entry_ids"]) == 1

    @pytest.mark.asyncio
    async def test_push_multiple_qa(self, db_session: AsyncSession):
        await _ensure_system_kb(db_session)
        result = await push_external_entries(
            db_session,
            platform="claude_code",
            session_id="sess-002",
            qa_pairs=[
                {"question": "Q1", "answer": "A1"},
                {"question": "Q2", "answer": "A2"},
                {"question": "Q3", "answer": "A3"},
            ],
        )
        assert result["received"] == 3
        assert result["skipped"] == 0
        assert len(result["entry_ids"]) == 3

    @pytest.mark.asyncio
    async def test_dedup_same_question_platform_session(self, db_session: AsyncSession):
        """Same question + platform + session_id → skipped."""
        await _ensure_system_kb(db_session)
        qa = [{"question": "什么是 GIL", "answer": "GIL 是..."}]
        # First push
        r1 = await push_external_entries(db_session, platform="claude_code", session_id="sess-001", qa_pairs=qa)
        assert r1["received"] == 1
        assert r1["skipped"] == 0

        # Second push — same QA
        r2 = await push_external_entries(db_session, platform="claude_code", session_id="sess-001", qa_pairs=qa)
        assert r2["received"] == 0
        assert r2["skipped"] == 1

    @pytest.mark.asyncio
    async def test_dedup_different_session_allowed(self, db_session: AsyncSession):
        """Same question, different session → NOT skipped."""
        await _ensure_system_kb(db_session)
        qa = [{"question": "什么是 GIL", "answer": "GIL 是..."}]
        r1 = await push_external_entries(db_session, platform="claude_code", session_id="sess-a", qa_pairs=qa)
        assert r1["received"] == 1

        r2 = await push_external_entries(db_session, platform="claude_code", session_id="sess-b", qa_pairs=qa)
        assert r2["received"] == 1

    @pytest.mark.asyncio
    async def test_dedup_different_platform_allowed(self, db_session: AsyncSession):
        """Same question, different platform → NOT skipped."""
        await _ensure_system_kb(db_session)
        qa = [{"question": "什么是 GIL", "answer": "GIL 是..."}]
        r1 = await push_external_entries(db_session, platform="claude_code", session_id="sess-x", qa_pairs=qa)
        assert r1["received"] == 1

        r2 = await push_external_entries(db_session, platform="chatgpt", session_id="sess-x", qa_pairs=qa)
        assert r2["received"] == 1

    @pytest.mark.asyncio
    async def test_skip_empty_question(self, db_session: AsyncSession):
        result = await push_external_entries(
            db_session,
            platform="claude_code",
            session_id="sess-003",
            qa_pairs=[{"question": "", "answer": "some answer"}],
        )
        assert result["received"] == 0
        assert result["skipped"] == 1

    @pytest.mark.asyncio
    async def test_skip_empty_answer(self, db_session: AsyncSession):
        result = await push_external_entries(
            db_session,
            platform="claude_code",
            session_id="sess-003",
            qa_pairs=[{"question": "some question", "answer": ""}],
        )
        assert result["received"] == 0
        assert result["skipped"] == 1

    @pytest.mark.asyncio
    async def test_skip_whitespace_only(self, db_session: AsyncSession):
        result = await push_external_entries(
            db_session,
            platform="claude_code",
            session_id="sess-003",
            qa_pairs=[{"question": "   ", "answer": "   "}],
        )
        assert result["received"] == 0
        assert result["skipped"] == 1

    @pytest.mark.asyncio
    async def test_mixed_valid_and_empty(self, db_session: AsyncSession):
        await _ensure_system_kb(db_session)
        result = await push_external_entries(
            db_session,
            platform="claude_code",
            session_id="sess-004",
            qa_pairs=[
                {"question": "valid Q", "answer": "valid A"},
                {"question": "", "answer": "A"},
                {"question": "Q", "answer": ""},
                {"question": "another valid Q", "answer": "another valid A"},
            ],
        )
        assert result["received"] == 2
        assert result["skipped"] == 2

    @pytest.mark.asyncio
    async def test_entries_created_with_correct_fields(self, db_session: AsyncSession):
        await _ensure_system_kb(db_session)
        result = await push_external_entries(
            db_session,
            platform="chatgpt",
            session_id="sess-005",
            qa_pairs=[{"question": "Q1", "answer": "A1"}],
            messages_json={"messages": [{"role": "user", "content": "Q1"}]},
        )
        entry = await db_session.get(KbExternalEntry, result["entry_ids"][0])
        assert entry is not None
        assert entry.kb_id == _SYSTEM_KB_ID
        assert entry.question == "Q1"
        assert entry.answer == "A1"
        assert entry.source_platform == "chatgpt"
        assert entry.source_session == "sess-005"
        assert entry.status == "pending"
        assert entry.messages_json == {"messages": [{"role": "user", "content": "Q1"}]}

    @pytest.mark.asyncio
    async def test_session_id_none_allowed(self, db_session: AsyncSession):
        await _ensure_system_kb(db_session)
        result = await push_external_entries(
            db_session,
            platform="claude_code",
            session_id=None,
            qa_pairs=[{"question": "Q", "answer": "A"}],
        )
        assert result["received"] == 1


class TestValidateExternalKey:
    @pytest.mark.asyncio
    async def test_valid_key(self, db_session: AsyncSession):
        cfg = SystemConfig(id=1, external_api_key="mv-dep-test123")
        db_session.add(cfg)
        await db_session.flush()

        assert await _validate_external_key(db_session, "mv-dep-test123") is True

    @pytest.mark.asyncio
    async def test_invalid_key(self, db_session: AsyncSession):
        cfg = SystemConfig(id=1, external_api_key="mv-dep-test123")
        db_session.add(cfg)
        await db_session.flush()

        assert await _validate_external_key(db_session, "wrong-key") is False

    @pytest.mark.asyncio
    async def test_no_system_config(self, db_session: AsyncSession):
        assert await _validate_external_key(db_session, "any-key") is False

    @pytest.mark.asyncio
    async def test_null_external_api_key(self, db_session: AsyncSession):
        cfg = SystemConfig(id=1, external_api_key=None)
        db_session.add(cfg)
        await db_session.flush()

        assert await _validate_external_key(db_session, "any-key") is False


class TestRotateExternalKey:
    @pytest.mark.asyncio
    async def test_rotate_generates_new_key(self, db_session: AsyncSession):
        cfg = SystemConfig(id=1, external_api_key="mv-dep-oldkey123")
        db_session.add(cfg)
        await db_session.flush()

        old_key = cfg.external_api_key
        new_key = await rotate_external_key(db_session)

        assert new_key != old_key
        assert new_key.startswith(_API_KEY_PREFIX)
        assert cfg.external_api_key == new_key

    @pytest.mark.asyncio
    async def test_rotate_without_config_raises(self, db_session: AsyncSession):
        from app.core.exceptions import AppException

        with pytest.raises(AppException) as exc:
            await rotate_external_key(db_session)
        assert exc.value.code == 8001


class TestGetExternalConfig:
    @pytest.mark.asyncio
    async def test_returns_config(self, db_session: AsyncSession):
        await _ensure_system_kb(db_session)

        cfg = SystemConfig(id=1, external_api_key="mv-dep-configtest")
        db_session.add(cfg)
        await db_session.flush()

        config = await get_external_config(db_session, base_url="https://test.com")

        assert config["kb_id"] == _SYSTEM_KB_ID
        assert config["kb_name"] == "系统库"
        assert config["api_key"] == "mv-dep-configtest"
        assert config["entry_count"] == 0
        assert config["pending_insights"] == 0
        assert config["endpoint"] == "https://test.com/api/v1/kb/external/push"

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_system_config(self, db_session: AsyncSession):
        config = await get_external_config(db_session, base_url="https://test.com")

        assert config["api_key"] is None
        assert config["entry_count"] == 0
