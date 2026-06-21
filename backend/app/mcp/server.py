"""mindvaults MCP Server — 入口。

支持双模传输：
  - stdio: 本地开发，OpenClaw 拉起子进程
  - SSE (HTTP): Docker/NAS 部署，跨容器通信

启动方式:
    python -m app.mcp.server               # stdio
    python -m app.mcp.server --http         # HTTP :8001 (独立运行)
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


# ── HTTP 入口 ───────────────────────────────────────────────

def create_sse_app():
    """返回 SSE 传输的 ASGI 应用。

    在 FastAPI 主应用中通过 app.mount("/mcp", create_sse_app()) 挂载，
    或独立运行：python -m app.mcp.server --http
    """
    return mcp.sse_app()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--http", action="store_true", help="Run in HTTP/SSE mode instead of stdio")
    parser.add_argument("--host", default="0.0.0.0", help="HTTP host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8001, help="HTTP port (default: 8001)")
    args = parser.parse_args()

    if args.http:
        import uvicorn
        app = create_sse_app()
        uvicorn.run(app, host=args.host, port=args.port)
    else:
        main()
