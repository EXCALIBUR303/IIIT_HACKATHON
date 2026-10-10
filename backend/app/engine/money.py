"""Money helpers for the simulation engine.

All rupee amounts in the engine are ``Decimal`` values quantized to paise
(two decimal places) using banker-safe ROUND_HALF_UP. Floats are never used
for ledger-style arithmetic (budgets, savings balances).
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

PAISE = Decimal("0.01")
ZERO = Decimal("0.00")
HUNDRED = Decimal("100")

# Upper bound for any single fictional amount. Keeps simulations realistic for
# students and prevents overflow-style abuse of the API.
MAX_AMOUNT = Decimal("10000000")  # ₹1 crore


class SimulationError(ValueError):
    """Raised when simulation input is invalid or a transition is not allowed."""

    def __init__(self, message: str, *, code: str = "invalid_input", field: str | None = None):
        super().__init__(message)
        self.code = code
        self.field = field


def to_money(value: object, *, field: str = "amount", allow_negative: bool = False) -> Decimal:
    """Convert ``value`` to a paise-quantized Decimal, validating range."""
    if isinstance(value, bool):
        raise SimulationError(f"{field} must be a number", field=field)
    try:
        if isinstance(value, float):
            # Go through str to avoid binary float artefacts (0.1 -> 0.1000000000000000055...)
            amount = Decimal(str(value))
        else:
            amount = Decimal(value)  # type: ignore[arg-type]
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise SimulationError(f"{field} must be a number", field=field) from exc
    if not amount.is_finite():
        raise SimulationError(f"{field} must be a finite number", field=field)
    if amount < 0 and not allow_negative:
        raise SimulationError(f"{field} cannot be negative", field=field)
    if abs(amount) > MAX_AMOUNT:
        raise SimulationError(f"{field} is unrealistically large for this simulation", field=field)
    return amount.quantize(PAISE, rounding=ROUND_HALF_UP)


def to_rate(value: object, *, field: str = "rate", maximum: Decimal = Decimal("1")) -> Decimal:
    """Validate an annual rate expressed as a fraction (0.06 == 6%)."""
    try:
        rate = Decimal(str(value)) if isinstance(value, float) else Decimal(value)  # type: ignore[arg-type]
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise SimulationError(f"{field} must be a number", field=field) from exc
    if not rate.is_finite() or rate < 0 or rate > maximum:
        raise SimulationError(f"{field} must be between 0 and {maximum}", field=field)
    return rate


def q(amount: Decimal) -> Decimal:
    """Quantize to paise."""
    return amount.quantize(PAISE, rounding=ROUND_HALF_UP)


def ratio(part: Decimal, whole: Decimal) -> Decimal:
    """Safe ratio in [0, +inf); returns 0 when ``whole`` is zero."""
    if whole == 0:
        return Decimal("0")
    return part / whole


def clamp(value: Decimal, low: Decimal = Decimal("0"), high: Decimal = Decimal("1")) -> Decimal:
    return max(low, min(high, value))


def score(value: Decimal) -> int:
    """Convert a 0..1 Decimal into an integer 0..100 score."""
    return int((clamp(value) * HUNDRED).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def money_str(amount: Decimal) -> str:
    """Serialize money for JSON (string keeps exact paise)."""
    return format(q(amount), "f")


def rupees(amount: Decimal) -> str:
    """Human-friendly rupees with Indian digit grouping: ₹1,25,000 or ₹1,250.50."""
    value = q(amount)
    sign = "-" if value < 0 else ""
    value = abs(value)
    whole = int(value)
    paise = int((value - whole) * 100)
    digits = str(whole)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups) + "," + tail
    return f"{sign}₹{digits}" + (f".{paise:02d}" if paise else "")
