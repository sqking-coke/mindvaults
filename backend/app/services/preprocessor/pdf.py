"""PDF 预处理器（P0）。

两阶段处理：
  阶段一：跨页分析 — 全文档扫描，识别页眉页脚重复行 + 水印关键词
  阶段二：逐页清洗 — ASCII 图表移除、断行修复、页码剔除、标题识别

与 BasePreprocessor 模板方法的关系：
  cross_page_analyze() → 阶段一
  clean()                 → 阶段二
  merge()                 → 继承基类公共归拢（行分类 → 块构建 → 标题合并 → 碎片过滤）
"""
from __future__ import annotations

import re
from collections import Counter

from loguru import logger

from app.services.preprocessor.base import BasePreprocessor
from app.utils.logger import log_event


# ═══════════════════════════════════════════════════════════════
# 常量
# ═══════════════════════════════════════════════════════════════

# 页眉页脚：同一行出现在 ≥ N 个页面
HEADER_FOOTER_MIN_PAGES = 3

# 断行修复：行长度 < N 字符 + 下一行首字母小写 → 合并
LINE_BREAK_THRESHOLD = 40

# 空行归拢：连续 ≥ N 空行 → 压缩为 1
MAX_CONSECUTIVE_BLANKS = 3

# 页码检测：纯数字、罗马数字
_PAGE_NUMBER_RE = re.compile(r"^\s*\d{1,4}\s*$")
_ROMAN_PAGE_RE = re.compile(
    r"^\s*[ivxlcdmIVXLCDM]{1,6}\s*$"
)

# 页码模式归一化（用于跨页页眉页脚检测）
# "Page 1" "Page 2" ... → "Page N"
# "1 / 10" "2 / 10"    → "N / N"
_PAGE_NUM_NORMALIZE_RE = re.compile(r"\b\d+\b")
# 常见页码分隔符：页码 / 总页数, 页码 of 总页数
_PAGE_RANGE_RE = re.compile(
    r"\b\d+\s*(?:/\s*\d+|of\s*\d+)\b", re.IGNORECASE
)

# 常见水印关键词
_WATERMARK_KEYWORDS = [
    "confidential", "draft", "internal", "proprietary",
    "do not distribute", "all rights reserved", "copyright",
    "内部", "机密", "草稿", "保密",
]

# 标题候选：全大写模式（≥ 10 个连续大写字符）
_ALL_CAPS_HEADING_RE = re.compile(r"^[A-Z][A-Z\s\-–]{9,}$")

# 标题候选：编号模式
_NUMBERED_HEADING_RE = re.compile(
    r"^\s*"
    r"("
    r"\d+(?:\.\d+)*[.)]?"        # 1 / 1.1 / 1.1.1 / 1. / 1)
    r"|"
    r"第[一二三四五六七八九十百千\d]+[章节条款]"  # 第一章 / 第3节
    r"|"
    r"[IVXLCDM]+[.)]"            # I. / II. / III. (罗马数字列表)
    r")"
    r"\s+"
)

# Box-drawing 字符占比阈值
MAX_BOX_RATIO = 0.15

# Mermaid / 文本图表检测
_MERMAID_START_RE = re.compile(r"^\s*(graph |flowchart |sequenceDiagram|classDiagram|gantt|pie )")


def _contains_watermark(line: str) -> bool:
    """检测行是否含水印关键词。"""
    lowered = line.lower().strip()
    return any(kw in lowered for kw in _WATERMARK_KEYWORDS)


def _normalize_page_numbers(line: str) -> str:
    """归一化行中的页码/页号，用于跨页重复行检测。

    "Page 1" → "Page N"
    "Page 1 / 10" → "Page N"
    "1" → "N"  (纯数字行)
    """
    stripped = line.strip()
    # 纯数字 → 归一化
    if _PAGE_NUMBER_RE.match(stripped):
        return "N"
    # "X / Y" 或 "X of Y" 页码格式 → 归一化
    if _PAGE_RANGE_RE.search(stripped):
        normalized = _PAGE_RANGE_RE.sub("N", stripped)
        return normalized
    # 其他含数字的行：替换所有数字为 N
    # 但只在行较短（< 50 字符）且至少有一个数字时做
    if len(stripped) < 50 and re.search(r"\d", stripped):
        return _PAGE_NUM_NORMALIZE_RE.sub("N", stripped)
    return stripped


