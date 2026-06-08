"""TXT 预处理器（P1）。

规则：
  ① 噪声行过滤 — 纯标点/数字行、超短行（< 3 字符）、连续重复行
  ② 空行归拢 — 连续 ≥ 3 空行 → 1
  ③ 邮件/日志头归一化 — From: / To: / Date: / Subject: 保留并规范化
  ④ 短段落合并 — 继承 BasePreprocessor.merge() 公共归拢

编码检测：当前 parser 已按 UTF-8（errors=replace）读取，如需支持 GB2312/Shift-JIS
等编码，应在 parser 层增加 chardet（需要原始 bytes，P2）。
"""
from __future__ import annotations

import re

from loguru import logger

from app.services.preprocessor.base import BasePreprocessor


# ═══════════════════════════════════════════════════════════════
# 常量
# ═══════════════════════════════════════════════════════════════

# 噪声行：纯标点/数字占比阈值
_MAX_PUNCT_RATIO = 0.65

# 噪声行：最小有效长度
_MIN_LINE_LENGTH = 3

# 纯标点/数字/空白字符集
_PUNCT_DIGIT_CHARS = set(
    ".,;:!?()[]{}\"'`~@#$%^&*+=<>/\\|-_"
    "，。；：！？（）【】「」『』、·《》"
    "0123456789"
    " \t"
)

# 邮件/日志头字段
_EMAIL_HEADER_RE = re.compile(
    r"^\s*"
    r"(From|To|Cc|Bcc|Date|Sent|Subject|Message-ID|In-Reply-To|References|"
    r"Reply-To|X-Mailer|User-Agent|Received|Return-Path|Delivered-To)\s*:",
    re.IGNORECASE,
)

# 日志时间戳模式
_LOG_TIMESTAMP_RE = re.compile(
    r"^\s*"
    r"(\d{4}[-/]\d{2}[-/]\d{2}"        # 2024-01-15
    r"|"
    r"\d{2}:\d{2}:\d{2}"                # 14:30:00
    r"|"
    r"\[?\d{4}[-/]\d{2}[-/]\d{2}.\d{2}:\d{2}:\d{2}"  # [2024-01-15 14:30:00]
    r")"
)

# 分隔线（纯符号重复 ≥ 5 次）
_SEPARATOR_RE = re.compile(r"^\s*([-*=_.]{5,})\s*$")

# 全空白行
_BLANK_RE = re.compile(r"^\s*$")


def _punct_ratio(text: str) -> float:
    """标点/数字/空白字符占比。"""
    if not text:
        return 0.0
    count = sum(1 for c in text if c in _PUNCT_DIGIT_CHARS)
    return count / len(text)


def _is_separator_line(line: str) -> bool:
    """检测纯分隔线。"""
    return bool(_SEPARATOR_RE.match(line))


# ═══════════════════════════════════════════════════════════════
# TxtPreprocessor
# ═══════════════════════════════════════════════════════════════

class TxtPreprocessor(BasePreprocessor):
    """TXT 预处理器：噪声过滤 + 空行归拢 + 邮件头归一化。

    clean():  逐行清洗（噪声过滤、邮件头归一化）
    merge():  继承 BasePreprocessor 的行分类 → 块构建 → 归拢合并
    """

    async def clean(
        self, text: str, page_num: int | None, analysis: dict | None
    ) -> str:
        """逐行清洗。

        ① 噪声行过滤：分隔线、纯标点、超短行、连续重复行
        ② 空行归拢：连续 ≥ 3 空行 → 1
        ③ 邮件/日志头：检测并规范化格式
        """
        if not text or not text.strip():
            return ""

        lines = text.split("\n")

        # ① 噪声行过滤
        lines = _filter_noise_lines(lines)

        if not lines:
            return ""

        # ② 空行归拢
        lines = _normalize_blank_lines(lines)

        # ③ 邮件/日志头归一化
        lines = _normalize_email_headers(lines)

        result = "\n".join(lines)
        return result


# ═══════════════════════════════════════════════════════════════
# 清洗步骤实现
# ═══════════════════════════════════════════════════════════════

def _filter_noise_lines(lines: list[str]) -> list[str]:
    """① 噪声行过滤：分隔线、纯标点/数字行、超短行、连续重复行。"""
    if not lines:
        return []

    result: list[str] = []
    prev_normalized: str | None = None

    for line in lines:
        stripped = line.strip()

        # 空行保留（后续步骤统一处理空行）
        if not stripped:
            result.append(line)
            prev_normalized = None
            continue

        # 纯分隔线 → 丢弃
        if _is_separator_line(stripped):
            continue

        # 超短行（< 3 字符且非数字编号）→ 丢弃
        if len(stripped) < _MIN_LINE_LENGTH:
            # 不丢数字编号（可能是段落编号如 "1."）
            if not re.match(r"^\d{1,2}[.)]?$", stripped):
                continue

        # 纯标点/数字占比过高 → 可能为噪声
        if len(stripped) < 40 and _punct_ratio(stripped) > _MAX_PUNCT_RATIO:
            # 排除邮件头行、日志时间戳行（含大量数字/标点是正常的）
            if not _EMAIL_HEADER_RE.match(stripped) and not _LOG_TIMESTAMP_RE.match(stripped):
                continue

        # 与上一行重复 → 丢弃（连续重复检测）
        if stripped == prev_normalized:
            continue

        result.append(line)
        prev_normalized = stripped

    return result


def _normalize_blank_lines(lines: list[str]) -> list[str]:
    """② 空行归拢：连续 ≥ 2 空行 → 压缩为 1。"""
    if not lines:
        return []

    result: list[str] = []
    blank_count = 0

    for line in lines:
        if _BLANK_RE.match(line):
            blank_count += 1
        else:
            if blank_count > 0:
                result.append("")  # 保留 1 空行
            blank_count = 0
            result.append(line)

    return result


def _normalize_email_headers(lines: list[str]) -> list[str]:
    """③ 邮件/日志头归一化。

    检测模式：
      - 邮件头：From: xxx / To: xxx / Date: xxx → 字段名首字母大写
      - 日志时间戳：保留原样
      - MIME 边界、编码声明 → 剔除

    返回归一化后的行列表。
    """
    # MIME 相关行（非用户可见内容）
    _MIME_RE = re.compile(
        r"^\s*"
        r"(Content-Type|Content-Transfer-Encoding|MIME-Version|"
        r"boundary=|charset=|filename=)"
        r"\s*[:;=]",
        re.IGNORECASE,
    )

    in_email_headers = False
    result: list[str] = []

    for line in lines:
        stripped = line.strip()

        # MIME 行 → 丢弃
        if _MIME_RE.match(stripped):
            continue

        # 邮件头行
        match = _EMAIL_HEADER_RE.match(stripped)
        if match:
            in_email_headers = True
            field = match.group(1)
            # 规范化字段名：首字母大写（From/To/Date/Subject）
            normalized_field = field[0].upper() + field[1:].lower()
            # 提取字段值
            value = stripped[match.end():].strip()
            if value:
                result.append(f"{normalized_field}: {value}")
            else:
                result.append(f"{normalized_field}:")
            continue

        # 邮件头可能跨行（以空格/Tab 开头的续行）
        if in_email_headers and stripped and stripped[0] in (" ", "\t"):
            # 续行：追加到上一行
            if result:
                result[-1] = result[-1].rstrip() + " " + stripped.lstrip()
            continue

        # 空行标记邮件头结束
        if in_email_headers and not stripped:
            in_email_headers = False

        result.append(line)

    return result
