from __future__ import annotations

import hashlib
from datetime import timedelta

from app.models.schema import Alert
from app.models.state import AppState, DedupEntry


class Deduplicator:
    """
    Keep-style fingerprint deduplication with configurable TTL expiry.

    Fingerprint = sha256(template_id | host | service)[:16]

    TTL runs on EVENT time (alert.ts), measured from the canonical alert's
    first occurrence — the same semantics the eval harness scores, and
    replay-speed-invariant (wall-clock TTL at replay speed N covers N x the
    intended event duration, over-collapsing recurrences). For live webhook
    traffic event ts ~= arrival time, so behavior there is unchanged.

    On a dedup hit:
      - increments dup_count on the existing alert
      - returns (existing_alert, is_dup=True) → caller pushes alert.dedup WS event

    On a new alert (or a fingerprint whose entry expired relative to the
    incoming alert's event ts):
      - registers fingerprint + DedupEntry with TTL
      - returns (alert, is_dup=False) → caller continues to embedder
    """

    def __init__(self, t_max_seconds: int = 300) -> None:
        self.ttl = timedelta(seconds=t_max_seconds)

    def fingerprint(self, alert: Alert) -> str:
        raw = f"{alert.template_id}|{alert.host or ''}|{alert.service or ''}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def process(self, alert: Alert, state: AppState) -> tuple[Alert, bool]:
        fp = self.fingerprint(alert)
        entry = state.dedup_index.get(fp)

        if entry is not None:
            existing = state.alert_index.get(entry.alert_id)
            if existing is not None and alert.ts <= entry.expires_at:
                existing.dup_count += 1
                state.total_alert_count += 1
                return existing, True
            # Entry expired relative to this alert's event time, or its alert
            # was evicted from the index — either way this occurrence is new.
            state.dedup_expiry.discard(entry)

        # New fingerprint — TTL measured from this occurrence's event ts
        expires_at = alert.ts + self.ttl
        new_entry = DedupEntry(alert_id=alert.id, expires_at=expires_at)
        state.dedup_index[fp] = new_entry
        state.dedup_expiry.add(new_entry)
        return alert, False
