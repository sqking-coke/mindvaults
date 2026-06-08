"""TXT Preprocessor 功能测试。"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.preprocessor import PreprocessorRouter


async def test_separator_removal():
    """分隔线应被移除。"""
    page = """第一章 概述
---------------

Python 是一门广泛使用的编程语言。

==============

第二章 安装
---------------

pip install python"""
    
    router = PreprocessorRouter()
    result = await router.preprocess("txt", [(page, None)])
    text = result[0][0] if result else ""
    
    assert "-------" not in text, f"Dash separator not removed: {text}"
    assert "=======" not in text, f"Equals separator not removed: {text}"
    assert "Python 是一门" in text, "Content should be preserved"
    assert "pip install" in text, "Content should be preserved"
    print("  PASSED: separator removal")


async def test_noise_filtering():
    """超短行、纯标点、连续重复行应被过滤。"""
    page = """## 标题

正文内容开始。

++
...
1
1

重复行
重复行

正常内容继续。"""
    
    router = PreprocessorRouter()
    result = await router.preprocess("txt", [(page, None)])
    text = result[0][0] if result else ""
    
    assert "正文内容开始" in text
    assert "正常内容继续" in text
    # 连续重复行只保留一次
    count = text.count("重复行")
    assert count == 1, f"Duplicate expected 1, got {count}: {text}"
    print("  PASSED: noise filtering")


async def test_blank_normalization():
    """连续空行应被压缩。"""
    page = "段落一。\n\n\n\n段落二。\n\n\n\n\n段落三。"
    
    router = PreprocessorRouter()
    result = await router.preprocess("txt", [(page, None)])
    text = result[0][0] if result else ""
    
    assert "\n\n\n" not in text, f"Triple blanks not normalized: {repr(text)}"
    assert "段落一" in text and "段落二" in text and "段落三" in text
    print("  PASSED: blank normalization")


async def test_email_header_normalization():
    """邮件头应被检测并规范化。"""
    page = """From: alice@example.com
To: bob@example.com
Date: 2024-01-15
Subject: Meeting Notes

会议讨论了以下要点：

1. GIL 移除计划
2. 性能优化方案"""
    
    router = PreprocessorRouter()
    result = await router.preprocess("txt", [(page, None)])
    text = result[0][0] if result else ""
    
    assert "From: alice@example.com" in text, "From header should be preserved"
    assert "To: bob@example.com" in text, "To header should be preserved"
    assert "Date: 2024-01-15" in text, "Date header should be preserved"
    assert "Subject: Meeting Notes" in text, "Subject header should be preserved"
    assert "会议讨论了以下要点" in text, "Email body should be preserved"
    assert "GIL 移除计划" in text
    print("  PASSED: email header normalization")


async def test_mime_headers_removed():
    """MIME 头应被剔除。"""
    page = """From: sender@test.com
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: base64
MIME-Version: 1.0

这是邮件正文。"""
    
    router = PreprocessorRouter()
    result = await router.preprocess("txt", [(page, None)])
    text = result[0][0] if result else ""
    
    assert "Content-Type" not in text, f"MIME Content-Type not removed: {text}"
    assert "Content-Transfer-Encoding" not in text, "MIME CTE not removed"
    assert "MIME-Version" not in text, "MIME-Version not removed"
    assert "这是邮件正文" in text, "Body should survive"
    assert "From: sender@test.com" in text, "From should survive"
    print("  PASSED: MIME headers removed")


async def test_log_timestamps_preserved():
    """日志时间戳行应保留。"""
    page = """2024-01-15 14:30:00 INFO Starting service
2024-01-15 14:30:01 DEBUG Connecting to DB
[2024-01-15 14:30:02] ERROR Connection timeout

正常文本。"""
    
    router = PreprocessorRouter()
    result = await router.preprocess("txt", [(page, None)])
    text = result[0][0] if result else ""
    
    assert "2024-01-15 14:30:00" in text, "Log timestamp lost!"
    assert "Starting service" in text
    assert "Connection timeout" in text
    assert "正常文本" in text
    print("  PASSED: log timestamps preserved")


async def test_empty_input():
    """空输入安全处理。"""
    router = PreprocessorRouter()
    result = await router.preprocess("txt", [("", None), ("   \n  ", None)])
    assert len(result) == 0 or all(not t.strip() for t, _ in result)
    print("  PASSED: empty input")


async def test_mixed_noise_and_content():
    """混合噪声和正文的综合场景。"""
    page = """=====================
      会议纪要
=====================

日期：2024-01-15
参会人：张三、李四

---
1. 项目进度
---

第一阶段的开发工作已完成。

---
2. 问题讨论
---

...

GIL 性能优化需要进一步测试。

------
结束
------"""
    
    router = PreprocessorRouter()
    result = await router.preprocess("txt", [(page, None)])
    text = result[0][0] if result else ""
    
    assert "会议纪要" in text, "Title lost"
    assert "第一阶段" in text, "Content lost"
    assert "GIL 性能优化" in text, "Content lost"
    # 分隔线应被移除
    assert "=====" not in text, f"Separator not removed: {text}"
    assert "---" not in text, f"Dash separator not fully removed: {text}"
    # 超短噪声应被移除
    assert "..." not in text
    print("  PASSED: mixed noise and content")


async def main():
    print("=== TXT Preprocessor Tests ===\n")
    await test_separator_removal()
    await test_noise_filtering()
    await test_blank_normalization()
    await test_email_header_normalization()
    await test_mime_headers_removed()
    await test_log_timestamps_preserved()
    await test_empty_input()
    await test_mixed_noise_and_content()
    print("\n=== All TXT Preprocessor tests passed ===")


if __name__ == "__main__":
    asyncio.run(main())
