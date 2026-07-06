import time
import uuid
import json
import re

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.core.redis import get_redis
from app.utils.logger import sanitize_body, should_log_body, is_health_check

limiter = Limiter(key_func=get_remote_address)
TRACE_HEADER = "X-Trace-Id"

# ── IP 黑名单配置 ──
BLACKLIST_WINDOW_SEC = 60       # 统计窗口 60 秒
BLACKLIST_THRESHOLD = 300       # 窗口内超过 300 次请求即封禁
BLACKLIST_BAN_SEC = 600         # 封禁时长 10 分钟
BLACKLIST_REDIS_KEY = "demo:blacklist"
BLACKLIST_RATE_KEY = "demo:rate"

# 从路径中提取 session_id 的模式
_SESSION_PATH_PATTERNS = [
    re.compile(r"/sessions/([^/]+)"),
    re.compile(r"/thinking/([^/]+)"),
]


def _extract_session_id(request: Request, body_dict: dict | None) -> str:
    """从请求中提取 session_id，优先级：路径 > 查询参数 > 请求体 > 默认。"""
    # 1. 路径参数：/sessions/{id} 或 /thinking/{id}
    for pat in _SESSION_PATH_PATTERNS:
        m = pat.search(request.url.path)
        if m:
            return m.group(1)

    # 2. 查询参数：?session_id=xxx
    qs = request.query_params.get("session_id")
    if qs:
        return qs

    # 3. 请求体：{"session_id": "xxx"}
    if body_dict and "session_id" in body_dict:
        sid = body_dict["session_id"]
        if isinstance(sid, str):
            return sid

    return "—"


def _generate_trace_id() -> str:
    return uuid.uuid4().hex[:16]


async def _get_client_ip(request: Request) -> str:
    """获取客户端真实 IP（优先 X-Forwarded-For）。"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def ip_blacklist_middleware(request: Request, call_next):
    """Demo 模式 IP 高频访问黑名单中间件。

    仅当 DEMO_MODE=true 时生效。在 60 秒窗口内超过 300 次请求的 IP
    将被封禁 10 分钟。Redis 不可用时自动降级放行。
    """
    if not settings.DEMO_MODE:
        return await call_next(request)

    # 健康检查不计数
    if is_health_check(request.url.path):
        return await call_next(request)

    ip = await _get_client_ip(request)
    now = int(time.time())
    window_key = f"{BLACKLIST_RATE_KEY}:{ip}:{now // BLACKLIST_WINDOW_SEC}"

    try:
        redis = await get_redis()
        if not redis:
            return await call_next(request)

        # 检查是否在黑名单中
        ban_until = await redis.zscore(BLACKLIST_REDIS_KEY, ip)
        if ban_until is not None and float(ban_until) > now:
            logger.warning(f"ip_blacklisted ip={ip} banned_until={int(float(ban_until))}")
            return JSONResponse(
                status_code=429,
                content={
                    "code": 429,
                    "message": f"访问过于频繁，IP 已被临时限制，请 {int(float(ban_until) - now)} 秒后重试",
                    "data": None,
                },
            )

        # 计数
        count = await redis.incr(window_key)
        if count == 1:
            await redis.expire(window_key, BLACKLIST_WINDOW_SEC + 10)

        # 超阈值 → 加入黑名单
        if count > BLACKLIST_THRESHOLD:
            ban_until_ts = now + BLACKLIST_BAN_SEC
            await redis.zadd(BLACKLIST_REDIS_KEY, {ip: ban_until_ts})
            await redis.expire(BLACKLIST_REDIS_KEY, BLACKLIST_BAN_SEC * 2)
            logger.warning(
                f"ip_rate_block ip={ip} count={count} "
                f"threshold={BLACKLIST_THRESHOLD} ban_seconds={BLACKLIST_BAN_SEC}"
            )

    except Exception as exc:
        logger.debug(f"ip_blacklist_bypass error={exc}")

    return await call_next(request)


async def request_log_middleware(request: Request, call_next):
    """请求日志中间件：traceId、sessionId、请求/响应体、健康检查降噪、慢操作告警。"""
    trace_id = request.headers.get(TRACE_HEADER) or _generate_trace_id()
    request.state.trace_id = trace_id

    # —— 读取请求体（POST/PUT），用于提取 session_id 和日志记录 ——
    body_dict: dict | None = None
    if request.method in ("POST", "PUT", "PATCH"):
        try:
            body_bytes = await request.body()
            if body_bytes:
                try:
                    body_dict = json.loads(body_bytes)
                except json.JSONDecodeError:
                    pass
        except Exception:
            pass

    session_id = _extract_session_id(request, body_dict)
    request.state.session_id = session_id

    with logger.contextualize(trace_id=trace_id, session_id=session_id):
        # —— 请求体日志 ——
        if body_dict and should_log_body(request.method, request.url.path):
            sanitized = sanitize_body(body_dict)
            logger.bind(type="request").debug(
                json.dumps(sanitized, ensure_ascii=False)
            )

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
