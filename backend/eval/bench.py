"""
eval/bench.py — Streaming latency benchmark.

Replays at real speed and measures (alert_received → incident_card_updated) latency.

Usage:
  python -m eval.bench --dataset aiops-scn1 --speed 100 --duration 60

Outputs p50/p95 to stdout and appends to eval/results/ (consumed by /eval/results endpoint).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)
RESULTS_DIR = Path(__file__).parent / "results"


async def run_bench(dataset: str, speed: float, duration: int, scenario: str) -> None:
    from app.api.ws import broadcast
    from app.ingest.replay_engine import ReplayEngine
    from app.models.db import init_db
    from pipeline import pipeline

    logging.basicConfig(level=logging.WARNING)  # suppress noise during bench

    init_db()
    pipeline.configure_scenario(scenario)
    pipeline.set_broadcast(broadcast)

    latencies: list[float] = []
    ingest_timestamps: dict[str, float] = {}  # alert_id → monotonic time of ingest

    original_ingest = pipeline.ingest

    async def instrumented_ingest(raw: dict, source: str) -> None:
        alert_id = raw.get("id", "unknown")
        t_start = time.monotonic()
        await original_ingest(raw, source)
        ingest_timestamps[alert_id] = t_start

    pipeline.ingest = instrumented_ingest

    original_broadcast = pipeline._broadcast_fn

    async def instrumented_broadcast(msg: dict) -> None:
        if msg.get("type") in ("incident.created", "incident.updated"):
            t_now = time.monotonic()
            # Estimate latency from the most recently ingested alert
            if ingest_timestamps:
                latest_ingest_t = max(ingest_timestamps.values())
                latency_ms = (t_now - latest_ingest_t) * 1000
                if 0 < latency_ms < 30_000:  # sanity bound: < 30 s
                    latencies.append(latency_ms)
        if original_broadcast:
            await original_broadcast(msg)

    pipeline.set_broadcast(instrumented_broadcast)

    tick_task = asyncio.create_task(pipeline.tick())
    flush_task = asyncio.create_task(pipeline.ws_flush_loop())
    db_task = asyncio.create_task(pipeline.db_writer_loop())

    replay = ReplayEngine()
    await replay.start(
        dataset=dataset,
        speed=speed,
        scenario=scenario,
        pipeline_ingest_fn=pipeline.ingest,
    )

    print(f"Benchmark running for {duration}s at {speed}× speed...")
    await asyncio.sleep(duration)
    await replay.stop()

    tick_task.cancel()
    flush_task.cancel()
    db_task.cancel()
    try:
        await asyncio.gather(tick_task, flush_task, db_task, return_exceptions=True)
    except Exception:
        pass

    if not latencies:
        print("No latency samples collected — check dataset and replay speed.")
        return

    arr = np.array(latencies)
    p50 = float(np.percentile(arr, 50))
    p95 = float(np.percentile(arr, 95))

    print(f"\nLatency results (n={len(latencies)}):")
    print(f"  p50: {p50:.1f} ms")
    print(f"  p95: {p95:.1f} ms")
    print(f"  Target p95 < 5000 ms: {'PASS' if p95 < 5000 else 'FAIL'}")

    try:
        sha = (
            subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL
            )
            .decode()
            .strip()
        )
    except Exception:
        sha = "unknown"

    out = {
        "type": "bench",
        "dataset": dataset,
        "speed": speed,
        "duration_s": duration,
        "git_sha": sha,
        "timestamp": datetime.now(UTC).isoformat(),
        "latency_p50_ms": round(p50, 2),
        "latency_p95_ms": round(p95, 2),
        "n_samples": len(latencies),
    }
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    fname = f"bench_{dataset}_{sha}.json"
    (RESULTS_DIR / fname).write_text(json.dumps(out, indent=2))
    print(f"\nResults written to eval/results/{fname}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="StormLens streaming latency benchmark")
    parser.add_argument("--dataset", default="aiops-scn1")
    parser.add_argument("--speed", type=float, default=100.0)
    parser.add_argument("--duration", type=int, default=60, help="Benchmark duration in seconds")
    parser.add_argument(
        "--scenario",
        default=None,
        help="topology scenario (data/scenarios/<name>.yaml). Defaults to the "
        "dataset name, except aiops-scn1 -> aiops. Previously hardcoded to "
        "db-cascade regardless of --dataset, so a bench run against any other "
        "dataset silently measured the pipeline configured with db-cascade's "
        "tiny 7-node topology and its looser eps=0.35 — not the dataset's own "
        "topology/eps. That invalidated every non-db-cascade latency number "
        "ever produced by this script.",
    )
    args = parser.parse_args()
    scenario = args.scenario or ("aiops" if args.dataset == "aiops-scn1" else args.dataset)
    asyncio.run(run_bench(args.dataset, args.speed, args.duration, scenario))
