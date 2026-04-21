"""
Centralized configuration management with validation.
Uses pydantic-settings for type-safe environment variable management.
"""
import os
from functools import lru_cache
from typing import Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with validation."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Application settings
    APP_NAME: str = Field(default="FMCG Reconciliation AI", description="Application name")
    APP_VERSION: str = Field(default="1.0.0", description="Application version")
    DEBUG: bool = Field(default=False, description="Debug mode")

    # API settings
    API_HOST: str = Field(default="0.0.0.0", description="API host")
    API_PORT: int = Field(default=8000, ge=1, le=65535, description="API port")
    ALLOWED_ORIGINS: str = Field(
        default="http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173",
        description="Comma-separated list of allowed CORS origins"
    )

    # File upload settings
    MAX_FILE_SIZE_MB: int = Field(default=10, ge=1, le=100, description="Max file size in MB")
    ALLOWED_EXTENSIONS: str = Field(default="csv", description="Allowed file extensions")

    # LLM settings
    GEMINI_API_KEY: Optional[str] = Field(default=None, description="Google Gemini API key")
    GEMINI_MODEL: str = Field(default="gemini-1.5-flash", description="Gemini model to use")
    LLM_TEMPERATURE: float = Field(default=0.1, ge=0.0, le=1.0, description="LLM temperature")
    LLM_TIMEOUT_SECONDS: int = Field(default=30, ge=5, le=120, description="LLM API timeout")
    LLM_MAX_RETRIES: int = Field(default=3, ge=0, le=5, description="Max LLM API retries")
    LLM_CACHE_ENABLED: bool = Field(default=True, description="Enable LLM response caching")
    LLM_CACHE_SIZE: int = Field(default=1000, ge=100, le=10000, description="Max cache entries")

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = Field(default=True, description="Enable rate limiting")
    RATE_LIMIT_REQUESTS: int = Field(default=100, ge=10, description="Requests per minute")

    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")
    LOG_FORMAT: str = Field(
        default="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        description="Log format"
    )

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def parse_allowed_origins(cls, v: str) -> list[str]:
        """Parse comma-separated origins into a list."""
        return [origin.strip() for origin in v.split(",") if origin.strip()]

    @property
    def max_file_size_bytes(self) -> int:
        """Get max file size in bytes."""
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    @property
    def allowed_origins_list(self) -> list[str]:
        """Get allowed origins as a list."""
        return self.ALLOWED_ORIGINS

    def is_api_key_configured(self) -> bool:
        """Check if LLM API key is configured."""
        return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip())


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.

    Using lru_cache ensures we only load and validate settings once,
    then reuse the same instance throughout the application lifecycle.
    """
    return Settings()


# Convenience access to settings (for backward compatibility during migration)
settings = get_settings()
