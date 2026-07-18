from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from drain3 import TemplateMiner
from drain3.template_miner_config import TemplateMinerConfig

from app.models.schema import Alert


class Normalizer:
    """
    Maps source-specific raw alert dicts → canonical Alert objects.
    Uses Drain3 for streaming log template extraction (online, no retrain needed).
    """

    def __init__(self, drain_sim_th: float = 0.5, drain_depth: int = 4) -> None:
        config = TemplateMinerConfig()
        config.drain_sim_th = drain_sim_th
        config.drain_depth = drain_depth
        config.drain_max_children = 100
        config.parametrize_numeric_tokens = True
        self._miner = TemplateMiner(config=config)

    def process(self, raw: dict[str, Any], source: str) -> Alert:
        """Normalise a raw alert dict into a canonical Alert."""
        normalised = self._source_map(raw, source)
        result = self._miner.add_log_message(normalised["message"])
        template = result["template_mined"] if result else normalised["message"]
        template_id = str(result["cluster_id"]) if result else f"t-{uuid.uuid4().hex[:8]}"

        return Alert(
            id=str(normalised.get("id") or uuid.uuid4()),
            ts=normalised["ts"],
            received_at=datetime.now(UTC),
            source=source,
            host=normalised.get("host"),
            service=normalised.get("service"),
            severity=normalised.get("severity", "info"),
            message=normalised["message"],
            template=template,
            template_id=template_id,
        )

    # ── Source fan-out ─────────────────────────────────────────────────────────

    def _source_map(self, raw: dict[str, Any], source: str) -> dict[str, Any]:
        if "aiops" in source:
            return self._map_aiops(raw)
        if "loghub" in source or "openstack" in source:
            return self._map_loghub(raw)
        if source == "synthetic":
            return self._map_synthetic(raw)
        return self._map_generic(raw)

    # ── Per-source field mappings ──────────────────────────────────────────────

    def _map_aiops(self, raw: dict) -> dict:
        # AIOps Challenge 2020: metric anomaly derived events
        return {
            "id": raw.get("id"),
            "ts": self._parse_ts(raw.get("timestamp") or raw.get("ts")),
            "host": raw.get("cmdb_id") or raw.get("host"),
            "service": raw.get("service_name") or raw.get("service"),
            "severity": self._normalise_severity(raw.get("level") or raw.get("severity")),
            "message": raw.get("content") or raw.get("message", ""),
        }

    def _map_loghub(self, raw: dict) -> dict:
        return {
            "id": raw.get("LineId"),
            "ts": self._parse_ts(raw.get("Time") or raw.get("timestamp")),
            "host": raw.get("Address") or raw.get("host"),
            "service": raw.get("Component") or raw.get("service"),
            "severity": self._normalise_severity(raw.get("Level") or raw.get("severity")),
            "message": raw.get("Content") or raw.get("message", ""),
        }

    def _map_synthetic(self, raw: dict) -> dict:
        return {
            "id": raw.get("id"),
            "ts": self._parse_ts(raw.get("ts") or raw.get("timestamp")),
            "host": raw.get("host"),
            "service": raw.get("service"),
            "severity": self._normalise_severity(raw.get("severity")),
            "message": raw["message"],
        }

    def _map_generic(self, raw: dict) -> dict:
        """Best-effort generic webhook mapping."""
        return {
            "id": raw.get("id"),
            "ts": self._parse_ts(raw.get("timestamp") or raw.get("ts") or raw.get("time"))
            or datetime.now(UTC),
            "host": raw.get("host") or raw.get("hostname") or raw.get("source"),
            "service": (raw.get("service") or raw.get("service_name") or raw.get("application")),
            "severity": self._normalise_severity(
                raw.get("severity") or raw.get("level") or raw.get("priority")
            ),
            "message": (
                raw.get("message") or raw.get("description") or raw.get("text") or str(raw)
            ),
        }

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _parse_ts(self, value: Any) -> datetime:
        if value is None:
            return datetime.now(UTC)
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=UTC)
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(float(value), tz=UTC)
        if isinstance(value, str):
            # fromisoformat handles the +00:00 / +08:00 offsets Python's own
            # datetime.isoformat() emits (used by every generator/parser
            # script in this repo) — the strptime patterns below never
            # matched them and silently fell through to "now", which meant
            # the temporal distance signal was a no-op for every alert
            # sourced this way. See git history for the eval numbers this
            # invalidated before the fix.
            try:
                dt = datetime.fromisoformat(value)
                return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
            except ValueError:
                pass
            for fmt in (
                "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d %H:%M:%S",
            ):
                try:
                    return datetime.strptime(value, fmt).replace(tzinfo=UTC)
                except ValueError:
                    continue
        return datetime.now(UTC)

    def _normalise_severity(self, raw_sev: str | None) -> str:
        if raw_sev is None:
            return "info"
        s = str(raw_sev).lower()
        if s in ("critical", "crit", "fatal", "emergency", "error", "err"):
            return "critical"
        if s in ("warning", "warn", "major", "minor"):
            return "warning"
        return "info"
