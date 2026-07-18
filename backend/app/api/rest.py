from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel

from app.models.state import state

logger = logging.getLogger(__name__)
router = APIRouter()

# Injected by main.py after startup
_pipeline = None
_replay_engine = None
_topology_loader = None


def init_router(pipeline, replay_engine, topology_loader) -> None:
    global _pipeline, _replay_engine, _topology_loader
    _pipeline = pipeline
    _replay_engine = replay_engine
    _topology_loader = topology_loader


# ── Ingestion ─────────────────────────────────────────────────────────────────


@router.post("/alerts", status_code=202)
async def ingest_alerts(body: dict | list = Body(...)):
    """Webhook ingest. Accepts a single alert dict or a JSON array."""
    alerts = body if isinstance(body, list) else [body]
    for raw in alerts:
        source = raw.get("source", "webhook")
        await _pipeline.ingest(raw, source=source)
    return {"accepted": len(alerts)}


# ── Replay control ────────────────────────────────────────────────────────────


class ReplayStartRequest(BaseModel):
    dataset: str = "aiops-scn1"
    speed: float = 1.0
    scenario: str = "db-cascade"


@router.post("/replay/start")
async def replay_start(req: ReplayStartRequest):
    # Every new replay starts from a clean slate: without this, incidents
    # (and the event clock) from a previous dataset/scenario survive and
    # never resolve, since a differently-timestamped dataset may never
    # advance latest_event_ts past them (see /replay/reset for the same
    # bookkeeping — this mirrors it exactly).
    async with _pipeline._lock:
        await _replay_engine.stop()
        state.reset()
        _pipeline._incident_members.clear()
        _pipeline._resolved_members.clear()
        # Reload topology + scenario-specific clustering config before starting replay
        _pipeline.configure_scenario(req.scenario)
        await _replay_engine.start(
            dataset=req.dataset,
            speed=req.speed,
            scenario=req.scenario,
            pipeline_ingest_fn=_pipeline.ingest,
        )
    return {
        "status": "started",
        "dataset": req.dataset,
        "speed": req.speed,
        "scenario": req.scenario,
    }


@router.post("/replay/stop")
async def replay_stop():
    await _replay_engine.stop()
    return {"status": "stopped"}


@router.post("/replay/reset")
async def replay_reset():
    """
    Clears all in-memory state (incidents, alerts, dedup index, sparklines) and stops replay.
    Maps to keyboard shortcut 'r' in the DemoDriver panel.
    """
    async with _pipeline._lock:
        await _replay_engine.reset()
        # Pipeline-level bookkeeping lives outside AppState — leaving it stale
        # would feed the reconciler member sets from before the reset.
        _pipeline._incident_members.clear()
        _pipeline._resolved_members.clear()
    return {"status": "reset"}


# ── Incidents ─────────────────────────────────────────────────────────────────


