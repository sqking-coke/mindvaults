"""文本切片服务。

支持两种切片模式：
- fixed: 固定长度切片（按 chunk_size 等距切割 + overlap）
- semantic: 基于 RecursiveCharacterTextSplitter 的语义边界切片（默认）

预处理（结构化清洗、Section 解析、噪声过滤等）已迁移到 preprocessor/ 模块，
由 ingestion_service 在切片之前调用。
"""
from loguru import logger


# ── 公共入口 ──────────────────────────────────────────────

async def chunk_text(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    mode: str = "semantic",
) -> list[str]:
    """将文本拆分为切片列表。mode: fixed | semantic。"""
    if not text or not text.strip():
        return []

    if mode == "fixed":
        return _fixed_chunk(text, chunk_size, chunk_overlap)
    # mode == "semantic"
    return await _semantic_chunk(text, chunk_size, chunk_overlap)


async def chunk_pages(
    pages: list[tuple[str, int | None]],
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    mode: str = "semantic",
) -> list[tuple[str, int | None]]:
    """逐页切片，保留页码信息。返回 [(chunk_text, page_number), ...]。"""
    all_chunks: list[tuple[str, int | None]] = []
    for page_text, page_num in pages:
        chunks = await chunk_text(page_text, chunk_size, chunk_overlap, mode)
        for chunk in chunks:
            all_chunks.append((chunk, page_num))
    return all_chunks


# ── 固定长度 ──────────────────────────────────────────────

def _fixed_chunk(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    """固定长度切片。"""
    chunks: list[str] = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= text_len:
            break
        start = end - chunk_overlap

    return chunks


# ── 语义切片 ──────────────────────────────────────────────

async def _semantic_chunk(
    text: str, chunk_size: int, chunk_overlap: int
) -> list[str]:
    """基于语义边界的切片。"""
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter
    except ImportError:
        logger.warning("langchain-text-splitters 未安装，回退到固定切片")
        return _fixed_chunk(text, chunk_size, chunk_overlap)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", "。", ".", "！", "？", "，", ",", " ", ""],
        length_function=len,
    )
    docs = splitter.create_documents([text])
    chunks = [doc.page_content.strip() for doc in docs if doc.page_content.strip()]
    return chunks
