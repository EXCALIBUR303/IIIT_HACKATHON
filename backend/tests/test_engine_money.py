from decimal import Decimal

import pytest

from app.engine.money import SimulationError, rupees, score, to_money, to_rate


def test_to_money_quantizes_and_avoids_float_artifacts():
    assert to_money(0.1) + to_money(0.2) == Decimal("0.30")
    assert to_money("10.005") == Decimal("10.01")  # ROUND_HALF_UP
    assert to_money(5) == Decimal("5.00")


@pytest.mark.parametrize("bad", [-1, "abc", None, True, float("nan"), float("inf"), 10**9])
def test_to_money_rejects_invalid(bad):
    with pytest.raises(SimulationError):
        to_money(bad)


def test_zero_is_valid_and_negative_allowed_when_requested():
    assert to_money(0) == Decimal("0.00")
    assert to_money(-5, allow_negative=True) == Decimal("-5.00")


def test_rate_bounds():
    assert to_rate("0.06") == Decimal("0.06")
    with pytest.raises(SimulationError):
        to_rate(-0.01)
    with pytest.raises(SimulationError):
        to_rate(1.5)


def test_score_clamps():
    assert score(Decimal("1.7")) == 100
    assert score(Decimal("-1")) == 0
    assert score(Decimal("0.555")) == 56


def test_rupees_uses_indian_grouping():
    assert rupees(Decimal("201")) == "₹201"
    assert rupees(Decimal("1101")) == "₹1,101"
    assert rupees(Decimal("125000")) == "₹1,25,000"
    assert rupees(Decimal("12345678.5")) == "₹1,23,45,678.50"
    assert rupees(Decimal("-500")) == "-₹500"
