from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
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
async def ingest_alerts(body: dict | list):
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
    await _replay_engine.reset()
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

    member_ids = _pipeline._incident_members.get(incident_id, set())
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


@router.get("/eval/results")
async def eval_results():
    """Returns the latest eval run results. Consumed by the EvalDashboard."""
    if not EVAL_DIR.exists():
        return []
    results = []
    for f in sorted(EVAL_DIR.glob("*.json"), reverse=True)[:20]:
        try:
            import json

            results.append(json.loads(f.read_text()))
        except Exception:
            pass
    return results
