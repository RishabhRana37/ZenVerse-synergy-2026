from __future__ import annotations

import os
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import rest
from app.models.schema import Alert, Incident, ReplayStatus
from app.models.state import AppState

# Create a test app using the router
app = FastAPI()
app.include_router(rest.router)
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_mocks() -> None:
    # Clear and set up mocks on rest module globals before each test
    rest._pipeline = MagicMock()
    rest._pipeline._lock = AsyncMock()  # Async lock support
    rest._pipeline._incident_members = {}
    rest._pipeline._resolved_members = {}
    rest._pipeline.ingest = AsyncMock()
    rest._pipeline.configure_scenario = MagicMock()

    rest._replay_engine = MagicMock()
    rest._replay_engine.start = AsyncMock()
    rest._replay_engine.stop = AsyncMock()
    rest._replay_engine.reset = AsyncMock()

    rest._topology_loader = MagicMock()
    rest._topology_loader.nodes_list = MagicMock(return_value=[])
    rest._topology_loader.edges_list = MagicMock(return_value=[])
    rest._topology_loader.propagation_path = MagicMock(return_value=[])

    # Reset the global state object
    rest.state.reset()


def test_ingest_alerts_single() -> None:
    response = client.post("/alerts", json={"message": "test alert"})
    assert response.status_code == 202
    assert response.json() == {"accepted": 1}
    rest._pipeline.ingest.assert_awaited_once_with({"message": "test alert"}, source="webhook")


def test_ingest_alerts_batch() -> None:
    alerts = [{"message": "alert 1"}, {"message": "alert 2"}]
    response = client.post("/alerts", json=alerts)
    assert response.status_code == 202
    assert response.json() == {"accepted": 2}
    assert rest._pipeline.ingest.await_count == 2


def test_replay_start() -> None:
    req_body = {"dataset": "test-set", "speed": 2.0, "scenario": "test-scn"}
    response = client.post("/replay/start", json=req_body)
    assert response.status_code == 200
    assert response.json() == {
        "status": "started",
        "dataset": "test-set",
        "speed": 2.0,
        "scenario": "test-scn",
    }
    rest._pipeline.configure_scenario.assert_called_once_with("test-scn")
    rest._replay_engine.start.assert_awaited_once_with(
        dataset="test-set",
        speed=2.0,
        scenario="test-scn",
        pipeline_ingest_fn=rest._pipeline.ingest,
    )


def test_replay_stop() -> None:
    response = client.post("/replay/stop")
    assert response.status_code == 200
    assert response.json() == {"status": "stopped"}
    rest._replay_engine.stop.assert_awaited_once()


def test_replay_reset() -> None:
    response = client.post("/replay/reset")
    assert response.status_code == 200
    assert response.json() == {"status": "reset"}
    rest._replay_engine.reset.assert_awaited_once()
    assert len(rest._pipeline._incident_members) == 0
    assert len(rest._pipeline._resolved_members) == 0


def test_list_incidents() -> None:
    inc = Incident(
        id="inc-1",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        unique_count=1,
        alert_count=1,
        services=["svc-1"],
        title="incident 1",
    )
    rest.state.incidents["inc-1"] = inc

    response = client.get("/incidents")
    assert response.status_code == 200
    res_list = response.json()
    assert len(res_list) == 1
    assert res_list[0]["id"] == "inc-1"


def test_get_incident_not_found() -> None:
    response = client.get("/incidents/non-existent")
    assert response.status_code == 404
    assert response.json()["detail"] == "Incident not found"


def test_get_incident_success() -> None:
    inc = Incident(
        id="inc-1",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        unique_count=1,
        alert_count=1,
        services=["svc-1"],
        title="incident 1",
    )
    rest.state.incidents["inc-1"] = inc

    alert = Alert(
        id="a1",
        ts=datetime.now(UTC),
        source="test",
        message="msg",
        template="tmpl",
        template_id="t1",
        host="h1",
        service="svc-1",
        severity="info",
    )
    rest.state.alert_index["a1"] = alert
    rest._pipeline._incident_members["inc-1"] = {"a1"}

    response = client.get("/incidents/inc-1")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "inc-1"
    assert len(data["members"]) == 1
    assert data["members"][0]["id"] == "a1"


@patch("app.api.ws.broadcast", new_callable=AsyncMock)
def test_acknowledge_incident(mock_broadcast: AsyncMock) -> None:
    inc = Incident(
        id="inc-1",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        unique_count=1,
        alert_count=1,
        services=["svc-1"],
        title="incident 1",
    )
    rest.state.incidents["inc-1"] = inc

    response = client.post("/incidents/inc-1/acknowledge")
    assert response.status_code == 200
    assert response.json() == {"status": "acknowledged", "incident_id": "inc-1"}
    assert inc.acknowledged is True
    mock_broadcast.assert_awaited_once()


@patch("app.api.ws.broadcast", new_callable=AsyncMock)
def test_resolve_incident(mock_broadcast: AsyncMock) -> None:
    inc = Incident(
        id="inc-1",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        unique_count=1,
        alert_count=1,
        services=["svc-1"],
        title="incident 1",
    )
    rest.state.incidents["inc-1"] = inc

    response = client.post("/incidents/inc-1/resolve")
    assert response.status_code == 200
    assert response.json() == {"status": "resolved", "incident_id": "inc-1"}
    assert inc.status == "resolved"
    mock_broadcast.assert_awaited_once()


def test_get_topology() -> None:
    response = client.get("/topology")
    assert response.status_code == 200
    assert response.json() == {"nodes": [], "edges": []}


def test_list_alerts() -> None:
    alert1 = Alert(
        id="a1",
        ts=datetime(2026, 7, 18, 12, 0, 0, tzinfo=UTC),
        source="test",
        message="msg",
        template="tmpl",
        template_id="t1",
        host="h1",
        service="s1",
        severity="info",
    )
    alert2 = Alert(
        id="a2",
        ts=datetime(2026, 7, 18, 12, 5, 0, tzinfo=UTC),
        source="test",
        message="msg",
        template="tmpl",
        template_id="t1",
        host="h1",
        service="s1",
        severity="info",
    )
    rest.state.alert_index["a1"] = alert1
    rest.state.alert_index["a2"] = alert2

    response = client.get("/alerts?limit=1&offset=0")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    # Sorted by ts desc: a2 is newer
    assert data[0]["id"] == "a2"


def test_eval_results_empty() -> None:
    # Test when the results directory does not exist or has no files
    with patch("pathlib.Path.exists", return_value=False):
        response = client.get("/eval/results")
        assert response.status_code == 200
        assert response.json() == {
            "generated_at": None,
            "dataset": "",
            "scenarios": [],
            "targets": {
                "compression_ratio": 0.95,
                "purity": 0.80,
                "hit_at_1": 0.60,
                "hit_at_3": 0.85,
                "latency_p95_ms": 5000,
            },
        }
