from decimal import Decimal

import pytest

from app.content import loader
from app.engine import savings
from app.engine.money import SimulationError


def scenario(slug):
    return savings.scenario_from_config(
        next(s for s in loader.scenarios() if s["slug"] == slug)["config"]
    )


def test_piggy_bank_earns_nothing():
    p = savings.project(monthly_deposit=500, months=4, compounding="none", annual_rate=0.05)
    assert p.final_balance == Decimal("2000.00")
    assert p.total_interest == 0


def test_compound_interest_known_value():
    # ₹1,000 opening, 12% p.a. compounded monthly (1% per month), no deposits, 12 months
    p = savings.project(monthly_deposit=0, months=12, annual_rate=0.12, opening_balance=1000)
    # Interest is credited in whole paise every month, like a real ledger, so the result can
    # differ from the unrounded formula 1000 * 1.01^12 = 1126.825 by a paisa.
    assert p.final_balance == Decimal("1126.84")
    assert abs(p.final_balance - Decimal("1126.825")) <= Decimal("0.02")
    assert p.rows[0].interest == Decimal("10.00") and p.rows[2].interest == Decimal("10.20")


def test_simple_interest_known_value():
    p = savings.project(
        monthly_deposit=0, months=12, annual_rate=0.12, opening_balance=1000, compounding="simple"
    )
    assert p.final_balance == Decimal("1120.00")


def test_compound_beats_simple_over_time():
    cmp = savings.compare_compounding(monthly_deposit=500, months=60, annual_rate=0.06)
    assert cmp["compounding_advantage"] > 0
    assert cmp["simple"]["total_deposited"] == cmp["compound"]["total_deposited"] == 30000.0


def test_withdrawal_capped_at_balance_and_timeline_consistent():
    p = savings.project(monthly_deposit=100, months=3, withdrawals={2: 1000})
    assert [r.withdrawal for r in p.rows] == [0, Decimal("200.00"), 0]
    assert p.final_balance == Decimal("100.00")
    for prev, row in zip(p.rows, p.rows[1:], strict=False):
        assert row.balance == prev.balance + row.deposit - row.withdrawal + row.interest


@pytest.mark.parametrize(
    "kwargs",
    [
        {"months": 0},
        {"months": 601},
        {"monthly_deposit": -1},
        {"compounding": "daily"},
        {"annual_rate": 2},
    ],
)
def test_projection_validation(kwargs):
    base = {"monthly_deposit": 100, "months": 12, "annual_rate": 0.05}
    with pytest.raises(SimulationError):
        savings.project(**{**base, **kwargs})


def test_head_start_rewards_starting_early():
    hs = savings.head_start(monthly_deposit=500, annual_rate=0.08, total_years=20, delay_years=10)
    assert hs["early"]["final_balance"] > 2 * hs["late"]["final_balance"]
    with pytest.raises(SimulationError):
        savings.head_start(monthly_deposit=500, annual_rate=0.08, total_years=5, delay_years=5)


def test_plan_capacity_enforced():
    sc = scenario("savings-meera-calculator")
    with pytest.raises(SimulationError) as exc:
        savings.parse_plan(
            sc, {"goal_saving": 500, "emergency_saving": 200, "account": "piggy_bank"}
        )
    assert exc.value.code == "over_capacity"
    with pytest.raises(SimulationError):
        savings.parse_plan(sc, {"goal_saving": 0, "emergency_saving": 0, "account": "piggy_bank"})
    with pytest.raises(SimulationError):
        savings.parse_plan(sc, {"goal_saving": 100, "account": "crypto"})


def test_emergency_fund_protects_goal():
    sc = scenario("savings-meera-calculator")
    plan = savings.parse_plan(
        sc, {"goal_saving": 400, "emergency_saving": 200, "account": "savings_account"}
    )
    out = savings.resolve_event(sc, plan, "emergency_fund")
    assert out.paid_from_goal == 0 and out.paid_from_emergency == Decimal("400.00")
    assert out.goal_reached and out.goal_reached_month == 3
    assert out.components["event_handled"] == 30
    assert out.score == 100


def test_raiding_goal_delays_it():
    sc = scenario("savings-meera-calculator")
    plan = savings.parse_plan(
        sc, {"goal_saving": 400, "emergency_saving": 0, "account": "piggy_bank"}
    )
    out = savings.resolve_event(sc, plan, "goal_savings")
    assert out.paid_from_goal == Decimal("400.00")
    assert out.goal_projection.final_balance == Decimal("1200.00")
    assert out.goal_reached_month == 4
    assert out.concept_evidence["emergency_fund"] is False


def test_borrowing_repaid_from_future_deposits():
    sc = scenario("savings-imran-emergency")
    plan = savings.parse_plan(sc, {"goal_saving": 1000, "emergency_saving": 0, "account": "cash"})
    out = savings.resolve_event(sc, plan, "borrow")
    deposits = [r.deposit for r in out.goal_projection.rows]
    assert deposits[5] == 0 and deposits[6] == 0 and deposits[7] == Decimal("500.00")
    assert out.borrowed == Decimal("2500.00")
    assert out.components["event_handled"] == 0


def test_all_savings_scenarios_load():
    for s in loader.scenarios():
        if s["kind"] == "savings":
            sc = savings.scenario_from_config(s["config"])
            assert sc.capacity > 0
