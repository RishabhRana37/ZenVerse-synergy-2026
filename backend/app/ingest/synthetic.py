from __future__ import annotations

import asyncio
import logging
import random
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

# Realistic alert message templates — judges will read the raw stream panel
_MESSAGES: dict[str, list[str]] = {
    "disk_full": [
        "No space left on device on {host}",
        "Disk usage at 100% on {host}: filesystem full",
        "CRITICAL: disk full on {host} — write failed",
        "disk full on {host}",
        "Storage volume /var/lib/postgresql exhausted on {host}",
    ],
    "connection_timeout": [
        "Connection timeout to {upstream}: 30000ms exceeded",
        "Failed to connect to {upstream} after 3 retries",
        "upstream {upstream} not responding — connection refused",
        "ECONNREFUSED connecting to {upstream}",
        "TCP connection to {upstream}:5432 timed out",
    ],
    "upstream_error": [
        "HTTP 503 from upstream {upstream}",
        "Upstream {upstream} returned 5xx errors — circuit breaker open",
        "Gateway error: {upstream} unhealthy",
        "All upstreams marked down for {upstream}",
        "503 Service Unavailable from {upstream}",
    ],
    "network_partition": [
        "Network partition detected: cannot reach {upstream}",
        "Packet loss 100% to {upstream}",
        "ARP resolution failed for {upstream}",
        "Network unreachable: {upstream}",
        "ICMP host unreachable: {upstream}",
    ],
    "deploy_regression": [
        "Error rate spike after deploy: {service} → {pct}% 5xx",
        "P99 latency degraded: {service} 45ms → {latency}ms after rollout",
        "Health check failing: {service} returned 500 after deployment",
        "Rollout canary {service} unhealthy: {pct}% error rate",
    ],
    "memory_oom": [
        "Out of memory on {host}: OOM killer invoked",
        "Process killed by OOM on {host}",
        "Memory pressure critical on {host} — swap exhausted",
    ],
    "background_noise": [
        "Slow query: {duration}ms on {host}",
        "Certificate expires in {days} days for {host}",
        "Backup completed with warnings on {host}",
        "NTP drift {drift}ms on {host}",
        "Log rotation completed on {host}",
        "Scheduled task missed window on {host}",
        "Minor GC pause: {duration}ms on {host}",
    ],
}

_SEVERITIES: dict[str, str] = {
    "disk_full": "critical",
    "connection_timeout": "warning",
    "upstream_error": "critical",
    "network_partition": "critical",
    "deploy_regression": "warning",
    "memory_oom": "critical",
    "background_noise": "info",
}


class SyntheticStormGenerator:
    """
    Generates plausible alert storms from scenario YAML files.
    Used for controllable live demos and stress tests.
    """

    DATA_DIR = Path(__file__).parent.parent.parent / "data"

    def __init__(self, scenario: str = "db-cascade") -> None:
        self.scenario = scenario
        self._data = self._load_scenario(scenario)

    def _load_scenario(self, scenario: str) -> dict:
        path = self.DATA_DIR / "scenarios" / f"{scenario}.yaml"
        if not path.exists():
            logger.warning("Scenario '%s' not found — using empty scenario", scenario)
            return {"failure_script": [], "background_noise_rate": 1.0, "services": []}
        with open(path) as f:
            return yaml.safe_load(f)

    async def generate(
        self,
        speed: float = 1.0,
        pipeline_ingest_fn: Callable | None = None,
    ) -> None:
        """Play back the scenario failure script + background noise at speed×."""
        script = sorted(self._data.get("failure_script", []), key=lambda e: e.get("t", 0))
        noise_rate = self._data.get("background_noise_rate", 1.0)
        services = [s["name"] for s in self._data.get("services", [])]
        noise_services = services + ["metrics-exporter", "logger", "monitor-agent"]

        loop_start = asyncio.get_event_loop().time()

        async def background_loop() -> None:
            while True:
                delay = (1.0 / max(noise_rate, 0.01)) / speed
                await asyncio.sleep(delay)
                alert = self._make_alert(
                    event="background_noise",
                    service=random.choice(noise_services),
                    host=f"host-{random.randint(10, 99)}",
                    upstream=None,
                )
                if pipeline_ingest_fn:
                    await pipeline_ingest_fn(alert, "synthetic")

        noise_task = asyncio.create_task(background_loop())

        try:
            for event in script:
                target_t = event.get("t", 0) / speed
                elapsed = asyncio.get_event_loop().time() - loop_start
                wait = max(0.0, target_t - elapsed)
                await asyncio.sleep(wait)

                service = event["service"]
                event_type = event["event"]

                # Find services that depend on this one (cascade targets)
                dependents = [
                    s["name"]
                    for s in self._data.get("services", [])
                    if service in (s.get("depends_on") or [])
                ]
                upstream = service  # for timeout messages pointing at the root

                # Emit a burst of alerts for this failure event
                burst = random.randint(5, 20)
                for _ in range(burst):
                    alert = self._make_alert(
                        event=event_type,
                        service=service,
                        host=f"host-{random.randint(1, 5)}",
                        upstream=upstream,
                    )
                    if pipeline_ingest_fn:
                        await pipeline_ingest_fn(alert, "synthetic")
                    await asyncio.sleep(random.uniform(0.02, 0.4) / speed)

                # Emit cascade: dependent services start timing out
                for dep in dependents:
                    cascade_burst = random.randint(3, 10)
                    for _ in range(cascade_burst):
                        alert = self._make_alert(
                            event="connection_timeout",
                            service=dep,
                            host=f"host-{random.randint(1, 5)}",
                            upstream=service,
                        )
                        if pipeline_ingest_fn:
                            await pipeline_ingest_fn(alert, "synthetic")
                        await asyncio.sleep(random.uniform(0.1, 0.8) / speed)
        finally:
            noise_task.cancel()
            try:
                await noise_task
            except asyncio.CancelledError:
                pass

    def _make_alert(
        self,
        event: str,
        service: str,
        host: str,
        upstream: str | None,
    ) -> dict:
        templates = _MESSAGES.get(event, _MESSAGES["background_noise"])
        msg = random.choice(templates).format(
            host=host,
            upstream=upstream or service,
            service=service,
            pct=random.randint(8, 45),
            latency=random.randint(500, 3000),
            duration=random.randint(200, 5000),
            days=random.randint(1, 30),
            drift=round(random.uniform(0.5, 50.0), 1),
        )
        return {
            "id": str(uuid.uuid4()),
            "ts": datetime.now(UTC).isoformat(),
            "host": host,
            "service": service,
            "severity": _SEVERITIES.get(event, "info"),
            "message": msg,
        }
