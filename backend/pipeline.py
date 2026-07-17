from __future__ import annotations

import asyncio
import logging

from app.correlation.dbscan_clusterer import DBSCANClusterer
from app.correlation.embedder import Embedder
from app.correlation.reconciler import reconcile
from app.ingest.deduplicator import Deduplicator
from app.ingest.normalizer import Normalizer
from app.models.db import AlertORM, get_session
from app.models.schema import Alert, StatsPayload
from app.models.state import state
from app.rootcause.ranker import RootCauseRanker
from app.rootcause.topology import TopologyLoader
from app.summarize.summarizer import Summarizer

logger = logging.getLogger(__name__)


class Pipeline:
    """
    Composes all stages. Two entry points:

    - ingest(raw, source): per-alert path called for every incoming raw alert
    - tick():              background asyncio task, runs every TICK_INTERVAL seconds
    """

    TICK_INTERVAL = 2.0
    T_MAX_SECONDS = 300
    WS_FLUSH_INTERVAL = 0.1  # 100 ms
    WS_FLUSH_BATCH_SIZE = 50

    def __init__(self) -> None:
        self.normalizer = Normalizer()
        self.deduplicator = Deduplicator(t_max_seconds=self.T_MAX_SECONDS)
        self.embedder = Embedder()
        self.clusterer = DBSCANClusterer()
        self.ranker = RootCauseRanker()
        self.summarizer = Summarizer()
        self.topology = TopologyLoader()
        # Tracks current member sets so reconciler can compute diffs
        self._incident_members: dict[str, set[str]] = {}
        # Final member sets of resolved incidents — kept out of the reconcile
        # working set (resolved incidents can't be re-matched, and scanning
        # them every tick turns a long replay quadratic) but still served by
        # GET /incidents/{id} for drill-down.
        self._resolved_members: dict[str, set[str]] = {}
        self._broadcast_fn = None

    def set_broadcast(self, fn) -> None:
        self._broadcast_fn = fn

    def configure_scenario(self, scenario: str) -> None:
        """Load a scenario's topology AND its clustering config (if any) —
        eps/min_samples are density-tuned per scenario, not global (see
        TopologyLoader.clustering_overrides)."""
        self.topology.load(scenario)
        overrides = self.topology.clustering_overrides
        self.clusterer = DBSCANClusterer(**overrides) if overrides else DBSCANClusterer()

    async def broadcast(self, msg: dict) -> None:
        if self._broadcast_fn:
            await self._broadcast_fn(msg)

    # ── Per-alert ingest path ─────────────────────────────────────────────────

    async def ingest(self, raw: dict, source: str) -> None:
        try:
            alert = self.normalizer.process(raw, source)
            # Advance the event clock for EVERY occurrence — dup hits never
            # reach add_alert, but the active window must still slide.
            state.advance_event_clock(alert.ts)
            alert, is_dup = self.deduplicator.process(alert, state)

            if is_dup:
                await self.broadcast(
                    {
                        "type": "alert.dedup",
                        "alert_id": alert.id,
                        "dup_count": alert.dup_count,
                    }
                )
                return

            # Cache embedding (in-memory only — never written to DB)
            self.embedder.embed(alert.template, alert.template_id)

            # Stage for WS flush
            state.add_alert(alert)
            state.alert_batch_buffer.append(alert)

            # Async persist to SQLite (non-blocking)
            asyncio.create_task(self._persist_alert(alert))

        except Exception:
            logger.exception("Pipeline.ingest error")

    async def _persist_alert(self, alert: Alert) -> None:
        try:
            session = get_session()
            session.add(
                AlertORM(
                    id=alert.id,
                    ts=alert.ts,
                    received_at=alert.received_at,
                    source=alert.source,
                    host=alert.host,
                    service=alert.service,
                    severity=alert.severity,
                    message=alert.message,
                    template=alert.template,
                    template_id=alert.template_id,
                    dup_count=alert.dup_count,
                    cluster_id=alert.cluster_id,
                )
            )
            session.commit()
            session.close()
        except Exception:
            session.rollback()
            session.close()
            logger.debug("SQLite persist skip (dup) for alert %s", alert.id)

    # ── WS flush loop ─────────────────────────────────────────────────────────

    async def ws_flush_loop(self) -> None:
        """Background task: flush alert_batch_buffer every 100 ms or 50 alerts."""
        while True:
            await asyncio.sleep(self.WS_FLUSH_INTERVAL)
            if not state.alert_batch_buffer:
                continue
            batch = state.alert_batch_buffer[: self.WS_FLUSH_BATCH_SIZE]
            state.alert_batch_buffer = state.alert_batch_buffer[self.WS_FLUSH_BATCH_SIZE :]
            if batch:
                await self.broadcast(
                    {
                        "type": "alert.batch",
                        "alerts": [a.model_dump(mode="json") for a in batch],
                    }
                )

    # ── Tick loop ─────────────────────────────────────────────────────────────

    async def tick(self) -> None:
        """Background asyncio task — runs every TICK_INTERVAL seconds."""
        while True:
            await asyncio.sleep(self.TICK_INTERVAL)
            try:
                await self._run_tick()
            except Exception:
                logger.exception("Pipeline tick error")

    async def _run_tick(self) -> None:
        # 1. Evict expired dedup entries
        evicted = state.evict_expired_dedup()
        if evicted:
            logger.debug("Dedup: evicted %d expired entries", evicted)

        # 2. Get active window
        active_alerts = state.active_window(self.T_MAX_SECONDS)
        if not active_alerts:
            await self._push_stats()
            return

        # 3. Run DBSCAN on active window
        cluster_result = self.clusterer.cluster(active_alerts, self.embedder, self.topology.graph)

        # Mark noise alerts as unclustered
        for aid in cluster_result.noise:
            if aid in state.alert_index:
                state.alert_index[aid].cluster_id = None

        # 4. Reconcile with existing incidents. Pass the WINDOW's alert index
        # (not the full history): reconcile() resolves an incident when none
        # of its members intersect this index, which is exactly "all members
        # aged out of the active window" — with the full index that condition
        # could never fire and incidents accumulated as active forever.
        win_index = {a.id: a for a in active_alerts}
        rec = reconcile(
            old_incidents=state.incidents,
            old_members=self._incident_members,
            new_clusters=cluster_result.clusters,
            alert_index=win_index,
        )

        # 5. Handle created incidents
        for inc, member_ids in rec.created:
            state.incidents[inc.id] = inc
            self._incident_members[inc.id] = set(member_ids)
            for aid in member_ids:
                if aid in state.alert_index:
                    state.alert_index[aid].cluster_id = inc.id
            member_alerts = [
                state.alert_index[aid] for aid in member_ids if aid in state.alert_index
            ]
            inc.root_candidates = self.ranker.rank(member_alerts, self.topology)
            inc.sparkline = state.update_sparkline(inc.id, len(member_ids))
            await self.broadcast(
                {
                    "type": "incident.created",
                    "incident": inc.model_dump(mode="json"),
                    "member_alert_ids": list(member_ids),
                }
            )
            asyncio.create_task(self.run_summarizer(inc.id))

        # 6. Handle updated incidents
        for inc, diff in rec.updated:
            current_members = self._incident_members.get(inc.id, set())
            current_members = (current_members | set(diff.added_alert_ids)) - set(
                diff.removed_alert_ids
            )
            self._incident_members[inc.id] = current_members
            for aid in diff.added_alert_ids:
                if aid in state.alert_index:
                    state.alert_index[aid].cluster_id = inc.id
            member_alerts = [
                state.alert_index[aid] for aid in current_members if aid in state.alert_index
            ]
            inc.root_candidates = self.ranker.rank(member_alerts, self.topology)
            inc.sparkline = state.update_sparkline(inc.id, len(diff.added_alert_ids))
            if diff.added_alert_ids or diff.removed_alert_ids:
                await self.broadcast(
                    {
                        "type": "incident.updated",
                        "incident": inc.model_dump(mode="json"),
                        "added_alert_ids": diff.added_alert_ids,
                        "removed_alert_ids": diff.removed_alert_ids,
                    }
                )

        # 7. Handle resolved incidents — retire their member sets from the
        # reconcile working set (kept for drill-down in _resolved_members)
        for inc in rec.resolved:
            self._resolved_members[inc.id] = self._incident_members.pop(inc.id, set())
            await self.broadcast(
                {
                    "type": "incident.updated",
                    "incident": inc.model_dump(mode="json"),
                    "added_alert_ids": [],
                    "removed_alert_ids": [],
                }
            )

        # 8. Push stats
        await self._push_stats()

    async def _push_stats(self) -> None:
        payload = StatsPayload(
            total_alerts=state.total_alert_count,
            unique_alerts=state.unique_alert_count,
            active_incidents=state.active_incident_count,
            unclustered=state.unclustered_count,
            compression_ratio=round(state.compression_ratio, 6),
            alerts_per_sec=round(state.current_alerts_per_sec(), 1),
            replay=state.replay_status,
        )
        await self.broadcast({"type": "stats", **payload.model_dump(mode="json")})

    # ── Async summarizer task ─────────────────────────────────────────────────

    async def run_summarizer(self, incident_id: str) -> None:
        """Fired as a background task per new incident. Pushes incident.summary when done."""
        inc = state.incidents.get(incident_id)
        if not inc:
            return
        member_ids = self._incident_members.get(incident_id, set())
        alerts = [state.alert_index[aid] for aid in member_ids if aid in state.alert_index]

        topology_path: list[tuple[str, str]] = []
        if inc.root_candidates:
            topology_path = self.topology.propagation_path(
                inc.root_candidates[0].service, inc.services
            )

        result = await self.summarizer.summarize(inc, alerts, topology_path)
        inc.title = result.title
        inc.summary = result.summary
        inc.first_action = result.first_action

        await self.broadcast(
            {
                "type": "incident.summary",
                "incident_id": incident_id,
                "title": result.title,
                "summary": result.summary,
                "first_action": result.first_action,
                "generated_by": result.generated_by,
            }
        )


# Global singleton
pipeline = Pipeline()
