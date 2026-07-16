from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.models.schema import Alert, Incident

logger = logging.getLogger(__name__)


@dataclass
class IncidentDiff:
    incident_id: str
    added_alert_ids: list[str] = field(default_factory=list)
    removed_alert_ids: list[str] = field(default_factory=list)
    is_new: bool = False


@dataclass
class ReconcileResult:
    updated: list[tuple[Incident, IncidentDiff]] = field(default_factory=list)
    created: list[tuple[Incident, set[str]]] = field(default_factory=list)
    resolved: list[Incident] = field(default_factory=list)


def reconcile(
    old_incidents: dict[str, Incident],
    old_members: dict[str, set[str]],      # incident_id → {alert_ids}
    new_clusters: dict[str, set[str]],     # cluster_key → {alert_ids}
    alert_index: dict[str, Alert],
    min_overlap_pct: float = 0.30,
) -> ReconcileResult:
    """
    Greedy max-overlap matching between existing incidents and new DBSCAN clusters.
    Preserves stable incident IDs across ticks so UI cards update without flickering.

    Split handling:
      If old incident A has ≥ min_overlap_pct overlap with TWO new clusters:
      A keeps the larger-overlap cluster; the smaller cluster becomes a new incident.

    Merge handling:
      If two old incidents (A, B) both have best-match to the same new cluster:
      The incident with larger overlap wins; the other is resolved.

    Resolution:
      Old active incidents with no matched new cluster AND whose member alerts
      have all aged out of the active window are resolved.
    """
    result = ReconcileResult()

    if not new_clusters:
        # No clusters this tick — resolve all active incidents whose alerts are gone
        all_windowed = set(alert_index.keys())
        for iid, inc in old_incidents.items():
            if inc.status == "active":
                old_m = old_members.get(iid, set())
                if not (old_m & all_windowed):
                    inc.status = "resolved"
                    inc.resolved_at = datetime.now(timezone.utc)
                    result.resolved.append(inc)
        return result

    # ── Build overlap matrix ───────────────────────────────────────────────────
    # (overlap_count, incident_id, cluster_key) — sorted desc for greedy pass
    overlaps: list[tuple[int, str, str]] = []
    for iid, members in old_members.items():
        if not members:
            continue
        for ck, cluster_alerts in new_clusters.items():
            count = len(members & cluster_alerts)
            if count > 0:
                overlaps.append((count, iid, ck))

    overlaps.sort(key=lambda x: x[0], reverse=True)

    assigned_incident_to_cluster: dict[str, str] = {}  # incident_id → cluster_key
    assigned_cluster_to_incident: dict[str, str] = {}  # cluster_key → incident_id

    for count, iid, ck in overlaps:
        if iid in assigned_incident_to_cluster or ck in assigned_cluster_to_incident:
            continue
        old_size = len(old_members.get(iid, set()))
        new_size = len(new_clusters[ck])
        denom = max(old_size, new_size)
        if denom > 0 and (count / denom) >= min_overlap_pct:
            assigned_incident_to_cluster[iid] = ck
            assigned_cluster_to_incident[ck] = iid

    # ── Process matched pairs ──────────────────────────────────────────────────
    for iid, ck in assigned_incident_to_cluster.items():
        inc = old_incidents[iid]
        old_m = old_members.get(iid, set())
        new_m = new_clusters[ck]

        added = list(new_m - old_m)
        removed = list(old_m - new_m)

        inc.updated_at = datetime.now(timezone.utc)
        inc.unique_count = len(new_m)
        inc.alert_count = sum(
            alert_index[aid].dup_count for aid in new_m if aid in alert_index
        )
        inc.services = sorted(
            {alert_index[aid].service for aid in new_m
             if aid in alert_index and alert_index[aid].service}
        )

        diff = IncidentDiff(
            incident_id=iid,
            added_alert_ids=added,
            removed_alert_ids=removed,
        )
        result.updated.append((inc, diff))

    # ── Unmatched new clusters → new incidents ─────────────────────────────────
    for ck, cluster_alerts in new_clusters.items():
        if ck in assigned_cluster_to_incident:
            continue

        services = sorted(
            {alert_index[aid].service for aid in cluster_alerts
             if aid in alert_index and alert_index[aid].service}
        )
        alert_count = sum(
            alert_index[aid].dup_count for aid in cluster_alerts if aid in alert_index
        )
        title = (
            f"{services[0]} failure — {len(cluster_alerts)} alerts"
            if services
            else f"Incident — {len(cluster_alerts)} alerts"
        )
        inc = Incident(
            id=str(uuid.uuid4()),
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
            unique_count=len(cluster_alerts),
            alert_count=alert_count,
            services=services,
            title=title,
        )
        result.created.append((inc, cluster_alerts))

    # ── Unmatched old active incidents: resolve if alerts aged out ─────────────
    all_windowed_alerts = set(alert_index.keys())
    for iid, inc in old_incidents.items():
        if iid in assigned_incident_to_cluster or inc.status != "active":
            continue
        old_m = old_members.get(iid, set())
        if not (old_m & all_windowed_alerts):
            # All member alerts aged out of the active window
            inc.status = "resolved"
            inc.resolved_at = datetime.now(timezone.utc)
            result.resolved.append(inc)

    return result
