"""Markdown 预处理器：Section 树解析 + 行内清洗 + 弹性映射。

不继承 BasePreprocessor 的默认三阶段管道，而是重写 process() 整体逻辑：
  1. YAML frontmatter 提取
  2. 行内清洗（Wiki 链接、图片链接、HTML 标签）
  3. Section 树解析（有标题按 # 层级，无标题按隐式结构）
  4. Section → Chunk 弹性映射（目标 500 字符，弹性 350-650）

特殊保护：
  - 代码块 ```...``` 标记 unsplittable = True，完整保留
  - 表格标记 unsplittable = True，完整保留
  - 列表组作为 Section 的连续 content，不在中间拆分
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from loguru import logger

from app.services.preprocessor.base import BasePreprocessor
from app.utils.logger import log_event


# ═══════════════════════════════════════════════════════════════
# 常量
# ═══════════════════════════════════════════════════════════════

# 目标字符数
TARGET_CHUNK_SIZE = 500

# 弹性范围（±30%）
ELASTIC_MIN = 350   # int(TARGET_CHUNK_SIZE * 0.7)
ELASTIC_MAX = 650   # int(TARGET_CHUNK_SIZE * 1.3)

# YAML frontmatter 分隔符
_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)

# Wiki 链接：[[page]] 或 [[page|alias]]
_WIKI_LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")

# Markdown 图片：![alt](url)
_IMAGE_RE = re.compile(r"!\[([^\]]*)\]\([^)]+\)")

# Markdown 链接保留文字：[text](url)
_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]+\)")

# HTML 标签
_HTML_TAG_RE = re.compile(r"<[^>]+>")

# 标题行
_HEADING_LINE_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)

# 代码块围栏
_FENCE_RE = re.compile(r"^\s*```")

# 表格行
_TABLE_ROW_RE = re.compile(r"^\s*\|.+\|\s*$")


# ═══════════════════════════════════════════════════════════════
# Section 数据结构
# ═══════════════════════════════════════════════════════════════

@dataclass
class Section:
    """MD 文档的一个节。

    Attributes:
        heading: 标题文本（含 # 标记），无标题正文段为 ""
        level: 标题级别 1-6，0 表示无标题正文段
        content: 该节下的直接正文（不包含子节标题和内容）
        subsections: 子级 Section 列表
        unsplittable: True 表示代码块/表格，完整保留不拆分
    """
    heading: str = ""
    level: int = 0
    content: str = ""
    subsections: list[Section] = field(default_factory=list)
    unsplittable: bool = False

    @property
    def total_length(self) -> int:
        """本节及子节的总字符数。"""
        length = len(self.heading) + len(self.content)
        for sub in self.subsections:
            length += sub.total_length
        return length

    @property
    def direct_length(self) -> int:
        """仅 heading + content 的字符数（不含子节）。"""
        return len(self.heading) + len(self.content)

    @property
    def full_text(self) -> str:
        """拼接本节及所有子节的完整文本。"""
        parts = []
        if self.heading:
            parts.append(self.heading)
        if self.content:
            parts.append(self.content)
        for sub in self.subsections:
            parts.append(sub.full_text)
        return "\n\n".join(parts)


# ═══════════════════════════════════════════════════════════════
# MarkdownPreprocessor
# ═══════════════════════════════════════════════════════════════

class MarkdownPreprocessor(BasePreprocessor):
    """MD 预处理器：Section 树解析 + 弹性映射。

    重写 process() 整体逻辑，不使用默认的逐页清洗+公共归拢管道。
    """

    async def process(
        self, pages: list[tuple[str, int | None]]
    ) -> list[tuple[str, int | None]]:
        """MD Section-based 处理管道。

        输入: [(full_md_text, None)]
        输出: [(section_text_1, None), (section_text_2, None), ...]
        """
        if not pages:
            return []

        text = pages[0][0]
        if not text or not text.strip():
            return []

        total_chars = len(text)
        log_event(
            "preprocess_started",
            doc_type="md",
            page_count=1,
            input_chars=total_chars,
        )

        # 1. YAML frontmatter 提取
        metadata, body = _extract_frontmatter(text)

        # 2. 行内清洗（不改结构）
        body = _clean_inline(body)

        # 3. 结构解析 → Section 树
        sections = _parse_sections(body)

        # 3.1 标记不可拆分单元（代码块、表格）
        _mark_unsplittable_sections(sections)

        # 4. Section → Chunk 映射（350-650 弹性）
        chunks = _sections_to_chunks(sections, target=TARGET_CHUNK_SIZE)

        # 4.1 换行归一化：压缩多余空行（≥3 连续换行 → 2 换行）
        chunks = [_normalize_newlines(c) for c in chunks]

        # 日志：统计不可拆分单元
        unsplittable_count = sum(
            1 for s in _iter_sections(sections) if s.unsplittable
        )
        logger.info(
            f"md_preprocess sections={len(sections)} chunks={len(chunks)} "
            f"unsplittable={unsplittable_count} "
            f"input_chars={total_chars} output_chars={sum(len(c) for c in chunks)}"
        )
        log_event(
            "preprocess_completed",
            doc_type="md",
            input_chars=total_chars,
            output_chars=sum(len(c) for c in chunks),
            output_units=len(chunks),
            sections=len(sections),
            unsplittable=unsplittable_count,
        )

        return [(c, None) for c in chunks]


# ═══════════════════════════════════════════════════════════════
# 1. YAML Frontmatter 提取
# ═══════════════════════════════════════════════════════════════

def _extract_frontmatter(text: str) -> tuple[dict, str]:
    """提取 YAML frontmatter，返回 (metadata, body)。

    仅处理文件开头的 --- 块。正文中的 --- 不受影响。
    """
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return {}, text

    raw = match.group(1)
    body = text[match.end():]

    metadata: dict = {}
    for line in raw.split("\n"):
        line = line.strip()
        if ":" in line:
            key, _, value = line.partition(":")
            key = key.strip()
            value = value.strip().strip("\"'")
            if key and value:
                metadata[key] = value

    if metadata:
        logger.info(f"frontmatter_extracted keys={list(metadata.keys())}")
    return metadata, body


# ═══════════════════════════════════════════════════════════════
# 2. 行内清洗
# ═══════════════════════════════════════════════════════════════

def _clean_inline(text: str) -> str:
    """行内清洗：Wiki 链接、图片链接、HTML 标签。

    在 Section 解析之前执行，不改文本结构。
    """
    # Wiki 链接：[[page]] → page, [[page|alias]] → alias
    text = _WIKI_LINK_RE.sub(lambda m: _convert_wiki_link(m.group(1)), text)

    # 图片链接：![alt](url) → [图片: alt]
    text = _IMAGE_RE.sub(r"[图片: \1]", text)

    # HTML 标签移除，保留 innerText
    text = _HTML_TAG_RE.sub("", text)

    return text


def _convert_wiki_link(target: str) -> str:
    """转换 Wiki 链接目标。

    [[page]] → page
    [[page|alias]] → alias
    """
    if "|" in target:
        return target.split("|", 1)[1].strip()
    return target.strip()


# ═══════════════════════════════════════════════════════════════
# 3. Section 树解析
# ═══════════════════════════════════════════════════════════════

def _parse_sections(body: str) -> list[Section]:
    """按 # 标题层级构建 Section 树。

    遍历行：遇标题 → 创建新 Section，找到合适的父级挂载。
    无标题 → 用隐式结构（双空行/单空行/列表组边界）构建伪 Section。
    """
    lines = body.split("\n")

    # 检测是否有 # 标题行
    has_headings = any(_HEADING_LINE_RE.match(line) for line in lines)

    if has_headings:
        return _parse_with_headings(lines)
    else:
        return _parse_without_headings(lines)


def _parse_with_headings(lines: list[str]) -> list[Section]:
    """有标题文档：按 # 层级构建 Section 树。"""
    root_sections: list[Section] = []
    # 层级栈：[(level, section), ...]，栈顶是当前最深父级
    level_stack: list[Section] = []

    # 当前累积的无标题内容行
    pending_content: list[str] = []
    # 是否处于代码块内
    in_code_block = False

    def flush_content():
        """将 pending_content 写入当前栈顶 Section。"""
        nonlocal pending_content
        if not pending_content:
            return
        content_text = "\n".join(pending_content).strip()
        pending_content = []
        if not content_text:
            return
        if level_stack:
            target = level_stack[-1]
        else:
            # 顶级无标题内容：创建一个 level=0 Section
            target = Section(level=0)
            root_sections.append(target)
            level_stack.append(target)
        if target.content:
            target.content += "\n\n" + content_text
        else:
            target.content = content_text

    for line in lines:
        # 代码块边界检测
        if _FENCE_RE.match(line):
            was_in_code = in_code_block
            in_code_block = not in_code_block
            pending_content.append(line)

            # 代码块在子节内关闭 → flush 代码块内容到当前子节，
            # 然后弹出子节，后续文本内容回流到父级 Section
            if was_in_code and not in_code_block and len(level_stack) > 1:
                flush_content()
                level_stack.pop()

            continue

        # 代码块内：直接累积
        if in_code_block:
            pending_content.append(line)
            continue

        # 标题检测
        heading_match = _HEADING_LINE_RE.match(line)
        if heading_match:
            level = len(heading_match.group(1))  # ## → 2
            heading_text = heading_match.group(0)

            # 先 flush 之前累积的无标题内容
            flush_content()

            # 创建新 Section
            new_section = Section(heading=heading_text, level=level)

            # 找到父级：向上出栈直到栈顶 level < 当前 level
            while level_stack and level_stack[-1].level >= level:
                level_stack.pop()

            if level_stack:
                level_stack[-1].subsections.append(new_section)
            else:
                root_sections.append(new_section)

            level_stack.append(new_section)
            continue

        # 普通行：累积
        pending_content.append(line)

    # 处理剩余内容
    flush_content()

    return root_sections


