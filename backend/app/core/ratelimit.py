"""Abuse limits: fixed-window counters kept in PostgreSQL.

Why PostgreSQL: the API is stateless and may run as several instances, so counters must be
shared. The database is already a dependency, an upsert is one round trip, and counting uses
its own short transaction so a failed or rolled-back request is still counted. A dedicated
Redis would scale further; the ``hit`` function is the only seam to change.

Keys are hashed, so no usernames, IPs or invite tokens are stored in readable form.
"""

from __future__ import annotations

import hashlib
import math
from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import engine
from app.core.errors import ApiError

MINUTE = 60
HOUR = 3600
DAY = 86400


def client_ip(request: Request) -> str:
    """The caller's IP. Behind a proxy run uvicorn with --proxy-headers and a trusted proxy list."""
    return request.client.host if request.client else "unknown"


def _digest(*parts: object) -> str:
    return hashlib.sha256("\x1f".join(map(str, parts)).encode()).hexdigest()[:40]


def hit(scope: str, ident: object, limit: int, window_seconds: int) -> tuple[int, int]:
    """Count one event. Returns (count_in_window, seconds_until_window_ends)."""
    now = datetime.now(UTC)
    epoch = int(now.timestamp())
    start_epoch = epoch - epoch % window_seconds
    window_start = datetime.fromtimestamp(start_epoch, UTC)
    key = f"{scope}:{_digest(ident)}"
    with engine.begin() as conn:
        count = conn.execute(
            text(
                "INSERT INTO rate_limit_counters (key, window_start, count) "
                "VALUES (:k, :w, 1) "
                "ON CONFLICT (key, window_start) DO UPDATE "
                "SET count = rate_limit_counters.count + 1 RETURNING count"
            ),
            {"k": key, "w": window_start},
        ).scalar_one()
        # Opportunistic cleanup keeps the table small without a scheduler.
        if epoch % 50 == 0:
            conn.execute(
                text("DELETE FROM rate_limit_counters WHERE window_start < :old"),
                {"old": datetime.fromtimestamp(epoch - 2 * DAY, UTC)},
            )
    return count, max(1, start_epoch + window_seconds - epoch)


def enforce(scope: str, ident: object, limit: int, window_seconds: int) -> None:
    """Raise 429 once ``limit`` events have happened in the window."""
    if not get_settings().rate_limit_enabled:
        return
    count, retry = hit(scope, ident, limit, window_seconds)
    if count > limit:
        raise RateLimited(retry)


class RateLimited(ApiError):
    def __init__(self, retry_after: int):
        minutes = max(1, math.ceil(retry_after / 60))
        super().__init__(
            429,
            "rate_limited",
            f"Too many attempts. Please wait about {minutes} minute{'s' if minutes > 1 else ''} "
            "and try again.",
            headers={"Retry-After": str(retry_after)},
        )
        self.retry_after = retry_after
