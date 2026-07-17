from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from app.models.schema import Alert, Incident, ReplayStatus

SPARKLINE_BUCKET_SECONDS = 10
SPARKLINE_MAX_BUCKETS = 6
RATE_WINDOW_SECONDS = 1.0


@dataclass(frozen=True)
class DedupEntry:
    alert_id: str
    expires_at: datetime


class AppState:
    """
    In-memory application state — the single source of truth for the live pipeline.

    Deliberately not persisted (except alerts, async, write-only to SQLite) — this
    is the "demo scale, in-memory active window" simplification called out in
    ARCHITECTURE.md §10. A fresh AppState() is used per eval harness run so
    evaluation never shares state with the live server.
    """

    def __init__(self) -> None:
        self.alert_index: dict[str, Alert] = {}
        self.incidents: dict[str, Incident] = {}
        self.dedup_index: dict[str, DedupEntry] = {}
        self.dedup_expiry: set[DedupEntry] = set()
        self.sparkline_buckets: dict[str, deque[int]] = {}
        self.alert_batch_buffer: list[Alert] = []
        self.total_alert_count: int = 0
        self.replay_status: ReplayStatus = ReplayStatus()
        self.active_ws: set[Any] = set()
        self._last_bucket_open: datetime = datetime.now(UTC)
        self._recent_ingest_ts: deque[float] = deque(maxlen=2000)

    # ── Alerts ───────────────────────────────────────────────────────────────

    def add_alert(self, alert: Alert) -> None:
        """Register a brand-new (non-duplicate) alert. Dup hits are NOT re-added —
        the deduplicator increments total_alert_count itself on a dup hit."""
        self.alert_index[alert.id] = alert
        self.total_alert_count += 1
        self._recent_ingest_ts.append(datetime.now(UTC).timestamp())

    def active_window(self, t_max_seconds: float) -> list[Alert]:
        """Alerts received within the last t_max_seconds (wall-clock, not event ts)."""
        cutoff = datetime.now(UTC) - timedelta(seconds=t_max_seconds)
        return [a for a in self.alert_index.values() if a.received_at >= cutoff]

    def current_alerts_per_sec(self) -> float:
        cutoff = datetime.now(UTC).timestamp() - RATE_WINDOW_SECONDS
        while self._recent_ingest_ts and self._recent_ingest_ts[0] < cutoff:
            self._recent_ingest_ts.popleft()
        return len(self._recent_ingest_ts) / RATE_WINDOW_SECONDS

    # ── Dedup ────────────────────────────────────────────────────────────────

    def evict_expired_dedup(self) -> int:
        now = datetime.now(UTC)
        expired = {e for e in self.dedup_expiry if e.expires_at <= now}
        if not expired:
            return 0
        for entry in expired:
            self.dedup_expiry.discard(entry)
        stale_fps = [fp for fp, entry in self.dedup_index.items() if entry in expired]
        for fp in stale_fps:
            del self.dedup_index[fp]
        return len(expired)

    # ── Sparklines ───────────────────────────────────────────────────────────

    def update_sparkline(self, incident_id: str, delta: int) -> list[int]:
        """Bump the current 10s bucket for an incident, rolling every incident's
        bucket set forward if the shared bucket window has elapsed."""
        if incident_id not in self.sparkline_buckets:
            self.sparkline_buckets[incident_id] = deque([0], maxlen=SPARKLINE_MAX_BUCKETS)

        now = datetime.now(UTC)
        if (now - self._last_bucket_open).total_seconds() >= SPARKLINE_BUCKET_SECONDS:
            self._last_bucket_open = now
            for buckets in self.sparkline_buckets.values():
                buckets.append(0)

        self.sparkline_buckets[incident_id][-1] += delta
        return list(self.sparkline_buckets[incident_id])

    # ── Derived stats ────────────────────────────────────────────────────────

    @property
    def unique_alert_count(self) -> int:
        return len(self.alert_index)

    @property
    def active_incident_count(self) -> int:
        return sum(1 for inc in self.incidents.values() if inc.status == "active")

    @property
    def unclustered_count(self) -> int:
        return sum(1 for a in self.alert_index.values() if a.cluster_id is None)

    @property
    def compression_ratio(self) -> float:
        if self.total_alert_count == 0:
            return 0.0
        compressed = self.active_incident_count + self.unclustered_count
        return max(0.0, 1.0 - compressed / self.total_alert_count)

    # ── Reset ────────────────────────────────────────────────────────────────

    def reset(self) -> None:
        """Full in-memory reset — POST /replay/reset. Does not touch SQLite history."""
        self.alert_index.clear()
        self.incidents.clear()
        self.dedup_index.clear()
        self.dedup_expiry.clear()
        self.sparkline_buckets.clear()
        self.alert_batch_buffer.clear()
        self._recent_ingest_ts.clear()
        self.total_alert_count = 0
        self._last_bucket_open = datetime.now(UTC)
        self.replay_status = ReplayStatus()


# Global singleton — the live server's state. Tests and the eval harness use
# their own AppState() instances instead so runs never cross-contaminate.
state = AppState()