def _mark_unsplittable_sections(sections: list[Section]) -> None:
    """遍历 Section 树，标记包含代码块或表格的 LEAF Section 为 unsplittable。

    只标记叶子节点（无子节），因为非叶子节点通过 _split_long_section 的
    子节拆分来隔离 unsplittable 内容。
    """
    for section in sections:
        if not section.subsections and _is_unsplittable_block(section.content):
            section.unsplittable = True
        _mark_unsplittable_sections(section.subsections)


def _parse_without_headings(lines: list[str]) -> list[Section]:
    """无标题文档：用隐式结构构建 Section。

    层级规则：
      - Level 1 隐式边界：连续 ≥ 2 个空行（\\n\\n\\n）→ 视为大节分隔
      - Level 2 隐式边界：单个空行（\\n\\n）→ 视为小节边界
      - unsplittable 标记：代码块、表格

    返回平级 Section 列表（无嵌套）。
    """
    if not lines:
        return []

    # 第一步：合并连续空行，将文本分割为段落组
    # 用双空行（\\n\\n\\n+）作为 Level 1 分隔
    raw_text = "\n".join(lines)

    # 按连续 ≥ 2 个 \\n 分割为"大节"
    level1_parts = re.split(r"\n{3,}", raw_text)

    sections: list[Section] = []

    for part in level1_parts:
        part = part.strip()
        if not part:
            continue

        # 每个大节内部按单个 \\n 分割为"小节"（段落组）
        paragraphs = part.split("\n\n")

        # 检测代码块和表格，标记 unsplittable
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            is_unsplittable = _is_unsplittable_block(para)

            sections.append(Section(
                level=0,
                content=para,
                unsplittable=is_unsplittable,
            ))

    return sections


