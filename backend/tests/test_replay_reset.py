from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from app.models.schema import Alert
from app.models.state import AppState


def _make_alert(host: str = "h1", service: str = "svc", tid: str = "t-001") -> Alert:
    return Alert(
        ts=datetime.now(timezone.utc),
        source="test",
        message="test",
        template="test msg",
        template_id=tid,
        host=host,
        service=service,
        severity="info",
    )


def test_reset_clears_all_state() -> None:
    """POST /replay/reset must clear all mutable state."""
    st = AppState()
    alert = _make_alert()
    st.add_alert(alert)
    st.incidents["inc-001"] = object()  # type: ignore
    st.total_alert_count = 99

    st.reset()

    assert len(st.alert_index) == 0
    assert len(st.incidents) == 0
    assert len(st.dedup_index) == 0
    assert len(st.dedup_expiry) == 0
    assert len(st.sparkline_buckets) == 0
    assert len(st.alert_batch_buffer) == 0
    assert st.total_alert_count == 0
    assert not st.replay_status.running


def test_compression_ratio_calculation() -> None:
    st = AppState()
    from app.models.schema import Incident
    # 10 raw alerts, 1 incident with 8 unique, 2 noise
    for i in range(8):
        a = _make_alert(tid=f"t-{i:03d}")
        a.cluster_id = "inc-001"
        st.add_alert(a)
    for i in range(2):
        st.add_alert(_make_alert(tid=f"noise-{i}"))
    inc = Incident(id="inc-001", status="active")
    st.incidents["inc-001"] = inc
    # active_incident_count = 1, unclustered_count = 2, total = 10
    # ratio = 1 - (1 + 2) / 10 = 0.7
    assert st.compression_ratio == pytest.approx(0.7)


def test_sparkline_bucket_rolls() -> None:
    import time
    st = AppState()
    st.update_sparkline("inc-001", 5)
    buckets_before = list(st.sparkline_buckets["inc-001"])
    assert buckets_before[-1] == 5  # current bucket has 5

    # Force roll by manipulating last bucket open time
    from datetime import timedelta
    st._last_bucket_open = st._last_bucket_open - timedelta(seconds=15)
    st.update_sparkline("inc-001", 3)
    buckets_after = list(st.sparkline_buckets["inc-001"])
    # The old bucket with 5 should still be there, new bucket has 3
    assert 5 in buckets_after
    assert buckets_after[-1] == 3
