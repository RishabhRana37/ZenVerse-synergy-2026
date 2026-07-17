import json
import random
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import yaml


def generate_db_cascade():
    """
    Generates data/samples/db-cascade.jsonl from data/scenarios/db-cascade.yaml's
    failure_script, so the alert data, the topology, the frontend mock scenario
    (frontend/mock/scenario-db-cascade.json), and DEMO_SCRIPT.md all tell the
    same story: postgres-primary disk_full cascading through its dependents.

    (This previously generated a different, unrelated redis-cache -> auth-svc
    story that didn't match db-cascade.yaml's declared services/edges at all —
    the topology signal was scoring against a graph that didn't describe the
    injected fault.)
    """
    scenario_path = Path(__file__).parent.parent / "data" / "scenarios" / "db-cascade.yaml"
    scenario = yaml.safe_load(scenario_path.read_text())

    out_dir = Path(__file__).parent.parent / "data" / "samples"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "db-cascade.jsonl"
    gt_path = out_dir / "db-cascade_gt.json"

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

    event_messages = {
        "disk_full": [
            ("No space left on device on pg-host-01", "critical"),
            ("Disk usage at 100% on pg-host-01: filesystem full", "critical"),
            ("Storage volume /var/lib/postgresql exhausted on pg-host-01", "critical"),
        ],
        "connection_timeout": [
            ("Connection timeout to postgres-primary: 30000ms exceeded", "warning"),
            ("Failed to connect to postgres-primary after 3 retries", "warning"),
            ("TCP connection to postgres-primary:5432 timed out", "critical"),
        ],
        "upstream_error": [
            ("HTTP 503 from upstream", "critical"),
            ("Gateway error: upstream unhealthy", "critical"),
            ("Circuit breaker open — all upstreams marked down", "critical"),
        ],
    }

    # Background noise: unrelated services, unrelated to any dependency in the
    # topology, so the correlator has real noise to reject.
    noise_services = ["user-svc", "metrics-collector", "log-shipper"]
    for i in range(20):
        add_alert(
            random.choice(noise_services),
            "Normal background latency spike",
            "info",
            i * 1.0,
        )

    # Root cause + cascade, exactly per db-cascade.yaml's failure_script.
    root_written = False
    for event in sorted(scenario["failure_script"], key=lambda e: e["t"]):
        templates = event_messages[event["event"]]
        burst = random.randint(4, 8)
        for i in range(burst):
            msg, sev = random.choice(templates)
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

    # Ground truth is exact for synthetic data — no inference needed, we
    # injected the fault ourselves.
    gt = {
        "cluster_labels": {aid: "fault-001" for aid in fault_alert_ids},
        "root_causes": {"fault-001": root_alert_id},
        "failure_types": {"fault-001": "db"},
    }
    gt_path.write_text(json.dumps(gt, indent=2))

    print(f"Generated {len(alerts)} alerts ({len(fault_alert_ids)} fault-related) at {out_path}")
    print(f"Wrote ground truth ({len(fault_alert_ids)} labeled, root={root_alert_id}) at {gt_path}")


if __name__ == "__main__":
    generate_db_cascade()
