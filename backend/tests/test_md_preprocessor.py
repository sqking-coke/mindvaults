"""MD Preprocessor 功能测试。"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.preprocessor import PreprocessorRouter


async def test_table_and_code_block():
    """测试表格 unsplittable + 长代码块完整性。"""
    test_md = (
        "## 数据库对比\n\n"
        "| 数据库 | 类型 | 适用场景 |\n"
        "|--------|------|----------|\n"
        "| PostgreSQL | 关系型 | 通用 |\n"
        "| MongoDB | 文档型 | 灵活 schema |\n"
        "| Redis | 内存型 | 缓存 |\n\n"
        "## 长代码块\n\n"
        "```python\n"
        "import asyncio\n"
        "from typing import Optional, Dict, Any, List\n"
        "from dataclasses import dataclass\n\n"
        "@dataclass\n"
        "class DatabaseConfig:\n"
        "    host: str\n"
        "    port: int = 5432\n"
        "    username: str = 'admin'\n"
        "    password: Optional[str] = None\n"
        "    database: str = 'mindvaults'\n"
        "    pool_size: int = 10\n"
        "    max_overflow: int = 20\n"
        "    echo: bool = False\n\n"
        "async def create_pool(config: DatabaseConfig) -> Any:\n"
        "    engine = await create_async_engine(\n"
        "        f'postgresql+asyncpg://{config.username}:{config.password}'\n"
        "        f'@{config.host}:{config.port}/{config.database}',\n"
        "        pool_size=config.pool_size,\n"
        "        max_overflow=config.max_overflow,\n"
        "        echo=config.echo,\n"
        "    )\n"
        "    return engine\n"
        "```\n"
    )

    router = PreprocessorRouter()
    result = await router.preprocess("md", [(test_md, None)])
    print(f"Chunks: {len(result)}")
    for i, (text, page) in enumerate(result):
        fence_count = text.count("```")
        has_table = text.count("| 数据库 |")
        print(f"Chunk {i+1}: {len(text)} chars, code_fences={fence_count}, table_marker={has_table > 0}")

        if has_table:
            assert fence_count == 0, f"Table chunk should not have code! fences={fence_count}"
            print("  => Table is standalone")

        if fence_count >= 2:
            assert "```python" in text, "Code block opening missing!"
            assert text.strip().endswith("```"), f"Code block not closed!"
            print("  => Code block complete")

    print(f"  PASSED: {len(result)} chunks")


async def test_no_headings():
    """测试无标题文档的隐式结构。"""
    test_md = """Python 是一门广泛使用的编程语言。
它的设计哲学强调代码可读性和简洁语法。

GIL 是 CPython 的核心机制。
它确保同一时刻只有一个线程执行字节码。


常用的 Python Web 框架：

- Django：全栈框架，电池内置
- Flask：微框架，灵活轻量
- FastAPI：现代异步，自动 API 文档
"""

    router = PreprocessorRouter()
    result = await router.preprocess("md", [(test_md, None)])
    print(f"\nNo-headings test: {len(result)} chunks")
    for i, (text, page) in enumerate(result):
        print(f"  Chunk {i+1}: {len(text)} chars, starts: {text[:60].replace(chr(10), ' ')}...")
    print(f"  PASSED: {len(result)} chunks")


async def test_nested_sections():
    """测试深层嵌套标题。"""
    test_md = """# Python 并发编程

概述文本。

## 线程模型

线程是操作系统调度的最小单位。

### GIL 的影响

Python 的 GIL 限制了多线程并发。

#### CPython 中的 GIL

CPython 实现中的具体机制说明。

### 线程池

concurrent.futures 模块提供线程池抽象。

## 进程模型

进程有独立的内存空间和 GIL。
"""

    router = PreprocessorRouter()
    result = await router.preprocess("md", [(test_md, None)])
    print(f"\nNested sections test: {len(result)} chunks")
    for i, (text, page) in enumerate(result):
        lines = text.split("\n")
        first_heading = next((l for l in lines if l.startswith("#")), "no heading")
        print(f"  Chunk {i+1}: {len(text)} chars, heading={first_heading}")
    print(f"  PASSED: {len(result)} chunks")


async def test_wiki_image_links():
    """测试 Wiki 链接和图片链接清洗。"""
    test_md = """## 参考链接

参考 [[Python 并发模型|GIL 详解]] 了解更多细节。

也可查看 [[CPython 源码分析]] 获取实现层面的理解。

架构图：![系统架构](architecture.png)

安装步骤：![安装向导](images/setup.png)
"""

    router = PreprocessorRouter()
    result = await router.preprocess("md", [(test_md, None)])
    text = result[0][0]
    assert "GIL 详解" in text, "Wiki link with alias not converted!"
    assert "[[Python" not in text, "Wiki link bracket not removed!"
    assert "CPython 源码分析" in text, "Wiki link without alias not converted!"
    assert "[图片: 系统架构]" in text, "Image link not replaced!"
    assert "[图片: 安装向导]" in text, "Image link not replaced!"
    assert "![系统架构](architecture.png)" not in text, "Raw image syntax not cleaned!"
    print("\nWiki/Image links test PASSED")


async def main():
    await test_table_and_code_block()
    await test_no_headings()
    await test_nested_sections()
    await test_wiki_image_links()
    print("\n== All MD Preprocessor tests passed ==")


if __name__ == "__main__":
    asyncio.run(main())
