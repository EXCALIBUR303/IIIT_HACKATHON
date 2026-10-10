from decimal import Decimal

import pytest

from app.content import loader
from app.engine import budget
from app.engine.money import SimulationError


def scenario(slug="budget-meera-pocket-money"):
    cfg = next(s for s in loader.scenarios() if s["slug"] == slug)["config"]
    return budget.scenario_from_config(cfg)


GOOD = {
    "bus_pass": 600,
    "lunch": 400,
    "stationery": 200,
    "recharge": 149,
    "outings": 150,
    "gaming": 50,
    "savings": 400,
}


def test_all_budget_scenarios_load():
    for s in loader.scenarios():
        if s["kind"] == "budget":
            assert budget.scenario_from_config(s["config"]).income > 0


def test_good_allocation_scores_well_and_balances():
    sc = scenario()
    r = budget.evaluate_allocation(sc, GOOD)
    assert r.total_allocated == Decimal("1949.00")
    assert r.buffer == Decimal("51.00")
    assert r.needs_total + r.wants_total + r.savings_total + r.buffer == sc.income
    assert r.shortfalls == {}
    assert r.components["needs_covered"] == 40
    assert r.components["goal_on_track"] == 20  # 400 >= 1200/3
    assert r.score >= 90
    assert r.concept_evidence["needs_vs_wants"] is True


def test_over_budget_is_rejected():
    with pytest.raises(SimulationError) as exc:
        budget.evaluate_allocation(scenario(), {**GOOD, "outings": 500})
    assert exc.value.code == "over_budget"


@pytest.mark.parametrize("bad", [{"bus_pass": -10}, {"unknown": 10}, {"bus_pass": "lots"}, []])
def test_invalid_allocations_rejected(bad):
    with pytest.raises(SimulationError):
        budget.evaluate_allocation(scenario(), bad)


def test_zero_allocation_is_valid_but_scores_low():
    r = budget.evaluate_allocation(scenario(), {})
    assert r.buffer == Decimal("2000.00")
    assert set(r.shortfalls) == {"bus_pass", "lunch", "stationery", "recharge"}
    assert r.components["needs_covered"] == 0
    assert any(f.tone == "negative" and f.concept == "needs_vs_wants" for f in r.feedback)


def test_wants_heavy_budget_loses_wants_points():
    r = budget.evaluate_allocation(
        scenario(),
        {
            "bus_pass": 600,
            "lunch": 400,
            "stationery": 200,
            "recharge": 149,
            "outings": 400,
            "gaming": 251,
            "savings": 0,
        },
    )
    assert r.components["wants_in_check"] < 15
    assert r.components["savings_habit"] == 0
    assert r.concept_evidence["saving_habit"] is False


def test_event_selection_is_deterministic():
    sc = scenario()
    assert budget.pick_event(sc, 7) == budget.pick_event(sc, 7)
    keys = {budget.pick_event(sc, s).key for s in range(10)}
    assert keys == {e.key for e in sc.events}


def test_response_feasibility_and_best_choice():
    sc = scenario()
    alloc = budget.evaluate_allocation(sc, GOOD)
    event = next(e for e in sc.events if e.key == "lost_geometry_box")  # ₹250
    opts = {o.key: o for o in budget.response_options(alloc, event)}
    assert not opts["cut_wants"].feasible  # wants are only ₹200
    assert opts["mix"].feasible and opts["use_savings"].feasible and opts["borrow"].feasible
    assert "skip" not in opts  # essential events cannot be skipped
    assert budget.best_response(alloc, event) == "mix"


def test_mix_response_spends_wants_then_buffer_then_savings():
    sc = scenario()
    alloc = budget.evaluate_allocation(sc, GOOD)
    event = next(e for e in sc.events if e.key == "lost_geometry_box")
    out = budget.apply_event(sc, alloc, event, "mix")
    assert out.paid_from == {
        "wants": Decimal("200.00"),
        "buffer": Decimal("50.00"),
        "savings": Decimal("0.00"),
    }
    assert out.remaining_savings == Decimal("400.00")
    assert out.handling_score == 100
    assert out.borrowed == 0


def test_borrowing_when_alternatives_exist_is_penalised():
    sc = scenario()
    alloc = budget.evaluate_allocation(sc, GOOD)
    event = next(e for e in sc.events if e.key == "bus_fare_hike")
    out = budget.apply_event(sc, alloc, event, "borrow")
    assert out.borrowed == Decimal("150.00")
    assert out.handling_score == 30
    assert out.concept_evidence["emergency_fund"] is False


def test_borrowing_is_full_marks_when_nothing_else_possible():
    sc = scenario()
    broke = {
        "bus_pass": 600,
        "lunch": 400,
        "stationery": 200,
        "recharge": 149,
        "outings": 451,
        "gaming": 200,
        "savings": 0,
    }
    alloc = budget.evaluate_allocation(sc, broke)
    event = budget.BudgetEvent("big", "Big", "", Decimal("1000"))
    assert budget.best_response(alloc, event) == "borrow"
    assert budget.apply_event(sc, alloc, event, "borrow").handling_score == 100


def test_infeasible_and_unknown_responses_rejected():
    sc = scenario()
    alloc = budget.evaluate_allocation(sc, GOOD)
    event = next(e for e in sc.events if e.key == "lost_geometry_box")
    with pytest.raises(SimulationError) as exc:
        budget.apply_event(sc, alloc, event, "cut_wants")
    assert exc.value.code == "infeasible_response"
    with pytest.raises(SimulationError):
        budget.apply_event(sc, alloc, event, "skip")
    with pytest.raises(SimulationError):
        budget.apply_event(sc, alloc, event, "win_lottery")


def test_optional_event_can_be_skipped():
    sc = scenario()
    alloc = budget.evaluate_allocation(sc, GOOD)
    event = next(e for e in sc.events if e.key == "friend_birthday")
    out = budget.apply_event(sc, alloc, event, "skip")
    assert out.handling_score == 100 and out.paid_from["savings"] == 0


def test_final_score_weights():
    sc = scenario()
    alloc = budget.evaluate_allocation(sc, GOOD)
    event = next(e for e in sc.events if e.key == "bus_fare_hike")
    out = budget.apply_event(sc, alloc, event, "borrow")
    assert budget.final_score(alloc, out) == round(alloc.score * 0.7 + 30 * 0.3)


def test_income_drop_event_handled_like_expense():
    sc = scenario("budget-arjun-stall")
    alloc = budget.evaluate_allocation(
        sc,
        {
            "family_share": 1500,
            "transport": 400,
            "exam_material": 500,
            "recharge": 249,
            "lunch": 600,
            "cricket": 200,
            "gaming": 51,
            "savings": 1000,
        },
    )
    event = next(e for e in sc.events if e.kind == "income_drop")
    out = budget.apply_event(sc, alloc, event, "mix")
    assert out.paid_from["wants"] == Decimal("251.00")
    assert out.remaining_savings == Decimal("251.00")


@pytest.mark.parametrize(
    "patch",
    [
        {"income": 0},
        {"goal": {"label": "x", "amount": 100, "months": 0}},
        {"events": []},
        {"categories": [{"key": "a", "label": "A", "kind": "need", "essential_min": 99999}]},
    ],
)
def test_bad_configs_rejected(patch):
    cfg = next(s for s in loader.scenarios() if s["slug"] == "budget-meera-pocket-money")["config"]
    with pytest.raises(SimulationError):
        budget.scenario_from_config({**cfg, **patch})