def _box_drawing_ratio(line: str) -> float:
    """计算制表符/box-drawing 字符占比。"""
    if not line:
        return 0.0
    count = 0
    for ch in line:
        cp = ord(ch)
        # Unicode Box Drawing: U+2500–U+257F
        # Geometric Shapes: U+25A0–U+25FF
        # Miscellaneous Symbols: U+2600–U+26FF
        if (0x2500 <= cp <= 0x257F) or (0x25A0 <= cp <= 0x25FF):
            count += 1
        # ASCII art chars
        elif ch in "+-|=\\/":
            count += 1
    return count / len(line)


def _is_heading_candidate(line: str) -> bool:
    """判断行是否为标题候选（全大写或编号模式）。"""
    stripped = line.strip()
    if not stripped:
        return False
    if _ALL_CAPS_HEADING_RE.match(stripped):
        return True
    if _NUMBERED_HEADING_RE.match(stripped):
        return True
    return False


# ═══════════════════════════════════════════════════════════════
# PDFPreprocessor
# ═══════════════════════════════════════════════════════════════

class PDFPreprocessor(BasePreprocessor):
    """PDF 预处理器：跨页分析 + 逐页清洗。

    cross_page_analyze():  识别重复出现的页眉/页脚行，返回剔除集合 + 水印行集合
    clean():               逐页执行 6 步清洗规则
    merge():               继承 BasePreprocessor 的行分类 → 块构建 → 归拢合并
    """

    async def cross_page_analyze(
        self, pages: list[tuple[str, int | None]]
    ) -> dict | None:
        """阶段一：全文档扫描识别页眉页脚 + 水印。

        对每一行统计出现页数，≥ HEADER_FOOTER_MIN_PAGES 页的行 → 页眉/页脚候选。
        同时收集含水印关键词的行。

        Returns:
            {
                "header_footer_lines": set[str],  # 需剔除的重复行
                "watermark_lines": set[str],       # 含水印的行
                "total_pages": int,
            }
        """
        if not pages:
            return None

        total_pages = len(pages)
        if total_pages < HEADER_FOOTER_MIN_PAGES:
            logger.debug(
                f"pdf_cross_page_skip pages={total_pages} "
                f"min={HEADER_FOOTER_MIN_PAGES}"
            )
            return {
                "header_footer_lines": set(),
                "watermark_lines": set(),
                "total_pages": total_pages,
            }

        # 统计每行出现的页数（经页码归一化）
        line_page_counts: Counter[str] = Counter()
        watermark_lines: set[str] = set()

        for text, page_num in pages:
            if not text:
                continue
            seen_on_this_page: set[str] = set()
            for raw_line in text.split("\n"):
                stripped = raw_line.strip()
                if not stripped:
                    continue
                # 归一化页码，使 "Page 1" / "Page 2" 被检测为同一模式
                normalized = _normalize_page_numbers(stripped)
                # 每页每个归一化行只计一次
                if normalized not in seen_on_this_page:
                    seen_on_this_page.add(normalized)
                    line_page_counts[normalized] += 1
                # 水印检测（用原始行）
                if _contains_watermark(stripped):
                    watermark_lines.add(stripped)

        # 选取 ≥ min 页出现的行
        header_footer_lines: set[str] = {
            line
            for line, count in line_page_counts.items()
            if count >= HEADER_FOOTER_MIN_PAGES
        }

        logger.info(
            f"pdf_cross_page_analysis pages={total_pages} "
            f"header_footer_candidates={len(header_footer_lines)} "
            f"watermarks={len(watermark_lines)}"
        )
        log_event(
            "preprocess_cross_page_analysis",
            doc_type="pdf",
            total_pages=total_pages,
            header_footer_candidates=len(header_footer_lines),
            watermarks=len(watermark_lines),
        )

        return {
            "header_footer_lines": header_footer_lines,
            "watermark_lines": watermark_lines,
            "total_pages": total_pages,
        }

    async def clean(
        self, text: str, page_num: int | None, analysis: dict | None
    ) -> str:
        """阶段二：逐页清洗。

        6 步规则（按顺序执行）：
          ① 页眉页脚剔除 — 移除 analysis 中标记的重复行
          ② ASCII 图表检测 — 剔除连续 box-drawing 行及其包围行
          ③ 断行修复 — 短行 + 下一行小写开头 → 合并
          ④ 空行归拢 — 连续 ≥ 3 空行 → 1
          ⑤ 页码/水印剔除 — 孤立数字行 + 水印关键词行
          ⑥ 标题识别 — 全大写/编号模式行 → 加 # 前缀
        """
        if not text or not text.strip():
            return ""

        lines = text.split("\n")

        # ① 页眉页脚剔除（归一化后匹配）
        if analysis:
            hf_lines = analysis.get("header_footer_lines", set())
            if hf_lines:
                lines = [
                    l for l in lines
                    if _normalize_page_numbers(l.strip()) not in hf_lines
                ]

        if not lines:
            return ""

        # ② ASCII 图表 / Mermaid 检测 + 剔除
        lines = _remove_ascii_art(lines)

        if not lines:
            return ""

        # ③ 断行修复
        lines = _fix_line_breaks(lines)

        # ④ 空行归拢
        lines = _normalize_blanks(lines)

        # ⑤ 页码 + 水印剔除
        if analysis:
            wm_lines = analysis.get("watermark_lines", set())
            lines = _remove_page_numbers_and_watermarks(lines, wm_lines)

        if not lines:
            return ""

        # ⑥ 标题识别
        lines = _mark_headings(lines)

        result = "\n".join(lines)

        # 报告每页清洗效果
        if page_num is not None and page_num <= 3:
            # 仅前三页打 debug 日志
            logger.debug(
                f"pdf_page_cleaned page={page_num} "
                f"input_chars={len(text)} output_chars={len(result)}"
            )

        return result


