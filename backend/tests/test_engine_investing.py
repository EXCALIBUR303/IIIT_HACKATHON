from decimal import Decimal

import pytest

from app.engine import investing
from app.engine.money import SimulationError

MIX = {"steady_deposit": 30, "balanced_basket": 40, "growth_basket": 30}


def test_allocation_must_total_100():
    with pytest.raises(SimulationError) as exc:
        investing.parse_allocation({"steady_deposit": 50, "growth_basket": 40})
    assert exc.value.code == "allocation_total"


@pytest.mark.parametrize(
    "bad",
    [{"bitcoin": 100}, {"growth_basket": -10, "steady_deposit": 110}, {"growth_basket": "all"}, {}],
)
def test_allocation_validation(bad):
    with pytest.raises(SimulationError):
        investing.parse_allocation(bad)


def test_scenario_asset_restrictions():
    with pytest.raises(SimulationError):
        investing.parse_allocation({"zippy_gadgets": 100}, ["steady_deposit", "growth_basket"])


def test_steady_deposit_path_is_exact_compounding():
    rows = investing.run_path(Decimal(10000), {"steady_deposit": 1.0}, 3, "early_crash")
    assert rows[-1]["value"] == round(10000 * 1.06**3)


def test_projection_is_deterministic_and_shows_range():
    a = investing.project_portfolio(amount=10000, allocation=MIX, horizon_years=5, seed=42)
    b = investing.project_portfolio(amount=10000, allocation=MIX, horizon_years=5, seed=42)
    assert a == b
    assert a["path_range"]["lowest"] < a["path_range"]["highest"]
    mc = a["monte_carlo"]
    assert mc["worst_case_p10"] <= mc["median"] <= mc["best_case_p90"]
    assert "not advice" in a["disclaimer"] or "education" in a["disclaimer"]


def test_longer_horizon_lowers_chance_of_loss():
    out = investing.loss_probability_by_horizon(Decimal(10000), {"growth_basket": 1.0}, seed=7)
    probs = [o["probability_of_loss"] for o in out]
    assert probs[0] > probs[-1]


def test_single_company_is_riskier_and_less_diversified():
    single = {"zippy_gadgets": 1.0}
    spread = investing.parse_allocation(MIX)
    assert investing.portfolio_volatility(single) > investing.portfolio_volatility(spread)
    assert investing.diversification_score(single) == 0
    assert investing.diversification_score(spread) > 0.5


def test_selling_after_a_crash_locks_in_loss_on_this_path():
    weights = {"growth_basket": 1.0}
    hold = investing.run_path(
        Decimal(10000), weights, 10, "early_crash", action_after_year=(1, "hold")
    )
    sell = investing.run_path(
        Decimal(10000), weights, 10, "early_crash", action_after_year=(1, "sell_all")
    )
    assert sell[-1]["value"] < hold[-1]["value"]


def test_score_rewards_reasoning_not_luck():
    weights = investing.parse_allocation(MIX)
    results = [
        investing.evaluate_scenario(
            amount=Decimal(10000), weights=weights, horizon=10, path_key=path, action="hold", seed=1
        )["components"]
        for path in investing.CRASH_PATHS
    ]
    assert all(r == results[0] for r in results)  # same reasoning, same score, any market path


def test_short_horizon_high_risk_scores_low_on_fit():
    weights = {"zippy_gadgets": 1.0}
    r = investing.evaluate_scenario(
        amount=Decimal(10000), weights=weights, horizon=1, path_key=None, action=None, seed=1
    )
    assert r["components"]["risk_matches_horizon"] == 0
    assert r["components"]["concentration"] == 0
    assert r["concept_evidence"]["time_horizon"] is False


def test_pick_path_respects_horizon():
    assert investing.pick_path(3, 1) is None
    for seed in range(5):
        path = investing.pick_path(seed, 3)
        assert investing.CRASH_PATHS[path] < 3


def test_horizon_validation():
    with pytest.raises(SimulationError):
        investing.validate_horizon(7)


def test_crash_event_reports_the_fall_year_for_every_path():
    weights = investing.parse_allocation(MIX)
    for path in investing.CRASH_PATHS:
        event = investing.crash_event(Decimal(10000), weights, 10, path)
        assert event["year_change_pct"] < 0 and event["market_change_pct"] < 0
