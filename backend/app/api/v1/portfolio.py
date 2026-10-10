"""Portfolio Quest: a persisted FICTIONAL practice portfolio.

All money is integer paise, computed and validated on the server. Mutating
calls need ``confirm: true`` and a client ``request_id`` (a repeated request is
applied once). Nothing here uses live market data or gives investment advice.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.api.deps import DB, Student
from app.services import portfolio as svc

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

RequestId = Field(min_length=8, max_length=64)


class OpenIn(BaseModel):
    request_id: str = RequestId


class QuoteIn(BaseModel):
    instrument_key: str = Field(max_length=30)
    side: Literal["buy", "sell"]
    quantity: int = Field(strict=True)


class TradeIn(QuoteIn):
    request_id: str = RequestId
    confirm: bool = False


class ConfirmIn(BaseModel):
    request_id: str = RequestId
    confirm: bool = False


class TransferIn(ConfirmIn):
    amount: int = Field(strict=True, description="Whole rupees moved from the learning wallet")


@router.get("")
def get_portfolio(user: Student, db: DB) -> dict[str, Any]:
    return svc.view(db, user)


@router.post("/open")
def open_portfolio(body: OpenIn, user: Student, db: DB) -> dict[str, Any]:
    out = svc.open_portfolio(db, user, body.request_id)
    db.commit()
    return out


@router.post("/quote")
def quote(body: QuoteIn, user: Student, db: DB) -> dict[str, Any]:
    return svc.quote(db, user, body.instrument_key, body.side, body.quantity)


@router.post("/trades")
def trade(body: TradeIn, user: Student, db: DB) -> dict[str, Any]:
    out = svc.trade(
        db,
        user,
        request_id=body.request_id,
        instrument_key=body.instrument_key,
        side=body.side,
        quantity=body.quantity,
        confirm=body.confirm,
    )
    db.commit()
    return out


@router.post("/advance")
def advance(body: ConfirmIn, user: Student, db: DB) -> dict[str, Any]:
    out = svc.advance(db, user, request_id=body.request_id, confirm=body.confirm)
    db.commit()
    return out


@router.post("/reset")
def reset(body: ConfirmIn, user: Student, db: DB) -> dict[str, Any]:
    out = svc.reset(db, user, request_id=body.request_id, confirm=body.confirm)
    db.commit()
    return out


@router.post("/transfer")
def transfer(body: TransferIn, user: Student, db: DB) -> dict[str, Any]:
    out = svc.transfer_in(
        db, user, request_id=body.request_id, amount=body.amount, confirm=body.confirm
    )
    db.commit()
    return out


@router.get("/transactions")
def transactions(user: Student, db: DB, limit: int = Query(100, ge=1, le=500)) -> list[dict]:
    return svc.transactions(db, user, limit)
