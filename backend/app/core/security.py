"""Password hashing (bcrypt). Sessions and tokens live in sessions.py."""

from __future__ import annotations

import bcrypt

from .config import get_settings


def hash_password(password: str) -> str:
    # bcrypt only uses the first 72 bytes; schemas cap length well below that.
    salt = bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("ascii"))
    except ValueError:
        return False
