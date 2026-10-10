"""Concept mastery model (transparent, documented in docs/architecture.md).

Each piece of evidence is (correct?, weight). Mastery is a smoothed ratio:

    mastery = (weighted_correct + 0.5) / (weighted_total + 1)

The +0.5/+1 prior stops one lucky answer from showing 100%. Weights:

* Initial / final check answer ............ 1.0
* Module quiz answer, attempt n ........... 1/n   (retakes count less, so
                                                 re-guessing until correct
                                                 cannot inflate mastery)
* Simulation decision evidence ............ 0.5
* Any answer given in < 2 seconds ......... x0.25 (likely a guess)

Mastery is tracked separately from activity completion and achievements.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ConceptMastery

RAPID_RESPONSE_MS = 2000
RAPID_WEIGHT = 0.25
SIMULATION_WEIGHT = 0.5
MASTERED = 0.8
DEVELOPING = 0.5
MIN_WEIGHT_FOR_MASTERED = 2.0


@dataclass(frozen=True)
class Evidence:
    concept: str
    correct: bool
    weight: float
    misconception: str | None = None


def smoothed(weighted_correct: float, weighted_total: float) -> float:
    return (weighted_correct + 0.5) / (weighted_total + 1)


def level(row: ConceptMastery | None) -> str:
    if row is None or row.evidence_count == 0:
        return "not_started"
    if row.mastery >= MASTERED and row.weighted_total >= MIN_WEIGHT_FOR_MASTERED:
        return "mastered"
    if row.mastery >= DEVELOPING:
        return "developing"
    return "needs_practice"


def record(db: Session, student_id: uuid.UUID, evidence: list[Evidence]) -> None:
    """Apply evidence to the student's concept mastery rows (caller commits)."""
    if not evidence:
        return
    concepts = {e.concept for e in evidence}
    rows = {
        r.concept: r
        for r in db.scalars(
            select(ConceptMastery).where(
                ConceptMastery.student_id == student_id, ConceptMastery.concept.in_(concepts)
            )
        )
    }
    for e in evidence:
        if e.weight <= 0:
            continue
        row = rows.get(e.concept)
        if row is None:
            row = ConceptMastery(
                student_id=student_id,
                concept=e.concept,
                evidence_count=0,
                weighted_correct=0.0,
                weighted_total=0.0,
                mastery=0.0,
            )
            db.add(row)
            rows[e.concept] = row
        row.evidence_count += 1
        row.weighted_total += e.weight
        if e.correct:
            row.weighted_correct += e.weight
        else:
            row.last_misconception = e.misconception or row.last_misconception
        row.mastery = round(smoothed(row.weighted_correct, row.weighted_total), 4)


def simulation_evidence(concept_evidence: dict[str, bool]) -> list[Evidence]:
    return [Evidence(c, ok, SIMULATION_WEIGHT) for c, ok in concept_evidence.items()]
