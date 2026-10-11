"""Learning streaks: which days a student practised, from activity already recorded.

A day counts when the student did any real learning activity: a mission, a quiz or
check, a reflection, a Portfolio Quest action or a Market Lab decision. Days use
India time so "today" matches the student's calendar. Milestones are badges only;
streaks never pay out money.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AssessmentAttempt,
    PortfolioTransaction,
    Reflection,
    SimulationSession,
    User,
)

from .market_lab import entries_by_day

TZ = ZoneInfo("Asia/Kolkata")
WEEKS = 12
MILESTONES = (
    (7, "One week"),
    (14, "Two weeks"),
    (30, "30 days"),
    (47, "47 days"),
    (84, "12 weeks"),
)


def _day(ts: datetime | str | None) -> date | None:
    if ts is None:
        return None
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts)
        except ValueError:
            return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=UTC)
    return ts.astimezone(TZ).date()


def _level(count: int) -> int:
    return 0 if count == 0 else 1 if count == 1 else 2 if count <= 3 else 3 if count <= 6 else 4


def summary(db: Session, student: User, *, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    today = now.astimezone(TZ).date()
    # The grid starts on the Monday WEEKS-1 weeks before this week's Monday.
    first = today - timedelta(days=today.weekday()) - timedelta(weeks=WEEKS - 1)
    since = datetime.combine(first, datetime.min.time(), TZ)

    counts: dict[date, int] = {}
    learning_today = 0

    def add(ts: datetime | str | None, *, learning: bool = False) -> None:
        nonlocal learning_today
        d = _day(ts)
        if d is None or d < first:
            return
        counts[d] = counts.get(d, 0) + 1
        if learning and d == today:
            learning_today += 1

    sid = student.id
    for ts in db.scalars(
        select(SimulationSession.started_at).where(
            SimulationSession.student_id == sid, SimulationSession.started_at >= since
        )
    ):
        add(ts, learning=True)
    for ts in db.scalars(
        select(AssessmentAttempt.submitted_at).where(
            AssessmentAttempt.student_id == sid, AssessmentAttempt.submitted_at >= since
        )
    ):
        add(ts, learning=True)
    for ts in db.scalars(
        select(Reflection.created_at).where(
            Reflection.student_id == sid, Reflection.created_at >= since
        )
    ):
        add(ts, learning=True)
    for ts in db.scalars(
        select(PortfolioTransaction.created_at)
        .where(PortfolioTransaction.student_id == sid, PortfolioTransaction.created_at >= since)
        .limit(2000)
    ):
        add(ts)
    entries = entries_by_day(db, student, since)
    decisions_today = 0
    reasons_today: set[str] = set()
    for j in entries:
        add(j.get("at"))
        if _day(j.get("at")) == today:
            decisions_today += 1
            reasons_today.add(j.get("reason", ""))

    days = [first + timedelta(days=i) for i in range((today - first).days + 1)]
    grid = [
        {"date": d.isoformat(), "count": counts.get(d, 0), "level": _level(counts.get(d, 0))}
        for d in days
    ]
    active = [counts.get(d, 0) > 0 for d in days]

    # Current streak: consecutive active days ending today, or yesterday if today is not done.
    current = 0
    i = len(active) - 1
    if i >= 0 and not active[i]:
        i -= 1
    while i >= 0 and active[i]:
        current += 1
        i -= 1
    longest = run = 0
    for a in active:
        run = run + 1 if a else 0
        longest = max(longest, run)

    best = max(current, longest)
    next_m = next((m for m, _ in MILESTONES if m > best), None)
    return {
        "today": today.isoformat(),
        "weeks": WEEKS,
        "days": grid,
        "current": current,
        "longest": longest,
        "active_days": sum(active),
        "today_done": bool(active and active[-1]),
        "milestones": [
            {"days": m, "label": label, "reached": best >= m} for m, label in MILESTONES
        ],
        "next_milestone": next_m,
        "habits": [
            {
                "key": "decide",
                "label": "Make one Market Lab decision",
                "done": decisions_today > 0,
            },
            {
                "key": "reasons",
                "label": "Use two different reasons today",
                "done": len(reasons_today) >= 2,
            },
            {
                "key": "learn",
                "label": "Finish a mission, check or reflection",
                "done": learning_today > 0,
            },
        ],
    }
