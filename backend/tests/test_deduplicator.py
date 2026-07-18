from __future__ import annotations

from datetime import UTC, datetime

from app.ingest.deduplicator import Deduplicator
from app.models.schema import Alert
from app.models.state import AppState


def _make_alert(**kwargs) -> Alert:
    defaults = {
        "ts": datetime.now(UTC),
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


def test_ttl_eviction_event_time() -> None:
    """TTL runs on EVENT time: a same-fingerprint alert whose event ts falls
    beyond the entry's expiry must be treated as new, and eviction is driven
    by the event clock (latest_event_ts), not the wall clock — otherwise
    accelerated replay over-collapses recurrences (observed live at 100x)."""
    from datetime import timedelta

    dedup = Deduplicator(t_max_seconds=300)
    st = AppState()
    t0 = datetime.now(UTC)

    a1 = _make_alert(ts=t0)
    st.add_alert(a1)
    _, is_dup = dedup.process(a1, st)
    assert not is_dup
    assert len(st.dedup_index) == 1

    # Same fingerprint 100s later (event time) — still within TTL: dup hit
    a2 = _make_alert(ts=t0 + timedelta(seconds=100))
    existing, is_dup = dedup.process(a2, st)
    assert is_dup
    assert existing.id == a1.id

    # Same fingerprint 400s after first occurrence — past TTL: new canonical,
    # even with zero wall-clock time elapsed
    a3 = _make_alert(ts=t0 + timedelta(seconds=400))
    st.add_alert(a3)
    _, is_dup = dedup.process(a3, st)
    assert not is_dup

    # Eviction follows the event clock (advanced by add_alert above)
    evicted = st.evict_expired_dedup()
    assert evicted == 0  # a1's stale entry was already replaced in-line by a3
    st.advance_event_clock(t0 + timedelta(seconds=800))
    assert st.evict_expired_dedup() == 1  # a3's entry now expired too