# ═══════════════════════════════════════════════════════════════
# 清洗步骤实现
# ═══════════════════════════════════════════════════════════════

def _remove_ascii_art(lines: list[str]) -> list[str]:
    """② 移除 ASCII 图表 / box-drawing / Mermaid 图。

    策略：检测连续的高 box-drawing 比例行，连同其包围的连续行整体移除。
    同时检测 Mermaid 代码块起止标记。
    """
    if not lines:
        return []

    n = len(lines)
    # 标记需移除的行索引
    remove: set[int] = set()
    in_mermaid = False

    for i, line in enumerate(lines):
        stripped = line.strip()

        # Mermaid 代码块
        if _MERMAID_START_RE.match(stripped):
            in_mermaid = True
            remove.add(i)
            continue
        if in_mermaid:
            remove.add(i)
            if stripped in ("```", "```mermaid") or (
                not stripped and i + 1 < n and not _MERMAID_START_RE.match(lines[i + 1].strip())
            ):
                # 空行后不再紧跟 mermaid/graph 模式 → 结束
                pass
            # Detect end of mermaid by looking ahead for non-diagram-like lines
            # Simple heuristic: if line is empty and next line doesn't start with mermaid keyword, end mermaid
            if not stripped and i + 1 < n:
                next_stripped = lines[i + 1].strip()
                if next_stripped and not next_stripped.startswith(("```", "graph", "flowchart", "sequenceDiagram")):
                    in_mermaid = False
            continue

        # Box-drawing 比例高
        if len(stripped) > 0 and _box_drawing_ratio(stripped) > MAX_BOX_RATIO:
            remove.add(i)
            # 向前扩展：吃掉相邻的非空非标题行（图表的包围框）
            _expand_remove_range(lines, remove, i)

    # 同时剔除连续 ≥ 3 行的纯 ASCII 艺术（全是 +-|=\/ 等字符）
    i = 0
    while i < n:
        stripped = lines[i].strip()
        if stripped and _box_drawing_ratio(stripped) > 0.5:
            j = i
            while j < n and lines[j].strip() and _box_drawing_ratio(lines[j].strip()) > 0.3:
                j += 1
            if j - i >= 3:
                for k in range(i, j):
                    remove.add(k)
            i = j
        else:
            i += 1

    # 最后扫一遍：移除所有含 box-drawing 字符的孤立行（连接线残存）
    result = []
    for idx, l in enumerate(lines):
        if idx in remove:
            continue
        stripped = l.strip()
        if stripped and _box_drawing_ratio(stripped) > 0.08:
            # 低阈值 catch 残存连接线（如 "         ▼                   ▼"）
            continue
        result.append(l)

    return result


