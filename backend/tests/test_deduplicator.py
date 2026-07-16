from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.ingest.deduplicator import Deduplicator
from app.models.schema import Alert
from app.models.state import AppState


def _make_alert(**kwargs) -> Alert:
    defaults = {
        "ts": datetime.now(timezone.utc),
        "source": "test",
        "message": "disk full on host-1",
        "template": "disk full on <HOST>",
        "template_id": "t-001",
        "host": "host-1",
        "service": "postgres-primary",
        "severity": "critical",
    }
    defaults.update(kwargs)
    return Alert(**defaults)


def test_new_alert_is_not_dup() -> None:
    dedup = Deduplicator()
    st = AppState()
    alert = _make_alert()
    st.add_alert(alert)
    _, is_dup = dedup.process(alert, st)
    assert not is_dup


def test_same_fingerprint_is_dup() -> None:
    dedup = Deduplicator()
    st = AppState()
    a1 = _make_alert()
    st.add_alert(a1)
    dedup.process(a1, st)

    a2 = _make_alert()  # same template_id + host + service
    st.add_alert(a2)
    existing, is_dup = dedup.process(a2, st)
    assert is_dup
    assert existing.id == a1.id
    assert existing.dup_count == 2


def test_different_service_not_dup() -> None:
    dedup = Deduplicator()
    st = AppState()
    a1 = _make_alert(service="postgres-primary")
    st.add_alert(a1)
    dedup.process(a1, st)

    a2 = _make_alert(service="redis-cache")  # different service
    st.add_alert(a2)
    _, is_dup = dedup.process(a2, st)
    assert not is_dup


def test_ttl_eviction() -> None:
    """Expired fingerprints should be evicted and the next alert treated as new."""
    from datetime import timedelta
    dedup = Deduplicator(t_max_seconds=1)  # 1 s TTL
    st = AppState()
    a1 = _make_alert()
    st.add_alert(a1)
    dedup.process(a1, st)

    assert len(st.dedup_index) == 1

    # Manually expire the entry
    import time
    time.sleep(1.1)
    evicted = st.evict_expired_dedup()
    assert evicted == 1
    assert len(st.dedup_index) == 0

    # Same fingerprint should now be treated as new
    a3 = _make_alert()
    _, is_dup = dedup.process(a3, st)
    assert not is_dup
