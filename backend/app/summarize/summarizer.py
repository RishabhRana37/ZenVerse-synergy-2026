from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.models.schema import Alert, Incident

logger = logging.getLogger(__name__)


@dataclass
class SummaryResult:
    title: str
    summary: str
    first_action: str
    generated_by: str  # "llm" | "template"


class Summarizer:
    """
    Async LLM summarizer with hard 8-second timeout and deterministic template fallback.

    The template fallback ALWAYS works offline — it is the default for Round 1.
    The LLM path is optional and activated only if credentials are provided.

    Hard timeout: if the LLM does not respond within TIMEOUT_S, the template
    fallback fires and the incident card is updated immediately. Demo never hangs.
    """

    TIMEOUT_S = 8.0

    def __init__(
        self,
        llm_base_url: str | None = None,
        llm_api_key: str | None = None,
        llm_model: str = "gpt-4o-mini",
    ) -> None:
        self._llm_available = False
        self._client = None
        self._model = llm_model

        if llm_base_url or llm_api_key:
            try:
                import openai

                self._client = openai.AsyncOpenAI(
                    base_url=llm_base_url,
                    api_key=llm_api_key or "no-key",
                )
                self._llm_available = True
                logger.info("Summarizer: LLM client configured (model=%s)", llm_model)
            except ImportError:
                logger.warning("openai package not installed — template fallback only")

    async def summarize(
        self,
        incident: Incident,
        alerts: list[Alert],
        topology_path: list[tuple[str, str]],
    ) -> SummaryResult:
        """
        Returns a SummaryResult within TIMEOUT_S.
        If LLM fails or times out, the template fallback fires automatically.
        """
        if self._llm_available and self._client:
            try:
                return await asyncio.wait_for(
                    self._llm_summarize(incident, alerts, topology_path),
                    timeout=self.TIMEOUT_S,
                )
            except TimeoutError:
                logger.warning(
                    "Summarizer: LLM timeout after %.1fs — using template fallback",
                    self.TIMEOUT_S,
                )
            except Exception as exc:
                logger.warning("Summarizer: LLM error (%s) — using template fallback", exc)

        return self._template_fallback(incident, alerts)

    # ── LLM path ──────────────────────────────────────────────────────────────

    async def _llm_summarize(
        self,
        incident: Incident,
        alerts: list[Alert],
        topology_path: list[tuple[str, str]],
    ) -> SummaryResult:
        top = incident.root_candidates[0] if incident.root_candidates else None
        rep_templates = list({a.template for a in alerts})[:5]
        path_str = (
            " → ".join(f"{u}→{v}" for u, v in topology_path)
            if topology_path
            else "unknown propagation path"
        )

        prompt = (
            "You are an SRE incident analyst. Respond with JSON only.\n\n"
            f"Incident:\n"
            f"- Services affected: {', '.join(incident.services)}\n"
            f"- Alert count: {incident.alert_count} ({incident.unique_count} unique)\n"
            f"- Top root cause: {top.template if top else 'unknown'} "
            f"in {top.service if top else 'unknown'} "
            f"(confidence {top.confidence:.0%})\n"
            f"- Propagation path: {path_str}\n"
            f"- Representative alert templates:\n"
            + "\n".join(f"  - {t}" for t in rep_templates)
            + '\n\nReturn JSON: {"title": "...", "summary": "...", "first_action": "..."}'
        )

        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        import json

        data = json.loads(response.choices[0].message.content)
        return SummaryResult(
            title=data["title"],
            summary=data["summary"],
            first_action=data["first_action"],
            generated_by="llm",
        )

    # ── Template fallback (always offline-safe) ────────────────────────────────

    def _template_fallback(self, incident: Incident, alerts: list[Alert]) -> SummaryResult:
        top = incident.root_candidates[0] if incident.root_candidates else None
        services_str = ", ".join(incident.services) if incident.services else "unknown services"
        span = 0
        if alerts:
            ts_sorted = sorted(alerts, key=lambda a: a.ts)
            span = int((ts_sorted[-1].ts - ts_sorted[0].ts).total_seconds())

        if top:
            title = f"{top.service} failure affecting {len(incident.services)} services"
            summary = (
                f"{top.service} failure caused cascading alerts across {services_str}. "
                f"{incident.alert_count} alerts ({incident.unique_count} unique) over {span}s. "
                f"Top root candidate: '{top.template}' (confidence {top.confidence:.0%})."
            )
            first_action = f"Check {top.service} health, disk, and failover status."
        else:
            title = f"Incident affecting {len(incident.services)} services"
            summary = (
                f"Correlated incident across {services_str}. "
                f"{incident.alert_count} alerts ({incident.unique_count} unique) over {span}s."
            )
            first_action = "Investigate affected services for root cause."

        return SummaryResult(
            title=title,
            summary=summary,
            first_action=first_action,
            generated_by="template",
        )
