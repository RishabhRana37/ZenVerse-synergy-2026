import json
import random
import sys
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import yaml

# Message templates per failure_script event type. Extend this when a new
# scenario YAML introduces an event type not listed here.
EVENT_MESSAGES = {
    "disk_full": [
        ("No space left on device on pg-host-01", "critical"),
        ("Disk usage at 100% on pg-host-01: filesystem full", "critical"),
        ("Storage volume /var/lib/postgresql exhausted on pg-host-01", "critical"),
    ],
    "connection_timeout": [
        ("Connection timeout to {service}: 30000ms exceeded", "warning"),
        ("Failed to connect to {service} after 3 retries", "warning"),
        ("TCP connection to {service} timed out", "critical"),
    ],
    "upstream_error": [
        ("HTTP 503 from upstream", "critical"),
        ("Gateway error: upstream unhealthy", "critical"),
        ("Circuit breaker open — all upstreams marked down", "critical"),
    ],
    "network_partition": [
        ("BGP session down: no route to datacenter-b rack", "critical"),
        ("Network partition detected: 100% packet loss to {service}", "critical"),
        ("Switch {service} unreachable — link down", "critical"),
    ],
    "deploy_regression": [
        ("Error rate spike: 45% 5xx responses on {service} after deploy v128", "critical"),
        ("Canary {service}-v128 failing health checks", "critical"),
        ("P99 latency degraded 8x on {service} since rollout v128", "warning"),
    ],
}

# Failure type recorded in ground truth, per scenario — used only for our own
# labeling; doesn't need to match any external taxonomy.
FAILURE_TYPE_BY_SCENARIO = {
    "db-cascade": "db",
    "network-partition": "network",
    "rolling-deploy": "deploy",
}

NOISE_SERVICES = ["user-svc", "metrics-collector", "log-shipper"]


def generate_scenario(scenario_name: str) -> None:
    scenario_path = Path(__file__).parent.parent / "data" / "scenarios" / f"{scenario_name}.yaml"
    scenario = yaml.safe_load(scenario_path.read_text())

    out_dir = Path(__file__).parent.parent / "data" / "samples"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{scenario_name}.jsonl"
    gt_path = out_dir / f"{scenario_name}_gt.json"

    start_time = datetime.now(UTC)
    alerts: list[dict] = []
    fault_alert_ids: list[str] = []
    root_alert_id: str | None = None

    def add_alert(service, msg, sev, delay_sec, *, is_fault=False, is_root=False):
        nonlocal root_alert_id
        alert_id = str(uuid.uuid4())
        alerts.append(
            {
                "id": alert_id,
                "service": service,
                "message": msg,
                "severity": sev,
                "timestamp": (start_time + timedelta(seconds=delay_sec)).isoformat(),
            }
        )
        if is_fault:
            fault_alert_ids.append(alert_id)
        if is_root:
            root_alert_id = alert_id

    noise_rate = scenario.get("background_noise_rate", 1.0)
    noise_count = int(noise_rate * 20)
    for i in range(noise_count):
        add_alert(
            random.choice(NOISE_SERVICES),
            "Normal background latency spike",
            "info",
            i / max(noise_rate, 0.1),
        )

    root_written = False
    for event in sorted(scenario["failure_script"], key=lambda e: e["t"]):
        templates = EVENT_MESSAGES[event["event"]]
        burst = random.randint(4, 8)
        for i in range(burst):
            msg_template, sev = random.choice(templates)
            msg = msg_template.format(service=event["service"])
            add_alert(
                event["service"],
                msg,
                sev,
                event["t"] + i * 0.4,
                is_fault=True,
                is_root=(not root_written),
            )
            root_written = True

    alerts.sort(key=lambda x: x["timestamp"])

    with open(out_path, "w") as f:
        for a in alerts:
            f.write(json.dumps(a) + "\n")

    gt = {
        "cluster_labels": {aid: "fault-001" for aid in fault_alert_ids},
        "root_causes": {"fault-001": root_alert_id},
        "failure_types": {"fault-001": FAILURE_TYPE_BY_SCENARIO.get(scenario_name, "unknown")},
    }
    gt_path.write_text(json.dumps(gt, indent=2))

    print(f"[{scenario_name}] generated {len(alerts)} alerts ({len(fault_alert_ids)} fault-related) at {out_path}")
    print(f"[{scenario_name}] wrote ground truth (root={root_alert_id}) at {gt_path}")


if __name__ == "__main__":
    names = sys.argv[1:] or ["db-cascade", "network-partition", "rolling-deploy"]
    for name in names:
        generate_scenario(name)
