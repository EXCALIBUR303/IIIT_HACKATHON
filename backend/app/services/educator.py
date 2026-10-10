"""Cohort analytics for educators and NGO coordinators.

Privacy: educators see only students in cohorts belonging to their own
organisation, identified by the display name/nickname the student chose.
Aggregates use set-based queries so a cohort of hundreds stays fast.
"""

from __future__ import annotations

import secrets
import string
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.content import loader
from app.learning import stages
from app.learning.adaptive import MISCONCEPTIONS, QUIZ_PASS
from app.models import (
    Assessment,
    AssessmentAttempt,
    Cohort,
    CohortMembership,
    ConceptMastery,
    LearningModule,
    Question,
    QuestionResponse,
    Reflection,
    Scenario,
    SimulationSession,
    User,
)

JOIN_ALPHABET = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"


def new_join_code(db: Session) -> str:
    while True:
        code = "".join(secrets.choice(JOIN_ALPHABET) for _ in range(6))
        if not db.scalar(select(Cohort.id).where(Cohort.join_code == code)):
            return code


def cohort_summaries(db: Session, educator: User) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Cohort, func.count(CohortMembership.student_id))
        .outerjoin(CohortMembership)
        .where(Cohort.organization_id == educator.organization_id)
        .group_by(Cohort.id)
        .order_by(Cohort.created_at)
    )
    return [
        {
            "id": c.id,
            "name": c.name,
            "join_code": c.join_code,
            "student_count": n,
            "created_at": c.created_at,
        }
        for c, n in rows
    ]


def _student_ids(db: Session, cohort: Cohort) -> list:
    return list(
        db.scalars(
            select(CohortMembership.student_id).where(CohortMembership.cohort_id == cohort.id)
        )
    )


def overview(db: Session, cohort: Cohort) -> dict[str, Any]:
    ids = _student_ids(db, cohort)
    modules = list(db.scalars(select(LearningModule).order_by(LearningModule.order)))
    concepts = loader.concept_map()
    base = {
        "cohort": {"id": cohort.id, "name": cohort.name, "join_code": cohort.join_code},
        "student_count": len(ids),
        "generated_at": datetime.now(UTC).isoformat(),
    }
    if not ids:
        return {
            **base,
            "participation": {"active_7d": 0, "started": 0, "onboarded": 0},
            "modules": [
                {"slug": m.slug, "title": m.title, "pillar": m.pillar, "completed": 0, "started": 0}
                for m in modules
            ],
            "concepts": [],
            "assessment": {"initial_avg": None, "post_avg": None, "paired": 0, "avg_change": None},
            "support_topics": [],
            "misconceptions": [],
            "students": [],
            "stages": [],
            "reflection_gaps": [],
            "follow_ups": [],
        }

    students = {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids)))}
    week_ago = datetime.now(UTC) - timedelta(days=7)

    # Module progress: simulation completed in module + quiz best per module.
    sim_rows = db.execute(
        select(SimulationSession.student_id, Scenario.module_id)
        .join(Scenario)
        .where(SimulationSession.student_id.in_(ids), SimulationSession.status == "completed")
        .distinct()
    )
    sim_done: dict[Any, set[int]] = defaultdict(set)
    for sid, mid in sim_rows:
        sim_done[sid].add(mid)
    quiz_rows = db.execute(
        select(
            AssessmentAttempt.student_id,
            Assessment.module_id,
            func.max(AssessmentAttempt.score_pct),
        )
        .join(Assessment)
        .where(
            AssessmentAttempt.student_id.in_(ids),
            AssessmentAttempt.submitted_at.is_not(None),
            Assessment.kind == "module",
        )
        .group_by(AssessmentAttempt.student_id, Assessment.module_id)
    )
    quiz_best: dict[tuple, int] = {(sid, mid): best for sid, mid, best in quiz_rows}

    def module_completed(sid, mid) -> bool:
        return mid in sim_done[sid] and quiz_best.get((sid, mid), 0) >= QUIZ_PASS

    module_stats = []
    for m in modules:
        module_stats.append(
            {
                "slug": m.slug,
                "title": m.title,
                "pillar": m.pillar,
                "completed": sum(1 for sid in ids if module_completed(sid, m.id)),
                "started": sum(
                    1 for sid in ids if m.id in sim_done[sid] or (sid, m.id) in quiz_best
                ),
            }
        )

    # Concept mastery across the cohort (only students with evidence count).
    mastery_rows = list(
        db.scalars(select(ConceptMastery).where(ConceptMastery.student_id.in_(ids)))
    )
    by_concept: dict[str, list[float]] = defaultdict(list)
    by_student: dict[Any, list[float]] = defaultdict(list)
    for r in mastery_rows:
        if r.evidence_count:
            by_concept[r.concept].append(r.mastery)
            by_student[r.student_id].append(r.mastery)
    concept_stats = []
    for key, meta in concepts.items():
        values = by_concept.get(key, [])
        concept_stats.append(
            {
                "concept": key,
                "title": meta["title"],
                "pillar": meta["pillar"],
                "students_assessed": len(values),
                "avg_mastery": round(sum(values) / len(values), 3) if values else None,
                "needs_practice": sum(1 for v in values if v < 0.5),
            }
        )

    # Pre/post (only students who took both count toward "change").
    scores = db.execute(
        select(AssessmentAttempt.student_id, Assessment.slug, AssessmentAttempt.score_pct)
        .join(Assessment)
        .where(
            AssessmentAttempt.student_id.in_(ids),
            AssessmentAttempt.submitted_at.is_not(None),
            Assessment.slug.in_(["initial", "post"]),
        )
    )
    pre: dict[Any, int] = {}
    post: dict[Any, int] = {}
    for sid, slug, score in scores:
        (pre if slug == "initial" else post)[sid] = score
    paired = [sid for sid in pre if sid in post]
    assessment = {
        "initial_avg": round(sum(pre.values()) / len(pre)) if pre else None,
        "initial_count": len(pre),
        "post_avg": round(sum(post.values()) / len(post)) if post else None,
        "post_count": len(post),
        "paired": len(paired),
        "avg_change": round(sum(post[s] - pre[s] for s in paired) / len(paired), 1)
        if paired
        else None,
        "note": "Change is computed only for students who completed both checks.",
    }

    # Common misconceptions from incorrect answers.
    mis_rows = db.execute(
        select(QuestionResponse.misconception, Question.concept, func.count())
        .join(Question)
        .join(AssessmentAttempt)
        .where(AssessmentAttempt.student_id.in_(ids), QuestionResponse.misconception.is_not(None))
        .group_by(QuestionResponse.misconception, Question.concept)
        .order_by(func.count().desc())
        .limit(8)
    )
    misconceptions = [
        {
            "key": key,
            "label": MISCONCEPTIONS.get(key, key.replace("_", " ")),
            "concept": concept,
            "count": n,
        }
        for key, concept, n in mis_rows
    ]

    support = sorted(
        (c for c in concept_stats if c["avg_mastery"] is not None and c["avg_mastery"] < 0.6),
        key=lambda c: c["avg_mastery"],
    )[:5]

    profiles = {u.id: u.profile for u in students.values()}
    student_rows = []
    for sid in ids:
        u = students[sid]
        values = by_student.get(sid, [])
        avg = sum(values) / len(values) if values else None
        student_rows.append(
            {
                "id": str(sid),
                "display_name": u.display_name,
                "last_active_at": u.last_active_at.isoformat() if u.last_active_at else None,
                "onboarded": bool(profiles[sid] and profiles[sid].onboarding_completed),
                "modules_completed": sum(1 for m in modules if module_completed(sid, m.id)),
                "avg_mastery": round(avg, 3) if avg is not None else None,
                "initial_score": pre.get(sid),
                "post_score": post.get(sid),
                "needs_support": avg is not None and avg < 0.5,
            }
        )
    student_rows.sort(key=lambda r: r["display_name"].lower())

    return {
        **base,
        "participation": {
            "active_7d": sum(
                1 for u in students.values() if u.last_active_at and u.last_active_at >= week_ago
            ),
            "started": sum(1 for sid in ids if sim_done[sid] or sid in pre),
            "onboarded": sum(1 for r in student_rows if r["onboarded"]),
        },
        "modules": module_stats,
        "concepts": concept_stats,
        "assessment": assessment,
        "support_topics": support,
        "misconceptions": misconceptions,
        "students": student_rows,
        **_stage_and_reflection(db, ids, profiles, support, misconceptions),
    }