def _expand_remove_range(lines: list[str], remove: set[int], center: int) -> None:
    """从中心行向上下扩展剔除范围（ASCII 图表的包围框行）。"""
    n = len(lines)
    # 向上
    up = center - 1
    while up >= 0 and up not in remove:
        stripped = lines[up].strip()
        if _box_drawing_ratio(stripped) > 0.1 or len(stripped) < 5:
            remove.add(up)
            up -= 1
        else:
            break
    # 向下
    down = center + 1
    while down < n and down not in remove:
        stripped = lines[down].strip()
        if _box_drawing_ratio(stripped) > 0.1 or len(stripped) < 5:
            remove.add(down)
            down += 1
        else:
            break


def _fix_line_breaks(lines: list[str]) -> list[str]:
    """③ 断行修复：短行（< 40 字符）且下一行以续接字符开头 → 合并。

    跳过含 box-drawing 字符的行（ASCII 图表残存），避免将图表行与正文错误拼接。
    """
    if not lines:
        return []

    result: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # 跳过含 box-drawing 字符的行
        if _contains_box_chars(line):
            result.append(line)
            i += 1
            continue

        # 检查是否应合并到上一行
        if (
            result
            and line
            and not _contains_box_chars(result[-1])
            and _is_continuation_start(line[0])
            and len(result[-1].rstrip()) < LINE_BREAK_THRESHOLD
        ):
            prev = result.pop()
            if prev.rstrip().endswith("-"):
                prev = prev.rstrip()[:-1]
            result.append(prev.rstrip() + _join_sep(prev, line))
            i += 1
            continue

        # 检查此行是否短且下一行以续接字符开头
        if (
            len(line.rstrip()) < LINE_BREAK_THRESHOLD
            and line.strip()
            and i + 1 < len(lines)
            and lines[i + 1]
            and not _contains_box_chars(lines[i + 1])
            and _is_continuation_start(lines[i + 1][0])
            and lines[i + 1].strip()
        ):
            next_line = lines[i + 1]
            if line.rstrip().endswith("-"):
                line = line.rstrip()[:-1]
            merged = line.rstrip() + _join_sep(line, next_line)
            result.append(merged)
            i += 2
            continue

        result.append(line)
        i += 1

    return result


def _contains_box_chars(line: str) -> bool:
    """检测行是否含 box-drawing 字符。"""
    if not line:
        return False
    for ch in line:
        cp = ord(ch)
        if 0x2500 <= cp <= 0x257F:
            return True
        if 0x25A0 <= cp <= 0x25FF:
            return True
    return False


def _is_continuation_start(ch: str) -> bool:
    """判断字符是否为续接行首（断行后不应另起一行的字符）。

    - 英文小写字母
    - CJK 统一表意文字（U+4E00–U+9FFF）
    - CJK 扩展区
    - 日文平假名/片假名
    - 韩文
    - 中文标点（逗号、句号等不能作为行首的除外）
    """
    if ch.islower():
        return True
    cp = ord(ch)
    # CJK Unified Ideographs
    if 0x4E00 <= cp <= 0x9FFF:
        return True
    # CJK Extension A
    if 0x3400 <= cp <= 0x4DBF:
        return True
    # CJK Compatibility Ideographs
    if 0xF900 <= cp <= 0xFAFF:
        return True
    # Hiragana
    if 0x3040 <= cp <= 0x309F:
        return True
    # Katakana
    if 0x30A0 <= cp <= 0x30FF:
        return True
    # Hangul
    if 0xAC00 <= cp <= 0xD7AF:
        return True
    return False


