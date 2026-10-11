"""A tiny refresh-in-background cache for slow, rate-limited providers.

Requests never wait on a provider: they get the last good value (or the demo
fallback) immediately, and a single daemon thread refreshes when the value is
stale. Failures back off so a dead or rate-limited API is not hammered.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable

log = logging.getLogger(__name__)


class BackgroundCache[T]:
    def __init__(self, name: str, ttl_seconds: float, backoff_seconds: float):
        self.name = name
        self.ttl = ttl_seconds
        self.backoff = backoff_seconds
        self._value: T | None = None
        self._fetched_at = 0.0
        self._retry_after = 0.0
        self._lock = threading.Lock()
        self._refreshing = False

    @property
    def fetched_at(self) -> float:
        return self._fetched_at

    def get(self, fetch: Callable[[T | None], T | None], *, wait: bool = False) -> T | None:
        """Return the cached value, starting a refresh when it is stale.

        ``fetch`` receives the previous value (so it can merge) and returns the new
        value, or ``None`` on failure. ``wait`` refreshes inline (used by tests).
        """
        now = time.monotonic()
        stale = self._value is None or now - self._fetched_at > self.ttl
        if stale and now >= self._retry_after:
            with self._lock:
                start = not self._refreshing
                self._refreshing = self._refreshing or start
            if start:
                if wait:
                    self._refresh(fetch)
                else:
                    threading.Thread(
                        target=self._refresh, args=(fetch,), name=f"refresh-{self.name}",
                        daemon=True,
                    ).start()  # fmt: skip
        return self._value

    def _refresh(self, fetch: Callable[[T | None], T | None]) -> None:
        try:
            value = fetch(self._value)
        except Exception:  # noqa: BLE001 - a provider must never take the API down
            log.exception("%s refresh failed", self.name)
            value = None
        with self._lock:
            if value is None:
                self._retry_after = time.monotonic() + self.backoff
            else:
                self._value = value
                self._fetched_at = time.monotonic()
                self._retry_after = 0.0
            self._refreshing = False

    def clear(self) -> None:
        with self._lock:
            self._value = None
            self._fetched_at = 0.0
            self._retry_after = 0.0
