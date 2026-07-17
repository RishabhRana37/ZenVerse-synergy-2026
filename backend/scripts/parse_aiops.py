#!/usr/bin/env python3
"""
AIOps Dataset Parser
Extracts topology, mock alerts, and ground truth from raw AIOps CSVs.
"""

import csv
import json
import math
import uuid
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.parent
RAW_DIR = ROOT_DIR / "data" / "raw" / "aiops-2020"
OUT_DIR = ROOT_DIR / "backend" / "data" / "samples"
EVAL_DIR = ROOT_DIR / "backend" / "data" / "eval"


# Welford's online algorithm for variance
class RunningStat:
    def __init__(self):
        self.count = 0
        self.mean = 0.0
        self.m2 = 0.0

    def push(self, x: float):
        self.count += 1
        delta = x - self.mean
        self.mean += delta / self.count
        delta2 = x - self.mean
        self.m2 += delta * delta2

    def variance(self):
        if self.count < 2:
            return 0.0
        return self.m2 / (self.count - 1)

    def std_dev(self):
        return math.sqrt(self.variance())


def _day_dirs():
    """All extracted day directories under RAW_DIR, sorted chronologically."""
    if not RAW_DIR.exists():
        return []
    return sorted(d for d in RAW_DIR.iterdir() if d.is_dir())


def parse_topology():
    print("Parsing traces for topology...")
    nodes = set()
    edges = set()

    days = _day_dirs()
    if not days:
        print(f"Skipping topology: {RAW_DIR} not found or empty")
        return

    # Static architecture — union nodes/edges observed across every day so a
    # dependency only visible in one day's traces still makes it into the graph.
    for day in days:
        trace_dir = day / "调用链指标"
        if not trace_dir.exists():
            continue

        # id -> cmdb_id, to build edges between parent/child spans. Reset per
        # day: span IDs are not guaranteed unique across days.
        span_map = {}

        for csv_file in trace_dir.glob("*.csv"):
            with open(csv_file, encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for i, row in enumerate(reader):
                    if i > 50000:  # Limit per file per day to bound runtime
                        break
                    span_id = row.get("id")
                    parent_id = row.get("pid")
                    cmdb_id = row.get("cmdb_id")

                    # Raw traces use the literal string "NULL" for unresolved
                    # parent spans (not a real service) — YAML would also
                    # parse it back as None on load, breaking TopologyLoader.
                    if not cmdb_id or cmdb_id == "NULL":
                        continue

                    nodes.add(cmdb_id)
                    span_map[span_id] = cmdb_id

                    if parent_id and parent_id != "None" and parent_id in span_map:
                        parent_node = span_map[parent_id]
                        if parent_node != cmdb_id:
                            edges.add((parent_node, cmdb_id))

    topology = {
        "nodes": [{"id": n} for n in nodes],
        "edges": [{"source": u, "target": v} for u, v in edges],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_file = OUT_DIR / "aiops-topology.json"
    with open(out_file, "w") as f:
        json.dump(topology, f, indent=2)
    print(
        f"Topology saved to {out_file} ({len(nodes)} nodes, {len(edges)} edges, "
        f"{len(days)} days scanned)"
    )


def parse_alerts():
    print("Parsing metrics for alerts...")
    out_file = OUT_DIR / "aiops-scn1.jsonl"
    # Shared across days on purpose: the anomaly baseline (mean/std per
    # cmdb_id+metric) is more robust pooled over more "normal" observations,
    # and days are processed in chronological order so early low-count
    # windows still self-correct as more data streams in.
    stats = defaultdict(RunningStat)
    alerts = []

    days = _day_dirs()
    if not days:
        print(f"Skipping alerts: {RAW_DIR} not found or empty")
        return

    for day in days:
        platform_dir = day / "平台指标"
        if not platform_dir.exists():
            continue

        for csv_file in platform_dir.glob("*.csv"):
            with open(csv_file, encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for i, row in enumerate(reader):
                    if i > 100000:  # process first 100k rows per file per day
                        break

                    cmdb_id = row.get("cmdb_id")
                    metric = row.get("name")
                    val_str = row.get("value")
                    ts_ms = row.get("timestamp")

                    if not cmdb_id or not val_str or not ts_ms:
                        continue

                    try:
                        val = float(val_str)
                        ts = int(ts_ms) / 1000.0
                    except ValueError:
                        continue

                    key = (cmdb_id, metric)
                    stat = stats[key]

                    # Anomaly detection (Z-score > 3)
                    if stat.count > 10:
                        std = stat.std_dev()
                        if std > 0:
                            z = abs(val - stat.mean) / std
                            if z > 3.0:
                                dt = datetime.fromtimestamp(ts, tz=UTC)
                                alerts.append(
                                    {
                                        "id": str(uuid.uuid4()),
                                        "service": cmdb_id,
                                        "message": f"Anomaly on {metric}: val={val:.2f} (Z={z:.1f})",
                                        "severity": "critical" if z > 5 else "warning",
                                        "timestamp": dt.isoformat(),
                                    }
                                )

                    stat.push(val)

    alerts.sort(key=lambda x: x["timestamp"])

    with open(out_file, "w") as f:
        for a in alerts:
            f.write(json.dumps(a) + "\n")
    print(f"Generated {len(alerts)} alerts from {len(days)} days saved to {out_file}")


def parse_ground_truth():
    print("Parsing ground truth...")
    gt_file = ROOT_DIR / "data" / "AIOps 2020" / "故障整理（预赛）.csv"
    if not gt_file.exists():
        print(f"Skipping GT: {gt_file} not found")
        return

    incidents = []
    with open(gt_file, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rc = row.get("name")
            if not rc:
                continue

            incidents.append(
                {
                    "id": str(uuid.uuid4()),
                    "title": f"{row.get('object')} fault",
                    "description": row.get("fault_desrcibtion"),
                    "status": "resolved",
                    "root_cause_service": rc,
                }
            )

    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    out_file = EVAL_DIR / "aiops-ground-truth.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(incidents, f, indent=2, ensure_ascii=False)
    print(f"Generated {len(incidents)} GT incidents saved to {out_file}")


def main():
    parse_topology()
    parse_alerts()
    parse_ground_truth()


if __name__ == "__main__":
    main()
