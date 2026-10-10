"""RupeeRise API entry point."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.db import engine
from app.core.errors import register_error_handlers

settings = get_settings()

app = FastAPI(
    title="RupeeRise API",
    version="0.1.0",
    description="Financial literacy learning platform: fictional simulations, assessments, "
    "adaptive learning and educator analytics. Educational use only; not financial advice.",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
register_error_handlers(app)
app.include_router(api_router)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": db_ok, "version": app.version}
