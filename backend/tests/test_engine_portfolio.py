import pytest

from app.engine import investing
from app.engine import portfolio as pf
from app.engine.money import SimulationError


def test_prices_are_integer_paise_deterministic_and_start_at_base():
    for key in pf.INSTRUMENT_KEYS:
        for path in pf.PATH_KEYS:
            series = pf.price_series(key, path)
            assert series == pf.price_series(key, path)
            assert len(series) == pf.MAX_ROUND + 1 and series[0] == pf.BASE_PRICE_PAISE
            assert all(isinstance(p, int) and p >= 1 for p in series)


def test_known_path_values_match_the_documented_tables():
    # growth basket tracks the market path: early_crash year 1 = -28% -> 10000 * 0.72
    assert pf.price_at("growth_basket", "early_crash", 1) == 7200
    assert pf.price_at("steady_deposit", "early_crash", 2) == 11236  # 6% compounded, rounded
    assert pf.price_at("balanced_basket", "early_crash", 1) == 8900  # 0.5*-28% + 0.5*6%


def test_seed_selects_a_fixed_path_and_every_path_is_reachable():
    assert pf.path_for(pf.make_seed("student-1", 1)) == pf.path_for(pf.make_seed("student-1", 1))
    reached = {pf.path_for(pf.make_seed(f"s{i}", 1)) for i in range(200)}
    assert reached == set(pf.PATH_KEYS)


def test_round_and_instrument_validation():
    with pytest.raises(SimulationError):
        pf.price_at("growth_basket", "early_crash", pf.MAX_ROUND + 1)
    with pytest.raises(SimulationError):
        pf.price_at("growth_basket", "early_crash", -1)
    with pytest.raises(SimulationError):
        pf.price_series("real_stock", "early_crash")


@pytest.mark.parametrize("bad", [0, -1, 1.5, "3", None, True, pf.MAX_QUANTITY + 1])
def test_invalid_quantities_rejected(bad):
    with pytest.raises(SimulationError):
        pf.parse_quantity(bad)


def test_valid_quantity_accepted():
    assert pf.parse_quantity(1) == 1 and pf.parse_quantity(pf.MAX_QUANTITY) == pf.MAX_QUANTITY


def test_buy_cannot_overspend_and_exact_cash_is_allowed():
    assert pf.check_buy(10_000, 2_500, 4) == 10_000
    with pytest.raises(SimulationError) as err:
        pf.check_buy(10_000, 2_500, 5)
    assert err.value.code == "insufficient_funds"


def test_cannot_oversell():
    pos = pf.Position(3, 30_000)
    pf.check_sell(pos, 3)
    with pytest.raises(SimulationError) as err:
        pf.check_sell(pos, 4)
    assert err.value.code == "insufficient_holdings"
    with pytest.raises(SimulationError):
        pf.check_sell(None, 1)


def test_cost_basis_uses_average_cost_and_clears_on_full_sale():
    pos = pf.apply_buy(None, 2, 20_000)
    pos = pf.apply_buy(pos, 2, 28_000)  # 4 units for 48,000 -> avg 12,000
    remaining, released = pf.apply_sell(pos, 1)
    assert released == 12_000 and remaining == pf.Position(3, 36_000)
    none_left, released_all = pf.apply_sell(remaining, 3)
    assert none_left is None and released_all == 36_000


def test_valuation_adds_up_and_weights_sum_to_100():
    holdings = {"steady_deposit": pf.Position(10, 100_000), "growth_basket": pf.Position(5, 50_000)}
    prices = {k: 12_000 for k in pf.INSTRUMENT_KEYS}
    v = pf.valuation(5_000, holdings, prices, contributed_paise=155_000)
    assert v["invested_paise"] == 15 * 12_000 == 180_000
    assert v["total_paise"] == 185_000 and v["gain_paise"] == 30_000
    assert round(sum(r["weight_pct"] for r in v["holdings"]), 1) == 100.0
    assert {r["instrument_key"]: r["gain_paise"] for r in v["holdings"]} == {
        "steady_deposit": 20_000,
        "growth_basket": 10_000,
    }


def test_single_company_share():
    rows = [
        {"instrument_key": "zippy_gadgets", "value_paise": 30_000},
        {"instrument_key": "steady_deposit", "value_paise": 70_000},
    ]
    assert pf.single_company_share(rows) == pytest.approx(0.3)
    assert pf.single_company_share([]) == 0.0


def test_year_event_and_reflection_are_grounded_in_numbers():
    event = pf.year_event("early_crash", 1)
    assert event["market_change_pct"] == -28 and "sharp fall" in event["headline"].lower()
    before = pf.valuation(
        0,
        {"growth_basket": pf.Position(10, 100_000)},
        {k: 10_000 for k in pf.INSTRUMENT_KEYS},
        100_000,
    )
    after = pf.valuation(
        0,
        {"growth_basket": pf.Position(10, 100_000)},
        {k: 7_200 for k in pf.INSTRUMENT_KEYS},
        100_000,
    )
    lines = pf.reflection_lines(before, after, event)
    assert any("fell by ₹280.00" in line for line in lines)
    assert any("Falls are normal" in line for line in lines)


def test_catalogue_reuses_the_fictional_investing_assets():
    assert set(pf.INSTRUMENT_KEYS) == set(investing.ASSETS)
