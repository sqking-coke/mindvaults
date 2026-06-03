from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from loguru import logger


class AppException(Exception):
    """基础业务异常。code 对应 API 契约中的错误码。"""

    def __init__(
        self,
        code: int,
        message: str,
        detail: Any = None,
        status_code: int = 400,
    ):
        self.code = code
        self.message = message
        self.detail = detail
        self.status_code = status_code


# ── 校验异常 (1xxx) ──────────────────────────────────────

class BadRequestError(AppException):
    def __init__(self, message: str = "参数校验失败", detail: Any = None):
        super().__init__(code=1001, message=message, detail=detail, status_code=400)


class ValidationException(AppException):
    """多字段校验异常（支持字段级别错误列表）。"""
    def __init__(self, errors: list[dict] | str):
        if isinstance(errors, str):
            errors = [{"message": errors}]
        super().__init__(code=1002, message="字段校验不通过", detail=errors, status_code=422)


# ── 文档异常 (2xxx) ──────────────────────────────────────

class DocNotFoundError(AppException):
    def __init__(self, message: str = "文档不存在", detail: Any = None):
        super().__init__(code=2001, message=message, detail=detail, status_code=404)


class DocFormatUnsupportedError(AppException):
    def __init__(self, message: str = "文档格式不支持", detail: Any = None):
        super().__init__(code=2002, message=message, detail=detail, status_code=400)


class DocSizeExceededError(AppException):
    def __init__(self, message: str = "文档大小超出限制", detail: Any = None):
        super().__init__(code=2003, message=message, detail=detail, status_code=400)


class DocStatusInvalidError(AppException):
    def __init__(self, message: str = "无效的状态值，仅支持 disabled/enabled", detail: Any = None):
        super().__init__(code=2004, message=message, detail=detail, status_code=400)


# ── 会话异常 (3xxx) ──────────────────────────────────────

class SessionNotFoundError(AppException):
    def __init__(self, message: str = "会话不存在", detail: Any = None):
        super().__init__(code=3001, message=message, detail=detail, status_code=404)


# ── 检索异常 (4xxx) ──────────────────────────────────────

class RetrievalTimeoutError(AppException):
    def __init__(self, message: str = "向量检索超时", detail: Any = None):
        super().__init__(code=4001, message=message, detail=detail, status_code=504)


class ChunkNotFoundError(AppException):
    def __init__(self, message: str = "切片不存在", detail: Any = None):
        super().__init__(code=4004, message=message, detail=detail, status_code=404)


# ── 模型/Embedding 异常 (5xxx) ────────────────────────────

class LLMCallFailedError(AppException):
    def __init__(self, message: str = "大模型调用失败", detail: Any = None):
        super().__init__(code=5001, message=message, detail=detail, status_code=502)


class EmbeddingUnavailableError(AppException):
    def __init__(self, message: str = "Embedding 模型不可用", detail: Any = None):
        super().__init__(code=5002, message=message, detail=detail, status_code=502)


class LLMConfigRequiredError(AppException):
    """LLM/Embedding 未配置 API Key 等必要参数"""
    def __init__(self, message: str = "请先配置大模型 API Key", detail: Any = None):
        super().__init__(code=5003, message=message, detail=detail, status_code=400)


# ── KB 异常 (6xxx) ───────────────────────────────────────

class KbNotFoundError(AppException):
    def __init__(self, message: str = "知识库不存在", detail: Any = None):
        super().__init__(code=6001, message=message, detail=detail, status_code=404)


# ── 外部数据源异常 (7xxx) ─────────────────────────────────

class DataSourceError(AppException):
    def __init__(self, message: str = "外部数据源异常", detail: Any = None):
        super().__init__(code=7001, message=message, detail=detail, status_code=502)


# ── 基础设施异常 (8xxx) ───────────────────────────────────

class DatabaseError(AppException):
    def __init__(self, message: str = "数据库异常", detail: Any = None):
        super().__init__(code=8001, message=message, detail=detail, status_code=500)


class RedisError(AppException):
    def __init__(self, message: str = "Redis 异常", detail: Any = None):
        super().__init__(code=8002, message=message, detail=detail, status_code=500)


# ── 系统异常 (9xxx) ──────────────────────────────────────

class InternalError(AppException):
    def __init__(self, message: str = "服务内部错误", detail: Any = None):
        super().__init__(code=9001, message=message, detail=detail, status_code=500)


# ═══════════════════════════════════════════════════════════
# 全局异常处理器
# ═══════════════════════════════════════════════════════════

def _get_trace_id(request: Request) -> str:
    return getattr(request.state, "trace_id", "—")


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """业务异常 → 结构化响应 + 日志（WARNING 级别）。"""
    trace_id = _get_trace_id(request)
    body: dict = {"code": exc.code, "message": exc.message, "trace_id": trace_id}
    if exc.detail is not None:
        body["detail"] = exc.detail

    logger.bind(trace_id=trace_id).warning(
        f"business_exception code={exc.code} message=\"{exc.message}\" "
        f"method={request.method} path={request.url.path}"
    )

    return JSONResponse(status_code=exc.status_code, content=body)


async def validation_exception_handler(request: Request, exc: ValidationException) -> JSONResponse:
    """校验异常 → 422 + 字段详情。"""
    trace_id = _get_trace_id(request)
    body: dict = {"code": exc.code, "message": exc.message, "trace_id": trace_id}
    if exc.detail is not None:
        body["detail"] = exc.detail

    logger.bind(trace_id=trace_id).info(
        f"validation_failed errors={exc.detail}"
    )

    return JSONResponse(status_code=422, content=body)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """未捕获异常 → 500 + 日志 ERROR（不暴露 detail）。"""
    trace_id = _get_trace_id(request)

    # 提取 traceback 最后一行
    tb = exc.__traceback__
    tb_last = ""
    if tb:
        while tb.tb_next:
            tb = tb.tb_next
        tb_last = f"{tb.tb_frame.f_code.co_filename}:{tb.tb_lineno}"

    logger.bind(trace_id=trace_id).error(
        f"unhandled_exception error=\"{exc}\" traceback_last=\"{tb_last}\""
    )

    return JSONResponse(
        status_code=500,
        content={"code": 9001, "message": "服务内部错误", "trace_id": trace_id},
    )
