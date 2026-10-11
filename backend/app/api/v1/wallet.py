"""Educational reward wallet (fictional learning money, read-only for students).

Balances are computed from the ledger on the server; the client can neither
set nor adjust them.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.api.deps import DB, Student
from app.schemas import WalletOut
from app.services import levels, rewards, streak

router = APIRouter(tags=["wallet"])


@router.get("/wallet", response_model=WalletOut)
def get_wallet(user: Student, db: DB, limit: int = Query(50, ge=1, le=200)) -> dict:
    out = rewards.wallet(db, user, limit)
    days = streak.summary(db, user)["active_days"]
    out["level"] = levels.level_for(levels.xp(out["total_earned"], days))
    return out
