"""Learning levels: a progress bar built only from what a student has demonstrated.

XP is derived on every read from data that already exists (RR coins earned, which are paid only
for understanding, plus a few points per practice day), so there is nothing to keep in sync and
nothing a client can set. Profit and loss never count.
"""

from __future__ import annotations

from typing import Any

XP_PER_ACTIVE_DAY = 5

# (minimum XP, title). The last level has no "next".
LEVELS: tuple[tuple[int, str], ...] = (
    (0, "Saver"),
    (50, "Budgeter"),
    (150, "Planner"),
    (300, "Investor in training"),
    (500, "Market watcher"),
    (800, "Portfolio builder"),
)


def xp(total_earned: int, active_days: int) -> int:
    return max(total_earned, 0) + XP_PER_ACTIVE_DAY * max(active_days, 0)


def level_for(points: int) -> dict[str, Any]:
    idx = max(i for i, (floor, _) in enumerate(LEVELS) if points >= floor)
    floor, title = LEVELS[idx]
    nxt = LEVELS[idx + 1] if idx + 1 < len(LEVELS) else None
    return {
        "xp": points,
        "level": idx + 1,
        "title": title,
        "xp_into_level": points - floor,
        "xp_for_level": (nxt[0] - floor) if nxt else 0,
        "next_title": nxt[1] if nxt else None,
        "max_level": nxt is None,
        "sources": f"RR coins earned plus {XP_PER_ACTIVE_DAY} XP for each practice day",
    }
