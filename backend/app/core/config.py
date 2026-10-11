"""Application settings loaded from environment variables (see .env.example)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="RUPEERISE_", extra="ignore")

    env: str = "development"
    database_url: str = "postgresql+psycopg://localhost:5432/rupeerise"
    # Must be overridden outside development. A missing secret in production fails fast.
    secret_key: str = "dev-only-insecure-secret-change-me"
    # Short-lived access token; the refresh session (HttpOnly cookie) renews it.
    access_token_minutes: int = 15
    refresh_days: int = 14
    bcrypt_rounds: int = 12
    # Origins allowed to call the API with credentials. Must include the public site origin,
    # because unsafe cookie-authenticated requests are rejected from any other Origin.
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    # Cookie `Secure` flag. None = on in production, off elsewhere (plain-HTTP local dev).
    cookie_secure: bool | None = None
    # Interactive docs: on in development, off in production unless explicitly enabled.
    enable_api_docs: bool | None = None

    # Abuse limits (fixed windows, counted in PostgreSQL so they hold across API instances).
    rate_limit_enabled: bool = True
    rl_login_ip: int = 40  # per IP per 15 min
    rl_login_user: int = 8  # per IP+username per 15 min
    rl_register_ip: int = 10  # student registrations per IP per hour
    rl_invite_ip: int = 10  # educator-invite attempts per IP per hour
    rl_invite_token: int = 20  # attempts per invite token per hour
    rl_join_ip: int = 20  # cohort join attempts per IP per hour
    rl_join_student: int = 10  # per student per hour
    rl_tutor_hour: int = 20  # tutor questions per student per hour
    rl_tutor_day: int = 100  # tutor questions per student per day
    rl_password_user: int = 6  # password / re-authentication attempts per user per hour

    # Learning integrity.
    quiz_cooldown_seconds: int = 60  # wait after a failed module-quiz attempt
    quiz_cooldown_after_failures: int = 2  # failures before the cooldown starts
    # Directory holding private answer keys (never committed). See docs/content-privacy.md.
    private_content_dir: str = ""

    # Market Lab reference data. Server-side only: these keys are never sent to the browser.
    # Without them, clearly labelled demo prices and explainers are used.
    alpha_vantage_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("ALPHA_VANTAGE_API_KEY", "RUPEERISE_ALPHA_VANTAGE_API_KEY"),
    )
    marketaux_api_token: str = Field(
        default="",
        validation_alias=AliasChoices("MARKETAUX_API_TOKEN", "RUPEERISE_MARKETAUX_API_TOKEN"),
    )
    market_data_ttl_minutes: int = 720  # Alpha Vantage free tier: ~25 calls/day, 9 per refresh
    news_ttl_minutes: int = 45  # Marketaux free tier: ~100 calls/day, 2 per refresh

    # Portfolio Quest abuse control: trades per simulated year.
    portfolio_max_actions_per_round: int = 40  # buys, sells and transfers in one fictional year
    rl_portfolio_hour: int = 300  # portfolio writes per student per hour
    # Optional AI tutor. Empty key = deterministic explanations only.
    anthropic_api_key: str = ""
    tutor_model: str = "claude-opus-5-5"
    tutor_effort: str = "low"
    tutor_timeout_seconds: float = 12.0
    tutor_max_tokens: int = 1500
    # Portfolio Quest: fictional practice cash a new run starts with (whole rupees).
    portfolio_starting_cash_rupees: int = 10_000

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def secure_cookies(self) -> bool:
        return self.is_production if self.cookie_secure is None else self.cookie_secure

    @property
    def docs_enabled(self) -> bool:
        return (not self.is_production) if self.enable_api_docs is None else self.enable_api_docs


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.is_production and settings.secret_key.startswith("dev-only"):
        raise RuntimeError("RUPEERISE_SECRET_KEY must be set in production")
    if settings.is_production and not settings.secure_cookies:
        raise RuntimeError("Cookies must be Secure in production (serve over HTTPS)")
    return settings
