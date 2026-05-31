import time
import uuid
import json

from fastapi import Request, Response
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.utils.logger import sanitize_body, should_log_body, is_health_check

limiter = Limiter(key_func=get_remote_address)
TRACE_HEADER = "X-Trace-Id"


def _generate_trace_id() -> str:
    return uuid.uuid4().hex[:16]


async def request_log_middleware(request: Request, call_next):
    """请求日志中间件：traceId、sessionId、请求/响应体、健康检查降噪、慢操作告警。"""
    trace_id = request.headers.get(TRACE_HEADER) or _generate_trace_id()
    request.state.trace_id = trace_id

    with logger.contextualize(trace_id=trace_id, session_id="—"):
        # —— 请求体日志（DEBUG 模式或 POST/PUT 请求） ——
        if should_log_body(request.method, request.url.path):
            try:
                body_bytes = await request.body()
                if body_bytes:
                    try:
                        body_dict = json.loads(body_bytes)
                        sanitized = sanitize_body(body_dict)
                        logger.bind(type="request").debug(
                            json.dumps(sanitized, ensure_ascii=False)
                        )
                    except json.JSONDecodeError:
                        logger.bind(type="request").debug(
                            json.dumps({"_raw": f"({len(body_bytes)} bytes, not json)"})
                        )
            except Exception:
                pass

        # —— 执行业务 ——
        start = time.perf_counter()
        response: Response = await call_next(request)
        elapsed = (time.perf_counter() - start) * 1000

        # —— 响应头透传 traceId ——
        response.headers[TRACE_HEADER] = trace_id

        # —— 健康检查降噪 ——
        if is_health_check(request.url.path):
            if response.status_code >= 400:
                logger.error(f"health_check_failed status={response.status_code}")
            return response

        # —— 慢操作告警 ——
        if elapsed > 5000:
            logger.bind(elapsed_ms=f"{elapsed:.1f}").warning(
                f"request_slow method={request.method} path={request.url.path} "
                f"status={response.status_code} elapsed={elapsed:.0f}ms"
            )
        else:
            logger.bind(
                method=request.method, path=request.url.path,
                status=response.status_code, elapsed_ms=f"{elapsed:.1f}",
            ).info("request_completed")

    return response
