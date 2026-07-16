from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from app.summarize.summarizer import Summarizer
from app.models.schema import Alert, Incident, RootCandidate


def _make_incident() -> Incident:
    return Incident(
        id="inc-001",
        services=["postgres-primary", "order-svc"],
        alert_count=15,
        unique_count=6,
        root_candidates=[
            RootCandidate(
                alert_id="a-1",
                service="postgres-primary",
                template="disk full on <HOST>",
                score=0.8,
                confidence=0.72,
            )
        ],
    )


def _make_alerts() -> list[Alert]:
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    return [
        Alert(
            ts=base,
            source="test",
            message=f"msg {i}",
            template="disk full on <HOST>",
            template_id="t-001",
            service="postgres-primary",
            severity="critical",
        )
        for i in range(3)
    ]


@pytest.mark.asyncio
async def test_template_fallback_when_no_llm() -> None:
    """With no LLM configured, should immediately return template-generated summary."""
    summarizer = Summarizer()  # no LLM credentials
    result = await summarizer.summarize(_make_incident(), _make_alerts(), [])
    assert result.generated_by == "template"
    assert "postgres-primary" in result.title
    assert len(result.summary) > 10
    assert len(result.first_action) > 5


@pytest.mark.asyncio
async def test_llm_timeout_fires_template_fallback() -> None:
    """
    When LLM is 'configured' but hangs, the 8 s timeout should fire
    and the template fallback should return immediately.
    """
    import asyncio

    async def _fake_llm_call(*args, **kwargs):
        await asyncio.sleep(999)  # simulate hung LLM

    summarizer = Summarizer.__new__(Summarizer)
    summarizer.TIMEOUT_S = 0.1  # short for test speed
    summarizer._llm_available = True
    summarizer._client = True   # truthy to trigger the LLM branch
    summarizer._model = "fake"
    summarizer._llm_summarize = _fake_llm_call  # type: ignore

    result = await summarizer.summarize(_make_incident(), _make_alerts(), [])
    assert result.generated_by == "template"


@pytest.mark.asyncio
async def test_template_fallback_with_no_root_candidates() -> None:
    """Should gracefully handle incidents with no root candidates."""
    summarizer = Summarizer()
    inc = Incident(
        id="inc-002",
        services=["mystery-svc"],
        alert_count=3,
        unique_count=3,
        root_candidates=[],
    )
    result = await summarizer.summarize(inc, _make_alerts(), [])
    assert result.generated_by == "template"
    assert result.title  # not empty
    assert result.first_action  # not empty
