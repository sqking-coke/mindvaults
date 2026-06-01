from fastapi import Request
from fastapi.responses import JSONResponse
from loguru import logger


class AppException(Exception):
    """基础业务异常。code 对应 API 契约中的错误码。"""

    def __init__(self, code: int, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code


class BadRequestError(AppException):
    def __init__(self, message: str = "参数校验失败"):
        super().__init__(code=1001, message=message, status_code=400)


class DocNotFoundError(AppException):
    def __init__(self, message: str = "文档不存在"):
        super().__init__(code=2001, message=message, status_code=404)


class DocFormatUnsupportedError(AppException):
    def __init__(self, message: str = "文档格式不支持"):
        super().__init__(code=2002, message=message, status_code=400)


class DocSizeExceededError(AppException):
    def __init__(self, message: str = "文档大小超出限制"):
        super().__init__(code=2003, message=message, status_code=400)


class SessionNotFoundError(AppException):
    def __init__(self, message: str = "会话不存在"):
        super().__init__(code=3001, message=message, status_code=404)


class RetrievalTimeoutError(AppException):
    def __init__(self, message: str = "向量检索超时"):
        super().__init__(code=4001, message=message, status_code=504)


class DocStatusInvalidError(AppException):
    def __init__(self, message: str = "无效的状态值，仅支持 disabled/enabled"):
        super().__init__(code=2004, message=message, status_code=400)


class LLMCallFailedError(AppException):
    def __init__(self, message: str = "大模型调用失败"):
        super().__init__(code=5001, message=message, status_code=502)


class LLMConfigRequiredError(AppException):
    """LLM/Embedding 未配置 API Key 等必要参数"""
    def __init__(self, message: str = "请先配置大模型 API Key"):
        super().__init__(code=5003, message=message, status_code=400)


class ChunkNotFoundError(AppException):
    def __init__(self, message: str = "切片不存在"):
        super().__init__(code=4004, message=message, status_code=404)


class EmbeddingUnavailableError(AppException):
    def __init__(self, message: str = "Embedding 模型不可用"):
        super().__init__(code=5002, message=message, status_code=502)


class InternalError(AppException):
    def __init__(self, message: str = "服务内部错误"):
        super().__init__(code=9001, message=message, status_code=500)


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    logger.warning(f"[{exc.code}] {exc.message} | {request.method} {request.url.path}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(f"Unhandled error: {exc} | {request.method} {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={"code": 9001, "message": "服务内部错误"},
    )
