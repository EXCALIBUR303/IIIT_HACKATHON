"""Reward ledger service: exactly-once issuance and wallet reads."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import advisory_lock
from app.engine.money import SimulationError
from app.models import RewardLedgerEntry, User
from app.rewards.rules import Award


def balance(db: Session, student_id: Any) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(RewardLedgerEntry.amount), 0)).where(
                RewardLedgerEntry.student_id == student_id
            )
        )
        or 0
    )


def issue(
    db: Session, student: User, awards: list[Award], *, source_type: str, source_ref: str
) -> list[dict[str, Any]]:
    """Issue each award at most once per student. Returns the entries newly created.

    Duplicates (same idempotency key, including concurrent requests) are
    absorbed by a SAVEPOINT around the unique constraint, so the caller's
    transaction is never poisoned.
    """
    created: list[dict[str, Any]] = []
    for award in awards:
        exists = db.scalar(
            select(RewardLedgerEntry.id).where(
                RewardLedgerEntry.student_id == student.id,
                RewardLedgerEntry.idempotency_key == award.idempotency_key,
            )
        )
        if exists:
            continue
        try:
            with db.begin_nested():
                entry = RewardLedgerEntry(
                    student_id=student.id,
                    entry_type="reward",
                    amount=award.amount,
                    rule_key=award.rule_key,
                    source_type=source_type,
                    source_ref=source_ref,
                    concept=award.concept,
                    reason=award.reason,
                    idempotency_key=award.idempotency_key,
                )
                db.add(entry)
                db.flush()
        except IntegrityError:
            continue
        created.append(entry_out(entry))
    return created


def entry_out(e: RewardLedgerEntry) -> dict[str, Any]:
    return {
        "id": e.id,
        "entry_type": e.entry_type,
        "amount": e.amount,
        "reason": e.reason,
        "rule_key": e.rule_key,
        "source_type": e.source_type,
        "source_ref": e.source_ref,
        "concept": e.concept,
        "created_at": e.created_at,
    }


def for_source(db: Session, student_id: Any, source_ref: str) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(RewardLedgerEntry)
        .where(
            RewardLedgerEntry.student_id == student_id,
            RewardLedgerEntry.source_ref == source_ref,
            RewardLedgerEntry.entry_type == "reward",
        )
        .order_by(RewardLedgerEntry.id)
    )
    return [entry_out(r) for r in rows]


def wallet(db: Session, student: User, limit: int = 50) -> dict[str, Any]:
    rows = list(
        db.scalars(
            select(RewardLedgerEntry)
            .where(RewardLedgerEntry.student_id == student.id)
            .order_by(RewardLedgerEntry.id.desc())
            .limit(limit)
        )
    )
    earned = int(
        db.scalar(
            select(func.coalesce(func.sum(RewardLedgerEntry.amount), 0)).where(
                RewardLedgerEntry.student_id == student.id, RewardLedgerEntry.amount > 0
            )
        )
        or 0
    )
    return {
        "balance": balance(db, student.id),
        "total_earned": earned,
        "history": [entry_out(r) for r in rows],
        "notice": (
            "Fictional learning money. It rewards what you understand, cannot be cashed out, "
            "and has nothing to do with real money or real investments."
        ),
    }


def debit_transfer(
    db: Session, student: User, amount: int, *, request_id: str, run_number: int
) -> dict[str, Any]:
    """Move whole fictional rupees out of the wallet (into a practice portfolio).

    Serialised per student so two simultaneous transfers cannot both pass the
    balance check. The idempotency key is derived from the client request id.
    """
    if isinstance(amount, bool) or not isinstance(amount, int) or amount < 1:
        raise SimulationError("Transfer amount must be a whole number of rupees", field="amount")
    advisory_lock(db, "wallet", student.id)
    if amount > balance(db, student.id):
        raise SimulationError(
            "Your learning wallet does not have enough for this transfer.",
            code="insufficient_wallet",
            field="amount",
        )
    entry = RewardLedgerEntry(
        student_id=student.id,
        entry_type="transfer_out",
        amount=-amount,
        rule_key="transfer",
        source_type="portfolio",
        source_ref=f"run:{run_number}",
        reason="Moved to your practice portfolio. Transfers are one-way.",
        idempotency_key=f"transfer:{request_id}",
    )
    db.add(entry)
    db.flush()
    return entry_out(entry)
