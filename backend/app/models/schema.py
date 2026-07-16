from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["critical", "warning", "info"]
IncidentStatus = Literal["active", "resolved"]


class Alert(BaseModel):
    """Canonical alert — the shape every ingest source normalizes into."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ts: datetime
    received_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source: str
    host: str | None = None
    service: str | None = None
    severity: Severity = "info"
    message: str
    template: str
    template_id: str
    dup_count: int = 1
    cluster_id: str | None = None


class RootCandidate(BaseModel):
    alert_id: str
    service: str
    template: str
    score: float
    confidence: float


class Incident(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    resolved_at: datetime | None = None
    status: IncidentStatus = "active"
    acknowledged: bool = False
    title: str = ""
    alert_count: int = 0
    unique_count: int = 0
    services: list[str] = Field(default_factory=list)
    root_candidates: list[RootCandidate] = Field(default_factory=list)
    sparkline: list[int] = Field(default_factory=list)
    summary: str | None = None
    first_action: str | None = None


class ReplayStatus(BaseModel):
    running: bool = False
    dataset: str | None = None
    scenario: str | None = None
    speed: float = 1.0
    progress: float = 0.0


class StatsPayload(BaseModel):
    total_alerts: int
    unique_alerts: int
    active_incidents: int
    unclustered: int
    compression_ratio: float
    alerts_per_sec: float
    replay: ReplayStatus


class TopologyNode(BaseModel):
    id: str


class TopologyEdge(BaseModel):
    source: str
    target: str