def _is_unsplittable_block(text: str) -> bool:
    """判断文本块是否不可拆分（代码块/表格）。"""
    # 代码块：以 ``` 开头且以 ``` 结尾
    stripped = text.strip()
    if stripped.startswith("```") and "```" in stripped[3:]:
        return True
    # 表格：连续 ≥ 2 行以 | 开头
    lines = stripped.split("\n")
    pipe_lines = [l for l in lines if _TABLE_ROW_RE.match(l.strip())]
    if len(pipe_lines) >= 2:
        return True
    return False


# ═══════════════════════════════════════════════════════════════
# 4. Section → Chunk 弹性映射
# ═══════════════════════════════════════════════════════════════

def _sections_to_chunks(
    sections: list[Section],
    target: int = TARGET_CHUNK_SIZE,
) -> list[str]:
    """将 Section 树映射为 chunk 列表。

    弹性规则（target=500, elastic_min=350, elastic_max=650）：
      - Section 350-650 chars → 完整保留为 1 chunk
      - Section < 350 chars      → 尝试与下一相邻 Section 合并
        → 合并后 ≤ 650 → 合并
        → 合并后 > 650 → 各自独立
      - Section > 650 chars      → 沿子节边界拆分
        → 子节 ≤ 650 → 子节作为独立 chunk
        → 子节 > 650 → 沿段落边界（\\n\\n）拆分
          → 单段 > 650 → 沿句子边界拆分（最后手段）
      - unsplittable=True        → 无论长度，完整保留为 1 chunk

    Args:
        sections: Section 树列表
        target: 目标字符数，默认 500

    Returns:
        chunk 文本列表
    """
    chunks: list[str] = []
    pending: str | None = None  # 等待合并的短 Section

    for section in sections:
        text = _section_to_chunk_text(section)

        if not text.strip():
            continue

        text_len = len(text)

        # ── 不可拆分块 → 直接输出 ──────────────
        if section.unsplittable:
            if pending is not None:
                chunks.append(pending)
                pending = None
            chunks.append(text)
            continue

        # ── 超长 Section → 拆分 ──────────────
        if text_len > ELASTIC_MAX:
            if pending is not None:
                chunks.append(pending)
                pending = None
            sub_chunks = _split_long_section(section, text, target)
            chunks.extend(sub_chunks)
            continue

        # ── 在理想区间 → 直接输出 ──────────────
        if text_len >= ELASTIC_MIN:
            if pending is not None:
                chunks.append(pending)
                pending = None
            # 如果有 unsplittable 子节，强制拆分以保持代码块/表格的隔离
            if not section.unsplittable and _has_unsplittable_descendant(section):
                sub_chunks = _split_long_section(section, text, target)
                chunks.extend(sub_chunks)
            else:
                chunks.append(text)
            continue

        # ── 短 Section（< 350）→ 尝试合并 ──────
        if pending is not None:
            combined = pending + "\n\n" + text
            if len(combined) <= ELASTIC_MAX:
                pending = combined
            else:
                chunks.append(pending)
                pending = text
        else:
            pending = text

    # 处理最后的 pending
    if pending is not None:
        chunks.append(pending)

    return chunks


