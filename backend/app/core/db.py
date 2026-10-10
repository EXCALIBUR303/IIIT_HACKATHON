"""Database engine and session management (SQLAlchemy 2.x, synchronous)."""

from __future__ import annotations

import zlib
from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


engine = create_engine(
    get_settings().database_url, pool_pre_ping=True, pool_size=10, max_overflow=20
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def advisory_lock(db: Session, *parts: object) -> None:
    """Serialise a critical section across concurrent requests (PostgreSQL only).

    Held until the surrounding transaction commits or rolls back.
    """
    if db.get_bind().dialect.name != "postgresql":
        return
    key = zlib.crc32(":".join(map(str, parts)).encode())
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
