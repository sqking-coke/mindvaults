"""企业级日志工具类。

用法:
  from app.utils.logger import log_event
  log_event("doc_uploaded", doc_id=8, kb_id=2, file="arch.md")
"""
import json
from loguru import logger

# --- 脱敏 ---

SENSITIVE_KEYS = {"api_key", "llm_api_key", "password", "authorization", "token", "secret"}


def mask_secret(value: str, keep: int = 4) -> str:
    """脱敏字符串，保留前后各 keep 位。"""
    if not value or len(value) <= keep:
        return "***"
    return f"{value[:keep]}••••{value[-keep:]}"


def sanitize_body(body: dict) -> dict:
    """递归脱敏请求体中的敏感字段。"""
    if not isinstance(body, dict):
        return body
    return {
        k: "***" if k in SENSITIVE_KEYS else sanitize_body(v) if isinstance(v, dict) else v
        for k, v in body.items()
    }


# --- 业务事件日志 ---

def log_event(action: str, **kwargs) -> None:
    """记录结构化业务事件。

    用法:
      log_event("doc_uploaded", doc_id=8, kb_id=2, file="arch.md", size="128KB")
    输出:
      doc_uploaded doc_id=8 kb_id=2 file=arch.md size=128KB
    """
    msg = action + " " + " ".join(f"{k}={v}" for k, v in kwargs.items())
    logger.info(msg)


# --- 条件控制 ---

def is_health_check(path: str) -> bool:
    """判断请求路径是否为健康检查。"""
    return path.startswith("/api/v1/health")


def should_log_body(method: str, path: str, content_length: int = 0) -> bool:
    """判断是否应记录请求体（健康检查跳过，超长截断）。"""
    if is_health_check(path):
        return False
    if method in ("GET", "HEAD", "OPTIONS"):
        return False
    return True