def _section_to_chunk_text(section: Section) -> str:
    """将 Section 及其子节拼接为单个文本块。

    如果 Section 有子节，将子节独立展开（不归入父节正文），
    由 _split_long_section 按子节边界拆分。
    """
    parts: list[str] = []

    if section.heading:
        parts.append(section.heading)
    if section.content:
        parts.append(section.content)

    for sub in section.subsections:
        sub_text = _section_to_chunk_text(sub)
        parts.append(sub_text)

    return "\n\n".join(parts)


def _split_long_section(
    section: Section,
    text: str,
    target: int,
) -> list[str]:
    """拆分超长 Section（> 650 chars）。

    拆分优先级：
      1. 沿子节边界拆分（每个子节独立）
      2. 沿段落边界（\\n\\n）拆分
      3. 沿句子边界拆分（最后手段）
    """
    # ── 1. 子节边界拆分 ──────────────────────
    if section.subsections:
        result: list[str] = []
        # 父节 heading + content 作为独立前缀
        prefix_parts = []
        if section.heading:
            prefix_parts.append(section.heading)
        if section.content:
            prefix_parts.append(section.content)
        prefix = "\n\n".join(prefix_parts) if prefix_parts else ""

        if prefix and len(prefix) >= ELASTIC_MIN:
            result.append(prefix)
            prefix = ""

        for sub in section.subsections:
            sub_text = _section_to_chunk_text(sub)
            sub_len = len(sub_text)

            # 如果子节包含 unsplittable 后代 → 递归拆分
            if not sub.unsplittable and _has_unsplittable_descendant(sub):
                if prefix:
                    result.append(prefix)
                    prefix = ""
                nested = _split_long_section(sub, sub_text, target)
                result.extend(nested)
                continue

            if sub.unsplittable:
                # 先 flush prefix
                if prefix:
                    result.append(prefix)
                    prefix = ""
                result.append(sub_text)
                continue

            if sub_len <= ELASTIC_MAX:
                if prefix:
                    combined = prefix + "\n\n" + sub_text
                    if len(combined) <= ELASTIC_MAX:
                        result.append(combined)
                    else:
                        result.append(prefix)
                        result.append(sub_text)
                    prefix = ""
                else:
                    result.append(sub_text)
            else:
                # 子节仍然超长 → 段落边界拆分
                if prefix:
                    result.append(prefix)
                    prefix = ""
                result.extend(_split_by_paragraphs(sub_text, target))

        if prefix:
            result.append(prefix)

        return result

    # ── 2. 无子节 → 段落/句子边界拆分 ────────
    return _split_by_paragraphs(text, target)


