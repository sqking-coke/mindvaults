from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.core.database import get_db
from app.core.exceptions import AppException


class UnauthorizedError(AppException):
    """API Key 无效或缺失。"""
    def __init__(self, detail: str = "Invalid or missing API key"):
        super().__init__(code=1003, message="未授权访问", detail=detail, status_code=401)


async def verify_api_key(request: Request) -> None:
    """P1：Bearer Token 鉴权。API_KEY 为空或默认值时放行。"""
    if not settings.API_KEY or settings.API_KEY == "change-me-in-production":
        return
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    if not token or token != settings.API_KEY:
        raise UnauthorizedError()
