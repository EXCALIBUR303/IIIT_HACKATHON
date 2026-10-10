from decimal import Decimal

import pytest

from app.content import loader
from app.engine import money_lab as lab
from app.engine.money import SimulationError


def scenario():
    cfg = next(s for s in loader.scenarios() if s["slug"] == "money-lab-500")["config"]
    return lab.scenario_from_config(cfg)


def plan(sc, spend=100, ready=150, deposit=250, growth=0):
    return lab.parse_plan(
        sc, {"spend": spend, "ready": ready, "deposit": deposit, "growth": growth}
    )


def test_plan_must_use_all_of_the_500_in_whole_rupees():
    sc = scenario()
    with pytest.raises(SimulationError) as err:
        lab.parse_plan(sc, {"spend": 100, "ready": 100, "deposit": 100, "growth": 100})
    assert err.value.code == "allocation_total"
    with pytest.raises(SimulationError):
        lab.parse_plan(sc, {"spend": 100.5, "ready": 149.5, "deposit": 250, "growth": 0})
    with pytest.raises(SimulationError):
        lab.parse_plan(sc, {"spend": 100, "ready": -50, "deposit": 450, "growth": 0})


def test_essential_spending_must_be_covered():
    sc = scenario()
    with pytest.raises(SimulationError) as err:
        lab.parse_plan(sc, {"spend": 50, "ready": 150, "deposit": 300, "growth": 0})
    assert err.value.code == "needs_uncovered"


def test_deposit_compounds_monthly_in_whole_paise_and_cash_does_not_grow():
    sc = scenario()
    p = plan(sc, spend=100, ready=0, deposit=400, growth=0)
    bal = lab.balances_at_event(sc, p, lab.pick_path(sc, 0))
    assert bal["ready"] == 0 and bal["growth"] == 0
    assert bal["deposit"] == Decimal("406.03")  # 400 * (1 + 0.06/12)^3, rounded each month


def test_path_choice_is_deterministic_by_seed():
    sc = scenario()
    assert lab.pick_path(sc, 7) == lab.pick_path(sc, 7)
    assert {lab.pick_path(sc, s)["key"] for s in range(3)} == {"steady", "dip", "slump"}


def test_event_options_flag_infeasible_sources():
    sc = scenario()
    p = plan(sc, spend=300, ready=50, deposit=150, growth=0)
    options = {o["key"]: o for o in lab.event_options(sc, p, lab.pick_path(sc, 0))}
    assert options["ready"]["feasible"] is False  # only ₹50 ready for a ₹120 need
    assert options["deposit"]["feasible"] is True and options["borrow"]["feasible"] is True
    with pytest.raises(SimulationError) as err:
        lab.resolve_event(sc, p, lab.pick_path(sc, 0), "ready")
    assert err.value.code == "infeasible_response"


def test_prepared_plan_reaches_the_goal_and_scores_well():
    sc = scenario()
    out = lab.resolve_event(sc, plan(sc), lab.pick_path(sc, 0), "ready")
    assert out.goal_reached and out.score >= 80
    assert out.borrowed == 0 and out.concept_evidence["emergency_fund"] is True
    assert out.real_value < out.saved_total and out.inflation_drag > 0  # inflation is shown


def test_borrowing_costs_extra_and_scores_lower():
    sc = scenario()
    p = plan(sc)
    paid = lab.resolve_event(sc, p, lab.pick_path(sc, 0), "ready")
    borrowed = lab.resolve_event(sc, p, lab.pick_path(sc, 0), "borrow")
    assert borrowed.repay_extra == Decimal("12.00") and borrowed.score < paid.score
    assert borrowed.components["liquidity"] == 0
    assert borrowed.concept_evidence["emergency_fund"] is False


def test_score_does_not_depend_on_which_market_path_the_seed_picked():
    sc = scenario()
    for p in (plan(sc), plan(sc, spend=100, ready=150, deposit=0, growth=250)):
        scores = {lab.resolve_event(sc, p, path, "ready").score for path in sc.growth_paths}
        assert len(scores) == 1


def test_putting_most_money_in_the_growth_basket_is_penalised_for_risk():
    sc = scenario()
    risky = plan(sc, spend=100, ready=0, deposit=0, growth=400)
    out = lab.resolve_event(sc, risky, lab.pick_path(sc, 0), "borrow")
    assert out.components["risk_balance"] == 0
    assert out.concept_evidence["risk_return"] is False


def test_hoarding_cash_is_flagged_for_inflation():
    sc = scenario()
    hoard = plan(sc, spend=100, ready=400, deposit=0, growth=0)
    out = lab.resolve_event(sc, hoard, lab.pick_path(sc, 0), "ready")
    assert out.components["inflation_awareness"] == 0
    assert any(f["concept"] == "inflation" for f in out.feedback)


def test_spending_everything_misses_the_goal():
    sc = scenario()
    out = lab.resolve_event(
        sc, plan(sc, spend=400, ready=50, deposit=50, growth=0), lab.pick_path(sc, 0), "borrow"
    )
    assert not out.goal_reached and out.components["goal_plan"] < 22


def test_timeline_and_assumptions_are_complete_and_honest():
    sc = scenario()
    out = lab.resolve_event(sc, plan(sc), lab.pick_path(sc, 1), "ready")
    assert [t["month"] for t in out.timeline] == list(range(sc.months + 1))
    a = lab.assumptions(sc)
    assert a["months"] == 6 and a["inflation_pct"] == 6 and a["limitations"]
    assert "not advice" in a["disclaimer"].lower()


def test_outcome_serialises_to_plain_numbers():
    sc = scenario()
    d = lab.resolve_event(sc, plan(sc), lab.pick_path(sc, 2), "deposit").as_dict()
    assert all(isinstance(v, (int, float, str, bool, list, dict)) for v in d.values())
    assert 0 <= d["score"] <= 100
