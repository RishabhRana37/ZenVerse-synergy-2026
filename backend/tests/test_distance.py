from __future__ import annotations

from datetime import UTC, datetime

import networkx as nx
import numpy as np
import pytest

from app.correlation.distance import (
    combined_distance,
    d_attr,
    d_sem,
    d_time,
    hop_distance,
    topology_bonus,
)
from app.models.schema import Alert


def _make_alert(service: str = "svc-a", host: str = "host-1", ts_offset: int = 0) -> Alert:
    base = datetime(2024, 1, 1, 0, 0, 0, tzinfo=UTC)
    ts = datetime.fromtimestamp(base.timestamp() + ts_offset, tz=UTC)
    return Alert(
        ts=ts,
        source="test",
        message="test msg",
        template="test template",
        template_id="t-000",
        host=host,
        service=service,
        severity="info",
    )


def _graph() -> nx.DiGraph:
    g = nx.DiGraph()
    # order-svc depends_on postgres-primary (direct edge)
    g.add_edge("order-svc", "postgres-primary")
    # api-gateway depends_on order-svc (2-hop from api-gateway to postgres-primary)
    g.add_edge("api-gateway", "order-svc")
    return g


# ── topology_bonus ────────────────────────────────────────────────────────────


def test_topology_bonus_direct() -> None:
    g = _graph()
    bonus = topology_bonus("order-svc", "postgres-primary", g)
    assert bonus == pytest.approx(0.15)


def test_topology_bonus_two_hop() -> None:
    g = _graph()
    bonus = topology_bonus("api-gateway", "postgres-primary", g)
    assert bonus == pytest.approx(0.05)


def test_topology_bonus_no_relationship() -> None:
    g = _graph()
    bonus = topology_bonus("redis-cache", "postgres-primary", g)
    assert bonus == pytest.approx(0.0)


def test_topology_bonus_service_not_in_graph() -> None:
    g = _graph()
    bonus = topology_bonus("unknown-svc", "postgres-primary", g)
    assert bonus == pytest.approx(0.0)


# ── d_time ────────────────────────────────────────────────────────────────────


def test_d_time_zero() -> None:
    a = _make_alert(ts_offset=0)
    assert d_time(a, a) == pytest.approx(0.0)


def test_d_time_at_max() -> None:
    a = _make_alert(ts_offset=0)
    b = _make_alert(ts_offset=300)
    assert d_time(a, b) == pytest.approx(1.0)


def test_d_time_clamped() -> None:
    a = _make_alert(ts_offset=0)
    b = _make_alert(ts_offset=600)  # beyond T_max
    assert d_time(a, b) == pytest.approx(1.0)


# ── d_sem ─────────────────────────────────────────────────────────────────────


def test_d_sem_identical() -> None:
    vec = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    assert d_sem(vec, vec) == pytest.approx(0.0, abs=1e-5)


def test_d_sem_orthogonal() -> None:
    a = np.array([1.0, 0.0], dtype=np.float32)
    b = np.array([0.0, 1.0], dtype=np.float32)
    assert d_sem(a, b) == pytest.approx(1.0)


def test_d_sem_zero_vector() -> None:
    a = np.zeros(3, dtype=np.float32)
    b = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    assert d_sem(a, b) == pytest.approx(1.0)


# ── d_attr topology_bonus integration ────────────────────────────────────────


def test_d_attr_direct_topology_reduces_distance() -> None:
    g = _graph()
    a = _make_alert(service="order-svc")
    b = _make_alert(service="postgres-primary")
    d = d_attr(a, b, g)
    assert d < 1.0  # topology bonus brings distance below 1


# ── combined_distance sanity ──────────────────────────────────────────────────


def test_combined_distance_same_alert() -> None:
    g = nx.DiGraph()
    a = _make_alert()
    emb = np.ones(3, dtype=np.float32)
    d = combined_distance(a, a, emb, emb, g)
    assert 0.0 <= d <= 1.0


# ── hop_distance / topology_gate_hops ──────────────────────────────────────────


def test_hop_distance_same_service() -> None:
    g = _graph()
    assert hop_distance("order-svc", "order-svc", g) == 0


def test_hop_distance_direct_edge() -> None:
    g = _graph()
    assert hop_distance("order-svc", "postgres-primary", g) == 1


def test_hop_distance_two_hop() -> None:
    g = _graph()
    assert hop_distance("api-gateway", "postgres-primary", g) == 2


def test_hop_distance_no_path_or_missing() -> None:
    g = _graph()
    assert hop_distance("redis-cache", "unknown-svc", g) is None
    assert hop_distance(None, "postgres-primary", g) is None


def test_topology_gate_excludes_out_of_radius_regardless_of_similarity() -> None:
    """Gated distance is 1.0 (max) beyond the radius even for identical
    templates at the same instant — the whole point of a hard pre-filter."""
    g = _graph()
    a = _make_alert(service="api-gateway", ts_offset=0)
    b = _make_alert(service="redis-cache", ts_offset=0)  # no path to api-gateway
    emb = np.ones(3, dtype=np.float32)
    d = combined_distance(a, b, emb, emb, g, topology_gate_hops=2)
    assert d == pytest.approx(1.0)


def test_topology_gate_within_radius_scores_normally() -> None:
    g = _graph()
    a = _make_alert(service="order-svc", ts_offset=0)
    b = _make_alert(service="postgres-primary", ts_offset=0)
    emb = np.ones(3, dtype=np.float32)
    gated = combined_distance(a, b, emb, emb, g, topology_gate_hops=1)
    ungated = combined_distance(a, b, emb, emb, g)
    assert gated == pytest.approx(ungated)