FOLLOW_UP_TEXT = {
    "budgeting": "Run a 10-minute activity: list needs and wants for a week of pocket money.",
    "saving": "Ask pairs to compare saving a fixed amount early versus what is left at month end.",
    "investing": "Discuss why one bad outcome hurts less when money is spread out.",
    "safety": "Role-play one scam message and have students name the red flag before the action.",
}


def _stage_and_reflection(db, ids, profiles, support, misconceptions) -> dict[str, Any]:
    """Aggregate-only extras: stage mix, reflection gaps and suggested instructional follow-up."""
    counts: dict[str, int] = defaultdict(int)
    for p in profiles.values():
        counts[stages.stage_for(p.grade if p else None)] += 1
    stage_rows = [
        {
            "key": k,
            "label": stages.info(k).label,
            "grades": stages.info(k).grades,
            "students": counts[k],
        }
        for k in stages.ORDER
        if counts[k]
    ]
    gap_rows = db.execute(
        select(Reflection.concept, Reflection.misconception, func.count())
        .where(Reflection.student_id.in_(ids), Reflection.is_correct.is_(False))
        .group_by(Reflection.concept, Reflection.misconception)
        .order_by(func.count().desc())
        .limit(6)
    )
    gaps = [
        {
            "concept": c,
            "label": MISCONCEPTIONS.get(m, (m or "unclear reasoning").replace("_", " ")),
            "count": n,
        }
        for c, m, n in gap_rows
    ]
    concepts = loader.concept_map()
    follow: list[dict[str, str]] = []
    for topic in support[:3]:
        text = FOLLOW_UP_TEXT.get(topic["pillar"], "Revisit this concept with a short example.")
        follow.append({"topic": topic["title"], "suggestion": text})
    if misconceptions and len(follow) < 4:
        top = misconceptions[0]
        follow.append(
            {
                "topic": concepts.get(top["concept"], {}).get("title", top["concept"]),
                "suggestion": f"Address the common mix-up: {top['label']}.",
            }
        )
    return {"stages": stage_rows, "reflection_gaps": gaps, "follow_ups": follow}
