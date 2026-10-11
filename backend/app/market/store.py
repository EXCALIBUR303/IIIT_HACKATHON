"""Database-backed cache and refresh lock for provider data."""

from __future__ import annotations

import time
import zlib
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import MarketCache


def load(db: Session, prefix: str) -> dict[str, tuple[dict[str, Any], float]]:
    """Cached rows whose key starts with ``prefix`` -> {key: (payload, fetched_at epoch)}."""
    rows = db.scalars(select(MarketCache).where(MarketCache.key.like(f"{prefix}%")))
    return {r.key: (r.payload, r.fetched_at.timestamp()) for r in rows}


def save(db: Session, key: str, payload: dict[str, Any]) -> None:
    row = db.get(MarketCache, key)
    now = datetime.now(UTC)
    if row is None:
        db.add(MarketCache(key=key, payload=payload, fetched_at=now))
    else:
        row.payload = payload
        row.fetched_at = now
    db.flush()


def backoff_active(db: Session, key: str) -> bool:
    row = db.get(MarketCache, key)
    return bool(row and float(row.payload.get("until", 0)) > time.time())


def set_backoff(db: Session, key: str, seconds: float) -> None:
    save(db, key, {"until": time.time() + seconds})


def try_refresh_lock(db: Session, name: str) -> bool:
    """Only one request at a time spends provider quota; the rest serve the cache.

    The lock is held until the surrounding transaction ends, so callers must commit (or roll
    back) promptly after refreshing. On databases without advisory locks the refresh just runs.
    """
    if db.get_bind().dialect.name != "postgresql":
        return True
    key = zlib.crc32(f"market-refresh:{name}".encode())
    return bool(db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": key}).scalar())
