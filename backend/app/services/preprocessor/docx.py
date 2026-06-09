"""DOCX 预处理器（P2）。

依赖 parser_service._parse_docx 的格式转换输出：
  - Heading 1-6 样式 → # ~ ###### 标题前缀（由 parser 完成）
  - 表格 → markdown 表格（由 parser 完成）
  - 列表项 → - 前缀（由 parser 完成）

预处理器职责：
  clean():  空标题清理、空白归一化、DOCX 转换残渣过滤
  merge():  继承 BasePreprocessor 公共归拢管道（行分类 → 块构建 → 标题合并 → 碎片过滤）

Parser 输出已包含 markdown 格式标记，BasePreprocessor 的 _classify_line /
_merge_blocks 能正确识别 # 标题和 markdown 表格，DOCX 类型无需重写 merge()。
"""
from __future__ import annotations

import re

from loguru import logger

from app.services.preprocessor.base import BasePreprocessor


# ═══════════════════════════════════════════════════════════════
# 常量
# ═══════════════════════════════════════════════════════════════

# 空标题模式：# 后面无有效内容
_EMPTY_HEADING_RE = re.compile(r"^#{1,6}\s*$")

# 连续空行阈值
_MAX_CONSECUTIVE_BLANKS = 3

# 全空白行
_BLANK_RE = re.compile(r"^\s*$")

# DOCX 转换残渣：仅含标点/特殊字符的短行
_RESIDUAL_NOISE_RE = re.compile(r"^[\s\-_=*•·]{1,5}$")

# 页眉页脚残留（已在 parser 层排除 body 外的内容，此为兜底）
# 常见格式：页码数字、路径、日期
_PAGE_HEADER_PATTERNS = [
    re.compile(r"^\s*\d{1,4}\s*$"),                      # 孤立页码
    re.compile(r"^\s*[\/\\][\w\/\\]+\.\w{2,4}\s*$"),     # 文件路径
    re.compile(r"^\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*$"), # 日期
]


def _is_empty_heading(line: str) -> bool:
    """检测空标题行（如 `# ` 或 `## ` 后面无内容）。"""
    return bool(_EMPTY_HEADING_RE.match(line))


def _is_residual_noise(line: str) -> bool:
    """检测 DOCX 转换残渣行。"""
    stripped = line.strip()
    if not stripped:
        return False
    if len(stripped) <= 5 and _RESIDUAL_NOISE_RE.match(stripped):
        return True
    for pattern in _PAGE_HEADER_PATTERNS:
        if pattern.match(stripped):
            return True
    return False


# ═══════════════════════════════════════════════════════════════
# DocxPreprocessor
# ═══════════════════════════════════════════════════════════════

class DocxPreprocessor(BasePreprocessor):
    """DOCX 预处理器：Parser 已完成格式转换，此处只做清洗和公共归拢。

    clean():  空标题 → 剔除、空白 → 归拢、残渣 → 过滤
    merge():  调用基类公共归拢后，追加空行归一化（去除归拢过程中产生的多余空行）

    DOCX 不跨页，cross_page_analyze() 保持默认空操作。
    """

    async def clean(
        self, text: str, page_num: int | None, analysis: dict | None
    ) -> str:
        """DOCX 特有清洗。

        步骤：
          ① 空标题剔除：`## ` 或 `# ` 后无内容 → 移除
          ② 残渣过滤：纯标点短行、孤立页码、路径行 → 移除
          ③ 空白归拢：连续 ≥ 3 空行 → 压缩为 1
        """
        if not text or not text.strip():
            return ""

        lines = text.split("\n")

        # ① 空标题 + ② 残渣过滤
        lines = _filter_docx_noise(lines)

        if not lines:
            return ""

        # ③ 空白归拢
        lines = _normalize_docx_blanks(lines)

        return "\n".join(lines)

    async def merge(
        self, pages: list[tuple[str, int | None]]
    ) -> list[tuple[str, int | None]]:
        """公共归拢 + 空行归一化。

        基类 _merge_blocks 的标题合并逻辑可能引入多余连续空行
        （标题后的空块被双重 \n\n 连接），此处做最终归一化。
        """
        result = await super().merge(pages)

        # 空行归一化：连续 ≥ 2 空行 → 压缩为 1
        normalized: list[tuple[str, int | None]] = []
        for text, page_num in result:
            lines = text.split("\n")
            compacted: list[str] = []
            blank_run = 0
            for line in lines:
                if not line.strip():
                    blank_run += 1
                else:
                    if blank_run > 0:
                        compacted.append("")  # 保留 1 空行
                    blank_run = 0
                    compacted.append(line)
            if compacted:
                normalized.append(("\n".join(compacted), page_num))

        return normalized


# ═══════════════════════════════════════════════════════════════
# 清洗步骤实现
# ═══════════════════════════════════════════════════════════════

def _filter_docx_noise(lines: list[str]) -> list[str]:
    """①② 空标题 + 残渣过滤。"""
    if not lines:
        return []

    result: list[str] = []
    for line in lines:
        stripped = line.strip()

        # 空标题行
        if stripped and _is_empty_heading(stripped):
            continue

        # 残留噪声行
        if stripped and _is_residual_noise(stripped):
            continue

        result.append(line)

    return result


def _normalize_docx_blanks(lines: list[str]) -> list[str]:
    """③ 空白归拢：连续 ≥ 3 空行 → 压缩为 1。"""
    if not lines:
        return []

    result: list[str] = []
    blank_count = 0

    for line in lines:
        if _BLANK_RE.match(line):
            blank_count += 1
        else:
            if blank_count > 0:
                result.append("")  # 保留 1 空行作为段落分隔
            blank_count = 0
            result.append(line)

    # 末尾空行：有内容时保留 1 个空行结尾
    if blank_count > 0 and result:
        result.append("")

    return result
