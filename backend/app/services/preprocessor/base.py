"""预处理器基类 + 公共归拢规则。

迁移自 chunking_service._structured_chunk 的管道逻辑：
  行分类 → 块构建 → 归拢合并 → 碎片过滤

供 PDF / TXT / DOCX 预处理器使用。MarkdownPreprocessor 不使用此管道，
而是重写 process() 走 Section 树解析。
"""
import re

from loguru import logger

from app.utils.logger import log_event

# ═══════════════════════════════════════════════════════════════
# 正则常量
# ═══════════════════════════════════════════════════════════════

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

# 表格数据行（以 | 开头、含 | 结尾，非分隔线）
_TABLE_ROW_RE = re.compile(r"^\s*\|.+\|\s*$")

# 行类型
_LINE_TYPES = ("heading", "fence", "code", "box", "list", "table_sep", "table_row", "blank", "text")

# 短段落阈值
_SHORT_THRESHOLD = 120


# ═══════════════════════════════════════════════════════════════
# 行分类
# ═══════════════════════════════════════════════════════════════

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

    if _TABLE_ROW_RE.match(stripped):
        return "table_row"

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


# ═══════════════════════════════════════════════════════════════
# 块构建
# ═══════════════════════════════════════════════════════════════

def _build_blocks(lines: list[str]) -> list[dict]:
    """将连续同类型行归并为块。

    特殊处理：
      - table_row + table_sep 合并为单一 "table" 块
      - fence 切换代码块状态
    """
    blocks: list[dict] = []
    in_code = False

    i = 0
    while i < len(lines):
        line_type = _classify_line(lines[i], in_code)
        buf = [lines[i]]

        if line_type == "fence":
            in_code = not in_code

        # 合并同类型连续行 + 表格行组
        j = i + 1
        while j < len(lines):
            nt = _classify_line(lines[j], in_code)
            # 表格行和表格分隔线合并为同一 table 块
            if line_type in ("table_row", "table_sep") and nt in ("table_row", "table_sep"):
                if nt == "table_row":
                    line_type = "table_row"  # 保持以 table_row 为块类型名
                buf.append(lines[j])
                j += 1
            elif nt == line_type and nt not in ("fence", "heading"):
                buf.append(lines[j])
                j += 1
            else:
                break

        text = "\n".join(buf).strip()

        # 统一表格块类型名
        block_type = "table" if line_type in ("table_row", "table_sep") else line_type

        blocks.append({
            "type": block_type,
            "text": text,
            "len": len(text),
        })
        i = j

    return blocks


# ═══════════════════════════════════════════════════════════════
# 归拢规则
# ═══════════════════════════════════════════════════════════════

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
        if cur["type"] == "blank":
            i += 1
            continue

        # ── 表格块 → 完整保留 ──────────────────
        if cur["type"] == "table":
            merged.append(cur["text"])
            i += 1
            continue

        # ── 标题 + 紧跟内容 → 合并 ─────────────
        if cur["type"] == "heading":
            combined = cur["text"]
            i += 1
            while i < len(blocks):
                nxt = blocks[i]
                if nxt["type"] in ("heading", "blank"):
                    if (
                        nxt["type"] == "blank"
                        and i + 1 < len(blocks)
                        and blocks[i + 1]["type"] not in ("heading", "box", "fence")
                    ):
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
            while (
                i < len(blocks)
                and blocks[i]["type"] == "text"
                and blocks[i]["len"] < _SHORT_THRESHOLD
            ):
                combined += "\n\n" + blocks[i]["text"]
                i += 1
            merged.append(combined)
            continue

        # ── 代码块 → 保留 ─────────────────────
        if cur["type"] == "code":
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


def _merge_report(blocks: list[dict], paragraphs: list[str]) -> dict | None:
    """生成预处理报告。"""
    dropped = sum(1 for b in blocks if b["type"] in ("box", "table_sep"))
    heading_merged = sum(1 for b in blocks if b["type"] == "heading")
    text_blocks = sum(1 for b in blocks if b["type"] == "text")
    short_text = sum(
        1 for b in blocks if b["type"] == "text" and b["len"] < _SHORT_THRESHOLD
    )

    if dropped == 0 and heading_merged == 0 and short_text == 0:
        return None

    return {
        "dropped": dropped,
        "heading_merged": heading_merged,
        "text_blocks": text_blocks,
        "short_text": short_text,
        "short_merged": short_text,
    }


# ═══════════════════════════════════════════════════════════════
# BasePreprocessor
# ═══════════════════════════════════════════════════════════════

class BasePreprocessor:
    """预处理器基类。

    默认三阶段模板方法（PDF / TXT / DOCX 使用）：
      阶段一: cross_page_analyze(pages) → 跨页分析（默认空操作）
      阶段二: clean(text, page_num, analysis) → 类型特化清洗
      阶段三: merge(pages) → 公共归拢

    MarkdownPreprocessor 重写 process() 整体逻辑：
      Section 树解析 → 行内清洗 → Section→Chunk 弹性映射
    """

    async def process(
        self, pages: list[tuple[str, int | None]]
    ) -> list[tuple[str, int | None]]:
        """默认三阶段管道。子类可重写此方法（如 MD）。"""
        doc_type = self.__class__.__name__.replace("Preprocessor", "").lower()
        total_chars = sum(len(t) for t, _ in pages)
        log_event(
            "preprocess_started",
            doc_type=doc_type,
            page_count=len(pages),
            input_chars=total_chars,
        )

        # 阶段一：跨页分析（只有 PDF 重写此方法）
        analysis = await self.cross_page_analyze(pages)

        # 阶段二：逐页清洗
        cleaned: list[tuple[str, int | None]] = []
        for text, page_num in pages:
            text = await self.clean(text, page_num, analysis)
            cleaned.append((text, page_num))

        # 阶段三：公共归拢
        result = await self.merge(cleaned)

        output_chars = sum(len(t) for t, _ in result)
        log_event(
            "preprocess_completed",
            doc_type=doc_type,
            input_chars=total_chars,
            output_chars=output_chars,
            dropped_chars=total_chars - output_chars,
            output_units=len(result),
        )
        return result

    async def cross_page_analyze(
        self, pages: list[tuple[str, int | None]]
    ) -> dict | None:
        """跨页分析，子类按需重写。返回分析结果传给 clean()。"""
        return None

    async def clean(
        self, text: str, page_num: int | None, analysis: dict | None
    ) -> str:
        """类型特化清洗，子类重写。"""
        return text

    async def merge(
        self, pages: list[tuple[str, int | None]]
    ) -> list[tuple[str, int | None]]:
        """公共归拢：行分类 → 块构建 → 标题合并 → 碎片过滤。

        对每个 page 做 block merge，保持 page_number 不变。
        """
        result: list[tuple[str, int | None]] = []
        for text, page_num in pages:
            if not text or not text.strip():
                continue

            lines = text.split("\n")
            blocks = _build_blocks(lines)
            if not blocks:
                continue

            paragraphs = _merge_blocks(blocks)
            if not paragraphs:
                continue

            report = _merge_report(blocks, paragraphs)
            if report:
                logger.info(
                    f"structured_preprocess blocks={len(blocks)} "
                    f"paragraphs={len(paragraphs)} "
                    f"dropped={report['dropped']} "
                    f"heading_merged={report['heading_merged']} "
                    f"merged_short={report['short_merged']}"
                )

            merged_text = "\n\n".join(paragraphs)
            result.append((merged_text, page_num))

        return result
