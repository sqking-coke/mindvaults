"""文本切片服务。

支持三种模式：
- fixed: 固定长度切片
- semantic: 基于 RecursiveCharacterTextSplitter 的语义边界切片
- structured: 结构化预处理 → 语义切片（推荐，默认）
"""
import re

from loguru import logger


# ── 公共入口 ──────────────────────────────────────────────

async def chunk_text(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    mode: str = "structured",
) -> list[str]:
    """将文本拆分为切片列表。mode: fixed | semantic | structured。"""
    if not text or not text.strip():
        return []

    if mode == "fixed":
        return _fixed_chunk(text, chunk_size, chunk_overlap)
    if mode == "structured":
        return await _structured_chunk(text, chunk_size, chunk_overlap)
    # mode == "semantic"
    return await _semantic_chunk(text, chunk_size, chunk_overlap)


async def chunk_pages(
    pages: list[tuple[str, int | None]],
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    mode: str = "structured",
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


# ═══════════════════════════════════════════════════════════════
# 结构化预处理模式
# ═══════════════════════════════════════════════════════════════

# ── 行分类 ────────────────────────────────────────────────

# Markdown 标题
_HEADING_RE = re.compile(r"^#{1,6}\s+\S")

# 代码块围栏
_FENCE_RE = re.compile(r"^\s*```")

# Box-drawing / ASCII 艺术字符（U+2500–U+257F + 常见几何形状）
_BOX_RE = re.compile(
    r"[─━│┃┄┅┆┇┈┉┊┋┌┍┎┏┐┑┒┓└┕┖┗┘┙┚┛├┝┞┟┠┡┢┣┤┥┦┧┨┩┪┫┬┭┮┯┰┱┲┳┴┵┶┷┸┹┺┻┼┽┾┿╀╁╂╃╄╅╆╇╈╉╊╋╌╍╎╏"
    r"═║╒╓╔╕╖╗╘╙╚╛╜╝╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬╭╮╯╰╱╲╳╴╵╶╷╸╹╺╻╼╽╾╿"
    r"▶▼▲◀◢◣◤◥◆◇○●]"
)

# 列表项
_LIST_RE = re.compile(r"^\s*[-*+]\s+|\s*\d+[.)]\s+")

# 表格分隔线
_TABLE_SEP_RE = re.compile(r"^\s*\|[\s\-:|]+\|\s*$")

_LINE_TYPES = ("heading", "fence", "code", "box", "list", "table_sep", "blank", "text")


def _classify_line(line: str, in_code_block: bool) -> str:
    """分类单行类型。"""
    if in_code_block:
        if _FENCE_RE.match(line):
            return "fence"
        return "code"

    if _FENCE_RE.match(line):
        return "fence"

    stripped = line.strip()
    if not stripped:
        return "blank"

    if _TABLE_SEP_RE.match(stripped):
        return "table_sep"

    # Box drawing 占比 > 10%，或行首/行尾有框线字符
    box_chars = len(_BOX_RE.findall(line))
    if box_chars > 0 and (
        box_chars / max(len(line), 1) > 0.10
        or _BOX_RE.match(stripped[0])
        or _BOX_RE.match(stripped[-1])
    ):
        return "box"

    if _HEADING_RE.match(stripped):
        return "heading"

    if _LIST_RE.match(stripped):
        return "list"

    return "text"


# ── 块构建 ────────────────────────────────────────────────

def _build_blocks(lines: list[str]) -> list[dict]:
    """将连续同类型行归并为块。"""
    blocks: list[dict] = []
    in_code = False

    i = 0
    while i < len(lines):
        line_type = _classify_line(lines[i], in_code)
        buf = [lines[i]]

        if line_type == "fence":
            in_code = not in_code

        # 合并同类型连续行
        j = i + 1
        while j < len(lines):
            nt = _classify_line(lines[j], in_code)
            if nt == line_type and nt not in ("fence", "heading"):
                buf.append(lines[j])
                j += 1
            else:
                break

        text = "\n".join(buf).strip()
        blocks.append({
            "type": line_type,
            "text": text,
            "len": len(text),
        })
        i = j

    return blocks


# ── 归拢规则 ──────────────────────────────────────────────

_SHORT_THRESHOLD = 120  # < 此长度视为短块，触发合并


def _merge_blocks(blocks: list[dict]) -> list[str]:
    """应用归拢规则，返回结构化的文本段落列表。"""
    merged: list[str] = []
    i = 0

    while i < len(blocks):
        cur = blocks[i]

        # ── 丢弃类 ──────────────────────────────
        if cur["type"] == "box":
            i += 1
            continue
        if cur["type"] == "table_sep":
            i += 1
            continue
        if cur["type"] == "blank":
            i += 1
            continue

        # ── 标题 + 紧跟内容 → 合并 ─────────────
        if cur["type"] == "heading":
            combined = cur["text"]
            i += 1
            # 合并标题后的内容直到遇到下一个标题 / box / fence
            while i < len(blocks):
                nxt = blocks[i]
                if nxt["type"] in ("heading", "blank"):
                    if nxt["type"] == "blank" and i + 1 < len(blocks) and blocks[i + 1]["type"] not in ("heading", "box", "fence"):
                        combined += "\n\n" + nxt["text"]
                        i += 1
                        continue
                    break
                if nxt["type"] in ("box", "fence"):
                    break
                combined += "\n\n" + nxt["text"]
                i += 1
            merged.append(combined)
            continue

        # ── 连续短段落 → 合并 ──────────────────
        if cur["type"] == "text" and cur["len"] < _SHORT_THRESHOLD:
            combined = cur["text"]
            i += 1
            while i < len(blocks) and blocks[i]["type"] == "text" and blocks[i]["len"] < _SHORT_THRESHOLD:
                combined += "\n\n" + blocks[i]["text"]
                i += 1
            merged.append(combined)
            continue

        # ── 代码块 → 保留 ─────────────────────
        if cur["type"] == "code":
            # 代码块保持完整
            merged.append(cur["text"])
            i += 1
            continue

        # ── 列表 → 成组保留 ────────────────────
        if cur["type"] == "list":
            combined = cur["text"]
            i += 1
            while i < len(blocks) and blocks[i]["type"] == "list":
                combined += "\n" + blocks[i]["text"]
                i += 1
            merged.append(combined)
            continue

        # ── 默认保留 ───────────────────────────
        merged.append(cur["text"])
        i += 1

    return merged


# ── 主入口 ────────────────────────────────────────────────

async def _structured_chunk(
    text: str,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> list[str]:
    """结构化预处理 → 语义切片。

    1. 逐行分类
    2. 同类归块
    3. 归拢合并（标题+正文、短段落合并、丢弃 box）
    4. 合并后文本交给语义切片器
    """
    lines = text.split("\n")

    # 1–2. 分类 + 归块
    blocks = _build_blocks(lines)
    if not blocks:
        return []

    # 3. 归拢合并
    paragraphs = _merge_blocks(blocks)
    if not paragraphs:
        return []

    report = _merge_report(blocks, paragraphs)
    if report:
        logger.info(
            f"structured_preprocess blocks={len(blocks)} paragraphs={len(paragraphs)} "
            f"dropped={report['dropped']} merged_heading={report['heading_merged']} "
            f"merged_short={report['short_merged']}"
        )

    # 4. 合并后的段落文本
    merged_text = "\n\n".join(paragraphs)

    # 5. 传递给语义切片器做最终切分
    #    结构已经归拢，语义切片只需处理超长段落
    return await _semantic_chunk(merged_text, chunk_size, chunk_overlap)


def _merge_report(blocks: list[dict], paragraphs: list[str]) -> dict | None:
    """生成预处理报告。"""
    dropped = sum(1 for b in blocks if b["type"] in ("box", "table_sep"))
    heading_merged = sum(1 for b in blocks if b["type"] == "heading")
    text_blocks = sum(1 for b in blocks if b["type"] == "text")
    short_text = sum(1 for b in blocks if b["type"] == "text" and b["len"] < _SHORT_THRESHOLD)

    if dropped == 0 and heading_merged == 0 and short_text == 0:
        return None

    return {
        "dropped": dropped,
        "heading_merged": heading_merged,
        "text_blocks": text_blocks,
        "short_text": short_text,
        "short_merged": short_text,
    }
