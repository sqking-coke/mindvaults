"""mindvaults MCP Server — 入口。

通过 stdio JSON-RPC 与 AI Agent 通信。
启动方式:
    python -m app.mcp.server
    python backend/app/mcp/server.py
"""

import sys
import os

# 确保 backend 在 sys.path 中（支持从任意目录启动）
_backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from mcp.server.fastmcp import FastMCP

from app.mcp.tools import register_tools

# ── 创建 FastMCP 实例 ────────────────────────────────────────

mcp = FastMCP(name="mindvaults")

# 注册所有工具
register_tools(mcp)


# ── stdio 入口 ──────────────────────────────────────────────

def main():
    """stdio 传输入口：被 OpenClaw / Claude Desktop 作为子进程拉起。"""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
