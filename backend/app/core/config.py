"""Application settings loaded from environment variables (see .env.example)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="RUPEERISE_", extra="ignore")

    env: str = "development"
    database_url: str = "postgresql+psycopg://localhost:5432/rupeerise"
    # Must be overridden outside development. A missing secret in production fails fast.
    secret_key: str = "dev-only-insecure-secret-change-me"
    access_token_minutes: int = 12 * 60
    bcrypt_rounds: int = 12
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    # Educators self-register only with this code (shared by the NGO coordinator).
    educator_invite_code: str = "dev-educator-invite"
    # Optional AI tutor. Empty key = deterministic explanations only.
    anthropic_api_key: str = ""
    tutor_model: str = "claude-opus-5-5"
    tutor_effort: str = "low"
    tutor_timeout_seconds: float = 12.0
    # Portfolio Quest: fictional practice cash a new run starts with (whole rupees).
    portfolio_starting_cash_rupees: int = 10_000

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.is_production and settings.secret_key.startswith("dev-only"):
        raise RuntimeError("RUPEERISE_SECRET_KEY must be set in production")
    if settings.is_production and settings.educator_invite_code == "dev-educator-invite":
        raise RuntimeError("RUPEERISE_EDUCATOR_INVITE_CODE must be set in production")
    return settings
