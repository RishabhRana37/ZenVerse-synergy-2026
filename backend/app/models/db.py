from __future__ import annotations

from datetime import datetime
from pathlib import Path

from sqlalchemy import DateTime, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

DB_PATH = Path(__file__).parent.parent.parent / "stormlens.db"
_engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
_SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class AlertORM(Base):
    """Persisted alert history — write path only, never read back for the hot loop."""

    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(String)
    host: Mapped[str | None] = mapped_column(String, nullable=True)
    service: Mapped[str | None] = mapped_column(String, nullable=True)
    severity: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(String)
    template: Mapped[str] = mapped_column(String)
    template_id: Mapped[str] = mapped_column(String)
    dup_count: Mapped[int] = mapped_column(Integer, default=1)
    cluster_id: Mapped[str | None] = mapped_column(String, nullable=True)


def init_db() -> None:
    """Create tables if they don't exist. Safe to call repeatedly (idempotent)."""
    Base.metadata.create_all(bind=_engine)


def get_session() -> Session:
    """New synchronous session per call — caller is responsible for commit/close."""
    return _SessionLocal()