@router.get("/incidents")
async def list_incidents():
    return [inc.model_dump(mode="json") for inc in state.incidents.values()]


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: str):
    inc = state.incidents.get(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")

    member_ids = _pipeline._incident_members.get(incident_id) or _pipeline._resolved_members.get(
        incident_id, set()
    )
    members = [state.alert_index[aid] for aid in member_ids if aid in state.alert_index]

    root_svc = inc.root_candidates[0].service if inc.root_candidates else None
    topology_path = _topology_loader.propagation_path(root_svc, inc.services) if root_svc else []

    return {
        **inc.model_dump(mode="json"),
        "members": [m.model_dump(mode="json") for m in members],
        "topology_path": [list(edge) for edge in topology_path],
    }


@router.post("/incidents/{incident_id}/acknowledge")
async def acknowledge_incident(incident_id: str):
    inc = state.incidents.get(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    inc.acknowledged = True
    inc.updated_at = datetime.now(UTC)
    from app.api.ws import broadcast

    await broadcast(
        {
            "type": "incident.updated",
            "incident": inc.model_dump(mode="json"),
            "added_alert_ids": [],
            "removed_alert_ids": [],
        }
    )
    return {"status": "acknowledged", "incident_id": incident_id}


@router.post("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str):
    inc = state.incidents.get(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    inc.status = "resolved"
    inc.resolved_at = datetime.now(UTC)
    inc.updated_at = datetime.now(UTC)
    from app.api.ws import broadcast

    await broadcast(
        {
            "type": "incident.updated",
            "incident": inc.model_dump(mode="json"),
            "added_alert_ids": [],
            "removed_alert_ids": [],
        }
    )
    return {"status": "resolved", "incident_id": incident_id}


# ── Topology ──────────────────────────────────────────────────────────────────


@router.get("/topology")
async def get_topology():
    return {
        "nodes": [n.model_dump() for n in _topology_loader.nodes_list()],
        "edges": [e.model_dump() for e in _topology_loader.edges_list()],
    }


# ── Raw alerts (eval/debug only — not used by live war-room UI) ───────────────


@router.get("/alerts")
async def list_alerts(limit: int = 200, offset: int = 0):
    """
    Paginated raw alert history for the eval harness and debugging.
    The live war-room UI does NOT call this endpoint — it reads from WS alert.batch events.
    """
    all_alerts = sorted(state.alert_index.values(), key=lambda a: a.ts, reverse=True)
    page = all_alerts[offset : offset + limit]
    return [a.model_dump(mode="json") for a in page]


# ── Evaluation results ────────────────────────────────────────────────────────

EVAL_DIR = Path(__file__).parent.parent.parent / "eval" / "results"


# Ablation key -> dashboard display label. Hyphenated (no spaces) because the
# eval chart keys its x-axis on backend_name.split(" ")[0] and needs them unique.
_ABLATION_LABEL = {
    "full": "Full-system",
    "naive_dedup": "Naive-dedup",
    "denstream": "DenStream",
    "no_semantic": "No-semantic",
    "no_topology": "No-topology",
    "no_temporal": "No-temporal",
}
# Ordered so "Full-system" is always the first/reference row per scenario.
_ABLATION_ORDER = ["full", "naive_dedup", "no_semantic", "no_topology", "no_temporal", "denstream"]

# Targets from docs/EVALUATION.md — the pass/fail bars on the dashboard.
_EVAL_TARGETS = {
    "compression_ratio": 0.95,
    "purity": 0.80,
    "hit_at_1": 0.60,
    "hit_at_3": 0.85,
    "latency_p95_ms": 5000,
}


def _load_latency_by_dataset() -> dict[str, dict]:
    """bench_<dataset>_<sha>.json files carry measured p50/p95 (harness accuracy
    runs leave them null). Newest per dataset wins."""
    import json

    out: dict[str, dict] = {}
    for f in sorted(EVAL_DIR.glob("bench_*.json")):
        try:
            data = json.loads(f.read_text())
            out[data["dataset"]] = data
        except Exception:
            pass
    return out


@router.get("/eval/results")
async def eval_results():
    """
    Aggregates the per-ablation harness result files into the single EvalData
    object the EvalDashboard renders: one 'scenario' per dataset, one 'backend'
    row per ablation, plus measured latency (from bench files) and the
    EVALUATION.md target bars. Every number is traceable to a committed
    eval/results/*.json produced by `python -m eval.harness`.
    """
    import json

    if not EVAL_DIR.exists():
        return {"generated_at": None, "dataset": "", "scenarios": [], "targets": _EVAL_TARGETS}

    latency = _load_latency_by_dataset()
    # dataset -> {ablation -> row}, keeping the newest file per (dataset, ablation)
    by_dataset: dict[str, dict[str, dict]] = {}
    newest_ts: str | None = None

    for f in sorted(EVAL_DIR.glob("*.json")):
        if f.name.startswith("bench_"):
            continue
        try:
            r = json.loads(f.read_text())
        except Exception:
            continue
        dataset = r.get("dataset")
        if not dataset:
            continue
        ablation = r.get("ablation") or "full"
        lat = latency.get(dataset, {})
        row = {
            "backend": _ABLATION_LABEL.get(ablation, ablation),
            "compression_ratio": r.get("compression_ratio", 0.0),
            "purity": r.get("cluster_purity", 0.0),
            "ari": r.get("ari", 0.0),
            "hit_at_1": r.get("hit_at_1", 0.0),
            "hit_at_3": r.get("hit_at_3", 0.0),
            "latency_p50_ms": r.get("latency_p50_ms") or lat.get("latency_p50_ms", 0),
            "latency_p95_ms": r.get("latency_p95_ms") or lat.get("latency_p95_ms", 0),
            "fragmentation": r.get("fragmentation", 0.0),
            "_ablation": ablation,
        }
        by_dataset.setdefault(dataset, {})[ablation] = row
        ts = r.get("timestamp")
        if ts and (newest_ts is None or ts > newest_ts):
            newest_ts = ts

    scenarios = []
    for dataset, rows in sorted(by_dataset.items()):
        ordered = [rows[a] for a in _ABLATION_ORDER if a in rows]
        ordered += [v for k, v in rows.items() if k not in _ABLATION_ORDER]
        for row in ordered:
            row.pop("_ablation", None)
        scenarios.append({"name": dataset, "backends": ordered})

    # Hero + chart key off the real labeled dataset if present, else the first.
    primary = (
        "aiops-scn1"
        if "aiops-scn1" in by_dataset
        else (sorted(by_dataset)[0] if by_dataset else "")
    )
    return {
        "generated_at": newest_ts,
        "dataset": primary,
        "scenarios": scenarios,
        "targets": _EVAL_TARGETS,
    }
