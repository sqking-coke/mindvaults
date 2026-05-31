import time
import uuid

from fastapi import Request
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

TRACE_HEADER = "X-Trace-Id"


def _generate_trace_id() -> str:
    """生成短 traceId：去掉 UUID 的横线，取前 16 位。"""
    return uuid.uuid4().hex[:16]


async def request_log_middleware(request: Request, call_next):
    """请求日志中间件：注入 traceId、记录耗时、毫秒级时间戳。"""

    # 生成或透传 traceId
    trace_id = request.headers.get(TRACE_HEADER) or _generate_trace_id()
    request.state.trace_id = trace_id

    # 注入 loguru 上下文（后续日志自动携带）
    with logger.contextualize(trace_id=trace_id):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed = (time.perf_counter() - start) * 1000

        # 响应头透传 traceId（方便前端关联）
        response.headers[TRACE_HEADER] = trace_id

        logger.bind(
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            elapsed_ms=f"{elapsed:.1f}",
        ).info("request completed")

    return response
