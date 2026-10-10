"""Tutor safety layers that sit around the model, never inside it.

1. ``screen_question``: deterministic classification of what the student typed, before any
   model call. Refusals are canned, so they cannot be argued with.
2. ``scrub_question``: removes numbers and contact details that the model has no need for.
3. ``validate_answer``: checks what the model wrote against the same rules, and discards it
   (falling back to the glossary explanation) if anything is off.

Regexes are a floor, not a ceiling. Text we cannot read (other scripts) never reaches the
model at all, and the system prompt, the verified-context-only rule and the output checks are
independent of the input filter, so one bypass does not defeat the others.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# --- normalisation -------------------------------------------------------------------------

_INVISIBLE = dict.fromkeys(
    [0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF, 0x00AD, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E]
)
_LEET = str.maketrans(
    {"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"}
)
# "i.g.n.o.r.e" / "i g n o r e" / "i-g-n-o-r-e": single letters joined by separators.
_SPELLED = re.compile(r"\b(?:[a-z][\s.\-_*]+){3,}[a-z]\b")


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_INVISIBLE)
    text = "".join(ch for ch in text if ch == "\n" or unicodedata.category(ch)[0] != "C")
    return re.sub(r"\s+", " ", text).strip().lower()


def variants(text: str) -> list[str]:
    """The text as typed, with spelled-out letters joined, and with common leetspeak undone."""
    base = normalise(text)
    joined = _SPELLED.sub(lambda m: re.sub(r"[\s.\-_*]+", "", m.group(0)), base)
    return list(dict.fromkeys([base, joined, joined.translate(_LEET)]))


def readable(text: str) -> bool:
    """True when almost every letter is Latin, i.e. the filters below can actually read it."""
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return True
    latin = sum(1 for c in letters if "LATIN" in unicodedata.name(c, ""))
    return latin / len(letters) >= 0.9


# --- input screening -----------------------------------------------------------------------

STAY_ON_LEARNING = (
    "RupeeRise teaches ideas with fictional money, so I can't help with that. "
    "Ask me about budgeting, saving, how risk and time work, or how to spot a scam."
)

REPLIES = {
    "jailbreak": (
        "My rules stay the same however the question is worded. I explain money ideas and your "
        "own simulation results, and I don't predict prices or recommend what to buy. "
        "What would you like to understand better?"
    ),
    "recommendation": (
        "I can't recommend what to buy, which app, bank or platform to use, or where to put "
        "money. That depends on a real person's situation, so talk it through with a trusted "
        "adult. I can explain how risk, time horizon and diversification work so you can judge "
        "for yourself."
    ),
    "opinion": (
        "I don't have money, and I don't pick investments, so there's nothing I'd personally "
        "buy. I can help you think it through: what is the goal, how long until you need the "
        "money, and how much risk can you live with?"
    ),
    "prediction": (
        "Nobody can predict which share or fund will rise, double or fall, and the prices in "
        "RupeeRise are made up for practice. I can explain why prices move and how to plan for "
        "both good and bad years."
    ),
    "balance": (
        "I can't change your wallet, rewards, scores or portfolio. The system sets them from "
        "what you show you understand. I can explain how rewards are earned."
    ),
    "secret": (
        "Please never type an OTP, PIN, CVV or password anywhere, including here. Nobody "
        "genuine ever asks for them. If that was a real code, don't share it with anyone, and "
        "if you already did, tell a trusted adult and contact your bank straight away."
    ),
    "identifier": (
        "Please don't type ID, card or account numbers anywhere, including here. I can't use "
        "them and you shouldn't share them. Ask me how to keep personal details safe instead."
    ),
    "unreadable": "",  # handled by the caller: deterministic answer only, no model call
}

_NOUNS = (
    r"stocks?|shares?|funds?|mutual funds?|etfs?|crypto\w*|bitcoin|coins?|ipos?|bonds?|"
    r"fds?|fixed deposits?|sips?|schemes?|policy|policies|insurance|apps?|platforms?|"
    r"brokers?|banks?|demat"
)
_JAILBREAK = re.compile(
    r"\b(ignore|disregard|forget|override|bypass|skip|drop|break)\b.{0,40}"
    r"\b(rules?|instructions?|prompts?|guidelines?|restrictions?|filters?|guardrails?|limits?)\b"
    r"|\b(system|developer|hidden|initial) (prompt|message|instructions?)\b"
    r"|\b(developer|god|dan|jailbreak|unrestricted|sudo) mode\b|\bjailbreak\b|\bdo anything now\b"
    r"|\b(pretend|imagine|act|behave|roleplay|role-play)\b.{0,25}"
    r"\b(you are|you're|to be|as|like)\b.{0,30}\b(advisor|adviser|broker|trader|analyst|expert|"
    r"human|unfiltered|no rules|without rules|fund manager)\b"
    r"|\byou are now\b|\bnew rules?\b|\bfrom now on\b.{0,30}\byou\b",
)
_OPINION = re.compile(
    r"\bwhat (would|will|do|did) you\b.{0,40}\b(buy|invest|pick|choose|prefer|do with|put)\b"
    r"|\bwhat (do|would) you (think|recommend|suggest|advise)\b"
    r"|\b(if you were me|in my place|in my shoes)\b"
    r"|\byour (favou?rite|top|best) (pick|choice|stock)"
    r"|\bwhat('?s| is) your (pick|choice|advice|opinion|tip)\b|\byou personally\b"
    r"|\b(would|will|do) you (buy|invest|pick|choose|prefer)\b",
)
_RECOMMEND = re.compile(
    rf"\b(best|safest|top|better|ideal|profitable|highest|trusted|reliable)\b"
    rf".{{0,40}}\b({_NOUNS})\b"
    rf"|\bwhich\b.{{0,20}}\b({_NOUNS})\b.{{0,40}}"
    rf"\b(buy|invest|pick|choose|open|use|start|put|go for|better|best|safe|safest|should)\b"
    rf"|\bshould i\b.{{0,20}}\b(buy|sell|invest|put|open|choose|pick|take|start)\b"
    rf"|\b(recommend|suggest|advise|tip|tips)\b.{{0,30}}\b({_NOUNS}|invest\w*|buy\w*)\b"
    rf"|\bwhere (should|can|do) i (invest|put|park)\b|\bhot tips?\b",
)
_PREDICT = re.compile(
    r"\bpredict\w*\b|\bforecast\w*\b|\bsure[- ]?shot\b|\bmultibagger\b|\bnext big\b"
    r"|\bguarantee[sd]?\b"
    r"|\b(will|going to|gonna)\b.{0,50}"
    r"\b(go up|rise|rally|fall|crash|double|triple|moon|pump|boom)\b"
    r"|\bwhich\b.{0,25}\b(will|would)\b.{0,25}\b(double|triple|rise|go up|win|moon)\b",
)
_BALANCE = re.compile(
    r"\b(add|give|increase|top ?up|credit|reset|change|fix|edit|set|raise|boost|unlock|hack)\b"
    r".{0,30}\b(wallet|balance|reward|score|portfolio|cash|rupees|points|badges?|mastery)\b",
)
_SECRET = re.compile(
    r"\b(otp|pin|cvv|cvc|password|passcode|mpin|upi pin|atm pin|card pin)\b"
    r"[^.?!\n]{0,25}?(?:is|are|was|=|:|-)?\s*(\d[\d\s-]{2,15}\d|\d{3,8})"
    r"|\b(\d{4,8})\b[^.?!\n]{0,15}\b(is|was) (my|the) (otp|pin|cvv|password|code)\b",
)
_IDENTIFIER = re.compile(
    r"\b\d{12}\b|\b[A-Z]{5}\d{4}[A-Z]\b|\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b"
    r"|\b\d{9,18}\b|\b[A-Z]{4}0[A-Z0-9]{6}\b",
)
_CASED = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b|\b[A-Z]{4}0[A-Z0-9]{6}\b")


@dataclass(frozen=True)
class Verdict:
    category: str  # one of REPLIES' keys, or "ok"
    reply: str | None = None

    @property
    def allowed(self) -> bool:
        return self.category == "ok"


OK = Verdict("ok")


def screen_question(question: str) -> Verdict:
    """Classify a question. Order matters: manipulation and secrets are caught first."""
    if (
        _SECRET.search(normalise(question))
        or _IDENTIFIER.search(question)
        or _CASED.search(question)
    ):
        if _SECRET.search(normalise(question)):
            return Verdict("secret", REPLIES["secret"])
        return Verdict("identifier", REPLIES["identifier"])
    texts = variants(question)
    for category, pattern in (
        ("jailbreak", _JAILBREAK),
        ("balance", _BALANCE),
        ("opinion", _OPINION),
        ("prediction", _PREDICT),
        ("recommendation", _RECOMMEND),
    ):
        if any(pattern.search(t) for t in texts):
            return Verdict(category, REPLIES[category])
    return OK


def scrub_question(question: str) -> str:
    """What the model gets to see of the question: no long numbers, emails or phone numbers."""
    text = "".join(ch for ch in normalise_keep_case(question) if ch.isprintable())
    text = re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+", "[email]", text)
    text = re.sub(r"\+?\d[\d\s-]{5,}\d", "[number]", text)
    text = re.sub(r"https?://\S+|www\.\S+", "[link]", text)
    return text[:400]


def normalise_keep_case(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).translate(_INVISIBLE)
    return re.sub(r"\s+", " ", text).strip()


# --- output validation -----------------------------------------------------------------------

# Real products and platforms the tutor must never name unless the verified context did.
_BRANDS = re.compile(
    r"\b(zerodha|groww|upstox|angel ?one|5paisa|paytm|phonepe|google ?pay|gpay|bhim|cred|"
    r"hdfc|icici|sbi|axis bank|kotak|yes bank|idfc|bajaj|lic|nifty|sensex|bitcoin|ethereum|"
    r"dogecoin|binance|wazirx|coindcx|robinhood|nse|bse|sebi registered|tata|reliance|infosys|"
    r"adani|zomato|paisabazaar|policybazaar|smallcase|coin by)\b",
    re.I,
)
_ADVICE = re.compile(
    r"\byou (should|must|ought to|need to) (buy|sell|invest|put|pick|choose|open|go for|switch)\b"
    r"|\bi (recommend|suggest|advise|would (buy|invest|pick|choose)|'d (buy|invest|pick))\b"
    r"|\bi personally\b|\bmy (favou?rite|pick|choice)\b|\b(is|are) (the )?(best|safest) (app|bank|"
    r"stock|fund|platform|option to (buy|invest))\b|\bbest (stock|fund|app|platform|crypto)\b",
    re.I,
)
_PREDICTION = re.compile(
    r"\b(will|is going to|are going to|shall)\b.{0,30}\b(double|triple|go up|rise|rally|crash|"
    r"soar|moon|rocket)\b|\bguaranteed? (returns?|profits?|gains?)\b|\bsure[- ]?shot\b"
    r"|\bno risk\b|\brisk[- ]free (returns?|profit)\b|\bwill (definitely|surely|certainly)\b",
    re.I,
)
_ASKS_FOR_SECRETS = re.compile(
    r"\b(share|send|tell|give|enter|type|provide|confirm) (me )?(with me )?(your|ur) "
    r"(otp|pin|cvv|password|aadhaar|pan|card|account)\b|\bwhat('s| is) your (otp|pin|password)\b",
    re.I,
)
_MONEY = re.compile(
    r"(?:₹|rs\.?|inr)\s?[\d,]+(?:\.\d+)?|\b[\d,]+(?:\.\d+)?\s?(?:rupees|lakh|crore)\b", re.I
)
_LINK = re.compile(r"https?://|www\.|\[[^\]]+\]\([^)]+\)", re.I)
MAX_ANSWER_CHARS = 1200


def _figures(text: str) -> set[str]:
    return {re.sub(r"[^\d.]", "", m.group(0)) for m in _MONEY.finditer(text)}


def validate_answer(answer: str, context: list[str]) -> str | None:
    """Return the model's answer if it respects every rule, otherwise None (use the fallback)."""
    text = answer.strip()
    if not text or len(text) > MAX_ANSWER_CHARS:
        return None
    grounded = " ".join(context)
    if _LINK.search(text):
        return None
    for match in _BRANDS.finditer(text):
        if match.group(0).lower() not in grounded.lower():
            return None  # names a real product the verified context never mentioned
    if _ADVICE.search(text) or _PREDICTION.search(text) or _ASKS_FOR_SECRETS.search(text):
        return None
    if _figures(text) - _figures(grounded):
        return None  # a rupee figure that did not come from the engine or glossary
    return text