def _split_by_paragraphs(text: str, target: int) -> list[str]:
    """沿段落边界（\\n\\n）拆分为 chunk。

    每个 chunk 尽量接近 target，段落不切断。
    如果单个段落 > ELASTIC_MAX，沿句子边界拆分。
    """
    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        para_len = len(para)

        # 单个段落超长 → 句子边界拆分
        if para_len > ELASTIC_MAX:
            # 先 flush current
            if current:
                chunks.append("\n\n".join(current))
                current = []
                current_len = 0
            # 句子拆分
            chunks.extend(_split_by_sentences(para, target))
            continue

        # 合并后超限 → flush current，para 成为新的 current
        if current_len + para_len + 2 > ELASTIC_MAX and current:
            chunks.append("\n\n".join(current))
            current = [para]
            current_len = para_len
        else:
            current.append(para)
            current_len += para_len + (2 if current_len > 0 else 0)

    if current:
        chunks.append("\n\n".join(current))

    return chunks


def _split_by_sentences(text: str, target: int) -> list[str]:
    """沿句子边界拆分单段落（最后手段）。

    中英文句末标点：。！？.!? + 换行
    """
    # 在句末标点后加分割标记
    sentence_boundaries = re.compile(r"([。！？.!?\n])(?=\S)")
    sentences = sentence_boundaries.split(text)

    # 重组为完整句子
    parts: list[str] = []
    i = 0
    while i < len(sentences) - 1:
        parts.append(sentences[i] + sentences[i + 1])
        i += 2
    if i < len(sentences):
        parts.append(sentences[i])

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for sent in parts:
        sent_len = len(sent)
        if current_len + sent_len > ELASTIC_MAX and current:
            chunks.append("".join(current))
            current = [sent]
            current_len = sent_len
        else:
            current.append(sent)
            current_len += sent_len

    if current:
        chunks.append("".join(current))

    return chunks


# ═══════════════════════════════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════════════════════════════

def _iter_sections(sections: list[Section]):
    """深度优先遍历所有 Section。"""
    for section in sections:
        yield section
        yield from _iter_sections(section.subsections)


def _has_unsplittable_descendant(section: Section) -> bool:
    """检查 Section 或其子节是否有 unsplittable 标记。"""
    if section.unsplittable:
        return True
    for sub in section.subsections:
        if _has_unsplittable_descendant(sub):
            return True
    return False


def _normalize_newlines(text: str) -> str:
    """归一化多余换行：连续 ≥ 3 换行 → 2 换行，首尾去空白。

    保留段落之间的一个空行（\n\n），但压缩多余的空行间隔。
    代码块内的换行不受影响（由 unsplittable 机制保护）。
    """
    if not text:
        return text

    # 首尾去空白
    text = text.strip()

    # 连续 3+ 换行 → 2 换行
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text