def _join_sep(prev: str, next_line: str) -> str:
    """根据上一行尾字符和下一行首字符选择合适的连接符。"""
    prev_tail = prev.rstrip()[-1:] if prev.rstrip() else ""
    next_head = next_line.lstrip()[:1] if next_line.lstrip() else ""

    # CJK 字符之间不需要空格
    prev_cjk = (
        ord(prev_tail) >= 0x4E00 if prev_tail else False
    ) and ord(prev_tail) <= 0x9FFF
    next_cjk = (
        ord(next_head) >= 0x4E00 if next_head else False
    ) and ord(next_head) <= 0x9FFF

    if prev_cjk or next_cjk:
        return next_line.lstrip()
    return " " + next_line.lstrip()


def _normalize_blanks(lines: list[str]) -> list[str]:
    """④ 空行归拢：连续 ≥ 3 空行 → 压缩为 1 空行。"""
    if not lines:
        return []

    result: list[str] = []
    blank_count = 0

    for line in lines:
        if not line.strip():
            blank_count += 1
        else:
            if blank_count > 0:
                # 至少保留 1 个空行作为段落分隔
                result.append("")
            blank_count = 0
            result.append(line)

    # 末尾空行：如果有内容，保留 1 个空行作为结尾
    if blank_count > 0 and result:
        result.append("")

    return result


def _remove_page_numbers_and_watermarks(
    lines: list[str], watermark_lines: set[str]
) -> list[str]:
    """⑤ 移除孤立页码行和水印行。

    规则：
      - 纯数字行（1-4 位）且上下行非正文 → 页码
      - 罗马数字（I, II, III...）→ 页码
      - 水印行集 → 剔除
    """
    if not lines:
        return []

    n = len(lines)
    result: list[str] = []

    for i, line in enumerate(lines):
        stripped = line.strip()

        # 水印行
        if stripped in watermark_lines or _contains_watermark(stripped):
            continue

        # 罗马数字页码（孤立行）
        if _ROMAN_PAGE_RE.match(stripped) and len(stripped) <= 6:
            # 上下文检查：上下行至少有一方是空行或短行 → 很可能是页码
            prev_short = i == 0 or not lines[i - 1].strip() or len(lines[i - 1].strip()) < 20
            next_short = i == n - 1 or not lines[i + 1].strip() or len(lines[i + 1].strip()) < 20
            if prev_short and next_short:
                continue

        # 孤立数字行（页码）
        if _PAGE_NUMBER_RE.match(stripped):
            prev_empty = i == 0 or not lines[i - 1].strip()
            next_empty = i == n - 1 or not lines[i + 1].strip()
            # 页码模式：独立一行且上下有空行
            if prev_empty or next_empty:
                continue
            # 数字 > 100 不太可能是页码
            try:
                num = int(stripped)
                if num > 999:
                    result.append(line)
                    continue
            except ValueError:
                pass
            # 上下行都短 → 可能是页码
            if prev_empty and next_empty:
                continue

        result.append(line)

    return result


def _mark_headings(lines: list[str]) -> list[str]:
    """⑥ 标题识别：全大写/编号模式行 → 添加 # 或 ## 前缀。

    - 全大写行（≥ 10 chars）：加 ## 前缀
    - 编号模式行（"1." "1.1" "第一章"）：加 ## 前缀
    - 前缀只加一次（不重复叠加）
    """
    result: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            result.append(line)
            continue

        # 已有 # 前缀 → 跳过
        if stripped.startswith("#"):
            result.append(line)
            continue

        # 全大写标题
        if _ALL_CAPS_HEADING_RE.match(stripped):
            # 保留原始缩进，加 ## 前缀
            indent = line[:len(line) - len(line.lstrip())]
            result.append(f"{indent}## {stripped}")
            continue

        # 编号模式标题
        match = _NUMBERED_HEADING_RE.match(stripped)
        if match:
            indent = line[:len(line) - len(line.lstrip())]
            result.append(f"{indent}## {stripped}")
            continue

        result.append(line)

    return result
