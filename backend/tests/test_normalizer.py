from __future__ import annotations

from datetime import UTC, datetime

from app.ingest.normalizer import Normalizer


def _raw(timestamp: str) -> dict:
    return {
        "id": "x",
        "timestamp": timestamp,
        "host": None,
        "service": "svc",
        "severity": "warning",
        "message": "test",
    }


def test_parse_ts_handles_utc_offset_isoformat() -> None:
    """Python's own datetime.isoformat() emits +00:00, not Z — every generator
    script in this repo (parse_aiops.py, generate_synthetic_db_cascade.py)
    produces exactly this format. A regression here silently drops the
    temporal signal to a no-op (every alert normalizes to "now")."""
    n = Normalizer()
    alert = n.process(_raw("2020-04-10T16:02:14+00:00"), source="eval:test")
    assert alert.ts == datetime(2020, 4, 10, 16, 2, 14, tzinfo=UTC)


def test_parse_ts_handles_z_suffix() -> None:
    n = Normalizer()
    alert = n.process(_raw("2020-04-10T16:02:14Z"), source="eval:test")
    assert alert.ts == datetime(2020, 4, 10, 16, 2, 14, tzinfo=UTC)


def test_parse_ts_handles_microseconds_and_offset() -> None:
    n = Normalizer()
    alert = n.process(_raw("2020-04-10T16:02:14.123456+00:00"), source="eval:test")
    assert alert.ts == datetime(2020, 4, 10, 16, 2, 14, 123456, tzinfo=UTC)
