from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.correlation.reconciler import reconcile
from app.models.schema import Alert, Incident


def _make_alert(aid: str | None = None, service: str = "svc") -> Alert:
    return Alert(
        id=aid or str(uuid.uuid4()),
        ts=datetime.now(UTC),
        source="test",
        message="test",
        template="test msg",
        template_id="t-001",
        host="h1",
        service=service,
        severity="info",
    )


def test_reconcile_no_clusters_resolves_aged_out() -> None:
    # Set up old incident and member
    inc = Incident(
        id="inc-1", status="active", created_at=datetime.now(UTC), updated_at=datetime.now(UTC)
    )
    old_incidents = {"inc-1": inc}
    old_members = {"inc-1": {"a1"}}
    new_clusters: dict[str, set[str]] = {}
    alert_index: dict[str, Alert] = {}  # Empty, so "a1" is not in window (aged out)

    res = reconcile(old_incidents, old_members, new_clusters, alert_index)

    assert len(res.resolved) == 1
    assert res.resolved[0].id == "inc-1"
    assert res.resolved[0].status == "resolved"


def test_reconcile_creates_new_incident() -> None:
    alert = _make_alert("a1", service="svc-a")
    alert_index = {"a1": alert}
    new_clusters = {"cluster-1": {"a1"}}
    old_incidents: dict[str, Incident] = {}
    old_members: dict[str, set[str]] = {}

    res = reconcile(old_incidents, old_members, new_clusters, alert_index)

    assert len(res.created) == 1
    inc, members = res.created[0]
    assert inc.status == "active"
    assert members == {"a1"}
    assert inc.services == ["svc-a"]
    assert inc.alert_count == 1


def test_reconcile_updates_existing_incident() -> None:
    a1 = _make_alert("a1", service="svc-a")
    a2 = _make_alert("a2", service="svc-a")
    alert_index = {"a1": a1, "a2": a2}

    inc = Incident(
        id="inc-1", status="active", created_at=datetime.now(UTC), updated_at=datetime.now(UTC)
    )
    old_incidents = {"inc-1": inc}
    old_members = {"inc-1": {"a1"}}

    # New cluster adds a2 to the group
    new_clusters = {"cluster-1": {"a1", "a2"}}

    res = reconcile(old_incidents, old_members, new_clusters, alert_index)

    assert len(res.updated) == 1
    updated_inc, diff = res.updated[0]
    assert updated_inc.id == "inc-1"
    assert diff.added_alert_ids == ["a2"]
    assert diff.removed_alert_ids == []
    assert updated_inc.unique_count == 2


def test_reconcile_split_handling() -> None:
    # Incident overlaps with two new clusters.
    # It should match the one with larger overlap, and the other becomes a new incident.
    a1 = _make_alert("a1")
    a2 = _make_alert("a2")
    a3 = _make_alert("a3")
    alert_index = {"a1": a1, "a2": a2, "a3": a3}

    inc = Incident(
        id="inc-1", status="active", created_at=datetime.now(UTC), updated_at=datetime.now(UTC)
    )
    old_incidents = {"inc-1": inc}
    old_members = {"inc-1": {"a1", "a2", "a3"}}

    # Cluster 1 has overlap of 2 {"a1", "a2"}
    # Cluster 2 has overlap of 1 {"a3"}
    new_clusters = {"cluster-1": {"a1", "a2"}, "cluster-2": {"a3"}}

    res = reconcile(old_incidents, old_members, new_clusters, alert_index)

    # inc-1 should be matched to cluster-1 (updated)
    assert len(res.updated) == 1
    assert res.updated[0][0].id == "inc-1"
    assert set(res.updated[0][1].removed_alert_ids) == {"a3"}

    # cluster-2 should become a new incident (created)
    assert len(res.created) == 1
    assert res.created[0][1] == {"a3"}


def test_reconcile_merge_handling() -> None:
    # Two old incidents match the same new cluster.
    # The one with larger overlap wins; the other is resolved if its alerts are gone.
    a1 = _make_alert("a1")
    a2 = _make_alert("a2")
    # Exclude a3 from alert_index so it is treated as aged out, causing inc-2 to resolve
    alert_index = {"a1": a1, "a2": a2}

    inc1 = Incident(
        id="inc-1", status="active", created_at=datetime.now(UTC), updated_at=datetime.now(UTC)
    )
    inc2 = Incident(
        id="inc-2", status="active", created_at=datetime.now(UTC), updated_at=datetime.now(UTC)
    )
    old_incidents = {"inc-1": inc1, "inc-2": inc2}
    old_members = {
        "inc-1": {"a1", "a2"},  # Overlap 2
        "inc-2": {"a3"},  # Overlap 0
    }

    new_clusters = {"cluster-1": {"a1", "a2", "a3"}}

    res = reconcile(old_incidents, old_members, new_clusters, alert_index)

    # inc-1 wins and is updated
    assert len(res.updated) == 1
    assert res.updated[0][0].id == "inc-1"
    assert res.updated[0][1].added_alert_ids == ["a3"]

    # inc-2 loses and is resolved
    assert len(res.resolved) == 1
    assert res.resolved[0].id == "inc-2"
    assert res.resolved[0].status == "resolved"


def test_reconcile_unmatched_old_incident_resolves() -> None:
    # An active incident that has no matching new cluster and all member alerts
    # aged out of the active window should be resolved.
    # alert_index is empty, so a1 has aged out
    alert_index: dict[str, Alert] = {}

    inc = Incident(
        id="inc-1", status="active", created_at=datetime.now(UTC), updated_at=datetime.now(UTC)
    )
    old_incidents = {"inc-1": inc}
    old_members = {"inc-1": {"a1"}}

    # There's a new cluster, but it contains a different alert "a2"
    a2 = _make_alert("a2")
    alert_index["a2"] = a2
    new_clusters = {"cluster-1": {"a2"}}

    res = reconcile(old_incidents, old_members, new_clusters, alert_index)

    assert len(res.resolved) == 1
    assert res.resolved[0].id == "inc-1"
    assert res.resolved[0].status == "resolved"
