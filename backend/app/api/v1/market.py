"""Market Lab API: reference data, news and scenario practice for Portfolio Quest.

Reference prices and news come from server-side providers (keys never reach the
browser) and fall back to clearly labelled demo data. Scenario prices, cash and
profit/loss are computed only on the server. Writes need ``confirm`` where money
moves and a client ``request_id`` so a repeated request applies once.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Path, Response
from pydantic import BaseModel, Field

from app.api.deps import DB, Student
from app.core import ratelimit
from app.core.config import get_settings
from app.core.errors import not_found
from app.engine import market_lab as lab
from app.market.providers import market_provider, news_provider
from app.models import User
from app.services import market_lab as svc
from app.services import streak

router = APIRouter(prefix="/portfolio", tags=["market-lab"])

RequestId = Field(min_length=8, max_length=64)


def _write_budget(user: User) -> None:
    ratelimit.enforce("portfolio:write", user.id, get_settings().rl_portfolio_hour, ratelimit.HOUR)


class StartIn(BaseModel):
    request_id: str = RequestId
    scenario_key: str = Field(max_length=40)


class DecideIn(BaseModel):
    request_id: str = RequestId
    action: Literal["buy", "sell", "hold"]
    company_key: str = Field(max_length=30)
    quantity: int = Field(default=0, strict=True)
    reason: str = Field(max_length=30)
    confirm: bool = False


class AdvanceIn(BaseModel):
    request_id: str = RequestId


class FinishIn(BaseModel):
    request_id: str = RequestId
    answer: str = Field(max_length=4)


@router.get("/market-data")
def market_data(user: Student, db: DB) -> dict[str, Any]:
    """Reference closes for the watchlist (delayed real data or demo), never live trading data."""
    out = {**market_provider().snapshot(db), "disclaimer": lab.DISCLAIMER}
    db.commit()  # persists any refreshed closes and releases the refresh lock
    return out


@router.get("/news")
def news(user: Student, db: DB) -> dict[str, Any]:
    out = news_provider().feed(db)
    db.commit()
    return out


@router.get("/scenario")
def scenario(user: Student, db: DB) -> dict[str, Any]:
    return svc.overview(db, user)


@router.post("/scenario/start")
def start(body: StartIn, user: Student, db: DB) -> dict[str, Any]:
    _write_budget(user)
    out = svc.start(db, user, body.scenario_key, body.request_id)
    db.commit()
    return out


@router.post("/scenario/decisions")
def decide(body: DecideIn, user: Student, db: DB) -> dict[str, Any]:
    _write_budget(user)
    out = svc.decide(
        db,
        user,
        request_id=body.request_id,
        action=body.action,
        company_key=body.company_key,
        quantity=body.quantity,
        reason=body.reason,
        confirm=body.confirm,
    )
    db.commit()
    return out


@router.post("/scenario/advance")
def advance(body: AdvanceIn, user: Student, db: DB) -> dict[str, Any]:
    _write_budget(user)
    out = svc.advance(db, user, request_id=body.request_id)
    db.commit()
    return out


@router.post("/scenario/finish")
def finish(body: FinishIn, user: Student, db: DB) -> dict[str, Any]:
    _write_budget(user)
    out = svc.finish(db, user, request_id=body.request_id, answer=body.answer)
    db.commit()
    return out


@router.get("/streak")
def get_streak(user: Student, db: DB) -> dict[str, Any]:
    return streak.summary(db, user)


@router.get("/news/{item_id}/image")
def news_image(
    user: Student, db: DB, item_id: str = Path(pattern=r"^[A-Za-z0-9-]{1,64}$")
) -> Response:
    """A cached article thumbnail, served same-origin (the page never loads third-party images)."""
    got = news_provider().image(db, item_id)
    if got is None:
        raise not_found("Image")
    body, ctype = got
    return Response(
        body,
        media_type=ctype,
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )
