from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    # --- 应用 ---
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    API_KEY: str = "change-me-in-production"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost"
    RATE_LIMIT_ENABLED: bool = True

    # --- 数据库 ---
    DATABASE_URL: str = "postgresql+asyncpg://mindvaults:mindvaults@localhost:5432/mindvaults"

    # --- Redis ---
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_CACHE_TTL: int = 3600
    REDIS_CACHE_ENABLED: bool = True
    THINKING_TTL_SECONDS: int = 604800  # 7 天

    # --- LLM Provider: ollama | openai ---
    # ollama = 调用本地 Ollama 原生 API (http://host:11434/api/chat)
    # openai = 调用 OpenAI 兼容 API (https://api.openai.com/v1/chat/completions)
    LLM_PROVIDER: str = "ollama"
    LLM_BASE_URL: str = "http://localhost:11434"
    LLM_MODEL: str = "qwen3"
    LLM_API_KEY: str = ""

    # --- Embedding Provider: ollama | openai ---
    # ollama = 调用本地 Ollama 原生 API
    # openai = 调用 OpenAI 兼容 API (/embeddings)
    EMBEDDING_PROVIDER: str = "ollama"
    EMBEDDING_MODEL: str = "BAAI/bge-large-zh-v1.5"
    EMBEDDING_DIM: int = 1024
    EMBEDDING_BASE_URL: str = ""
    EMBEDDING_API_KEY: str = ""

    # --- Demo 模式 ---
    DEMO_MODE: bool = False

    # --- 上传 ---
    UPLOAD_DIR: str = str(Path(__file__).resolve().parent.parent / "uploads")
    # demo 模式默认 5MB，生产环境可在 .env 中覆盖
    MAX_UPLOAD_SIZE_MB: int = 50
    MAX_FILES_PER_UPLOAD: int = 20
    ALLOWED_EXTENSIONS: str = "txt,md,pdf,docx,doc"

    # --- 限流 (demo 模式更严格) ---
    CHAT_RATE_LIMIT: str = "30/minute"
    UPLOAD_RATE_LIMIT: str = "10/minute"

    # --- 日志 ---
    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = str(Path(__file__).resolve().parent.parent / "logs")
    LOG_RETENTION: int = 30
    SLOW_REQUEST_THRESHOLD_MS: int = 5000
    SLOW_RETRIEVAL_THRESHOLD_MS: int = 500

    @property
    def allowed_extensions_list(self) -> list[str]:
        return [ext.strip() for ext in self.ALLOWED_EXTENSIONS.split(",")]


settings = Settings()
