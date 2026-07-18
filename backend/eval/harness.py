from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import networkx as nx

from app.correlation.dbscan_clusterer import DBSCANClusterer
from app.correlation.embedder import Embedder
from app.correlation.reconciler import reconcile
from app.ingest.deduplicator import Deduplicator
from app.ingest.normalizer import Normalizer
from app.models.schema import Alert, Incident
from app.rootcause.ranker import RootCauseRanker
from app.rootcause.topology import TopologyLoader
from eval.ground_truth import GroundTruthLoader
from eval.metrics import adjusted_rand_index, compression_ratio, fragmentation, hit_at_k, purity

logger = logging.getLogger(__name__)

RESULTS_DIR = Path(__file__).parent / "results"


@dataclass
class EvalResult:
    dataset: str
    ablation: str | None
    git_sha: str
    timestamp: str
    compression_ratio: float
    cluster_purity: float
    ari: float
    fragmentation: float
    hit_at_1: float
    hit_at_3: float
    hit_breakdown: dict = field(default_factory=dict)
    # Latency is measured by eval/bench.py only (streaming mode)
    latency_p50_ms: float | None = None
    latency_p95_ms: float | None = None


class EvalHarness:
    """
    Replays a labeled dataset through the production pipeline semantics on a
    virtual clock (no wall-clock delays):

      normalize -> event-time fingerprint dedup (300 s TTL, as production)
      -> windowed DBSCAN every TICK_S of virtual time over the active
         WINDOW_S window -> reconcile() for stable incident identity
      -> suppressed duplicates re-expanded into their incident for scoring.

    This mirrors pipeline.py's tick loop; a single whole-dataset DBSCAN batch
    would merge identical templates from unrelated faults hours apart (d_time
    saturates at WINDOW_S) and dedup entire days into one alert — both
    divergences from what the live system actually does.

    Ablation modes — each disables one signal to prove the layered design:
      None                  — full system (baseline numbers)
      no_semantic           — w_s=0, redistribute to w_t + w_a
      no_topology           — empty graph for clustering AND ranking
      no_temporal           — w_t=0, redistribute to w_s + w_a
      denstream             — use DenStream instead of DBSCAN (embedding-only distance)
      naive_dedup           — one cluster per unique template+service (strawman baseline)
      topology_gated_1hop   — hard graph-radius pre-filter (direct dependency only):
                               candidates outside the radius can NEVER be density-
                               reachable, vs. the default's soft capped bonus inside
                               a blended distance. Tests the topology-first design
                               used by Moogsoft/BigPanda-style correlation, per
                               external review — see distance.py's topology_gate_hops.
      topology_gated_2hop   — same, 2-hop radius (matches topology_bonus's reach)
    """

    TICK_S = 30  # virtual-clock reconcile interval (prod ticks 2 s wall)
    WINDOW_S = 300  # active window — must match Pipeline.T_MAX_SECONDS

    ABLATION_DISTANCE_OVERRIDES: dict[str | None, dict] = {
        None: {},
        "no_semantic": {"w_s": 0.0, "w_t": 0.45, "w_a": 0.55},
        "no_temporal": {"w_t": 0.0, "w_s": 0.57, "w_a": 0.43},
        "no_topology": {},  # handled via empty graph
        "denstream": {},  # handled via DenStream path
        "naive_dedup": {},  # handled before clustering
        "topology_gated_1hop": {"topology_gate_hops": 1},
        "topology_gated_2hop": {"topology_gate_hops": 2},
    }

    def __init__(
        self,
        scenario: str = "aiops",
        eps: float | None = None,
        min_samples: int | None = None,
        distance_overrides: dict | None = None,
    ) -> None:
        self.normalizer = Normalizer()
        self.deduplicator = Deduplicator()
        self.embedder = Embedder()
        self.topology = TopologyLoader()
        self.topology.load(scenario)
        self.ranker = RootCauseRanker()
        # None -> the scenario's own clustering: block if it declares one
        # (see data/scenarios/db-cascade.yaml), else DBSCANClusterer's default.
        scenario_overrides = self.topology.clustering_overrides
        default = DBSCANClusterer()
        self.eps = eps if eps is not None else scenario_overrides.get("eps", default.eps)
        self.min_samples = (
            min_samples
            if min_samples is not None
            else scenario_overrides.get("min_samples", default.min_samples)
        )
        self.distance_overrides = distance_overrides or {}

        self._prepared_dataset: str | None = None
        self.ground_truth = None
        self.raw_count = 0
        self.canonical: list[Alert] = []
        self.dup_of: dict[str, str] = {}  # swallowed raw id -> canonical id
        self.alert_index: dict[str, Alert] = {}

    # ── Data preparation (config-independent, cached per dataset) ─────────────

    def prepare(self, dataset: str) -> None:
        if self._prepared_dataset == dataset:
            return
        gt_loader = GroundTruthLoader()
        self.ground_truth = gt_loader.load(dataset)

        raw_alerts = list(gt_loader.load_raw_alerts(dataset))
        if not raw_alerts:
            logger.warning("Eval: no alerts found for dataset '%s'", dataset)
        self.raw_count = len(raw_alerts)

        normalized = [self.normalizer.process(r, source=f"eval:{dataset}") for r in raw_alerts]
        normalized.sort(key=lambda a: a.ts)

        # Event-time dedup: TTL measured from the canonical's first occurrence,
        # exactly like production's expires_at (set once, not refreshed on hits).
        ttl_s = self.deduplicator.ttl.total_seconds()
        canonical: list[Alert] = []
        dup_of: dict[str, str] = {}
        first_seen: dict[str, tuple[str, datetime]] = {}  # fp -> (canonical id, first ts)
        for alert in normalized:
            fp = self.deduplicator.fingerprint(alert)
            hit = first_seen.get(fp)
            if hit is not None and (alert.ts - hit[1]).total_seconds() <= ttl_s:
                dup_of[alert.id] = hit[0]
                continue
            first_seen[fp] = (alert.id, alert.ts)
            canonical.append(alert)

        self.canonical = canonical
        self.dup_of = dup_of
        self.alert_index = {a.id: a for a in canonical}
        self.embedder.embed_batch([(a.template, a.template_id) for a in canonical])
        self._prepared_dataset = dataset
        logger.info(
            "Eval: %d raw -> %d canonical alerts (%d suppressed duplicates)",
            self.raw_count,
            len(canonical),
            len(dup_of),
        )

    # ── Windowed replay clustering (mirrors pipeline.py tick loop) ────────────

    def _windowed_clusters(self, graph: nx.DiGraph, **overrides) -> dict[str, set[str]]:
        clusterer = DBSCANClusterer(eps=self.eps, min_samples=self.min_samples)
        incidents: dict[str, Incident] = {}
        members: dict[str, set[str]] = {}
        resolved_members: dict[str, set[str]] = {}

        alerts = self.canonical
        if not alerts:
            return {}

        tick = timedelta(seconds=self.TICK_S)
        window_span = timedelta(seconds=self.WINDOW_S)
        t = alerts[0].ts + tick
        end = alerts[-1].ts + tick
        lo = hi = 0
        prev_bounds: tuple[int, int] | None = None

        while t <= end:
            while hi < len(alerts) and alerts[hi].ts <= t:
                hi += 1
            while lo < hi and alerts[lo].ts < t - window_span:
                lo += 1
            bounds = (lo, hi)
            t += tick
            if lo == hi or bounds == prev_bounds:
                continue  # empty or unchanged window — nothing to recluster
            prev_bounds = bounds

            window = alerts[lo:hi]
            result = clusterer.cluster(window, self.embedder, graph, **overrides)
            win_index = {a.id: a for a in window}
            rec = reconcile(incidents, members, result.clusters, win_index)

            for inc, member_ids in rec.created:
                incidents[inc.id] = inc
                members[inc.id] = set(member_ids)
            for inc, diff in rec.updated:
                current = members.get(inc.id, set())
                members[inc.id] = (current | set(diff.added_alert_ids)) - set(
                    diff.removed_alert_ids
                )
            # Resolved incidents can never be reconciled again (reconcile()
            # only matches active ones) — keep their final member set for the
            # result, but drop them from the live working set. Over a
            # multi-day replay, thousands of short-lived incidents
            # accumulate; reconcile()'s overlap scan is O(len(old_members))
            # per tick, so leaving dead entries in there turns the whole
            # replay quadratic in tick count.
            for inc in rec.resolved:
                resolved_members[inc.id] = members.pop(inc.id, set())
                incidents.pop(inc.id, None)

        predicted = {iid: set(m) for iid, m in {**members, **resolved_members}.items() if m}
        clustered: set[str] = set().union(*predicted.values()) if predicted else set()
        for alert in alerts:
            if alert.id not in clustered:
                predicted[f"noise-{alert.id}"] = {alert.id}
        return predicted

    # ── Prediction + scoring ──────────────────────────────────────────────────

    def cluster_and_predict(
        self, ablation: str | None = None
    ) -> tuple[dict[str, set[str]], dict[str, str]]:
        overrides = {
            **self.ABLATION_DISTANCE_OVERRIDES.get(ablation, {}),
            **({} if ablation else self.distance_overrides),
        }

        if ablation == "naive_dedup":
            predicted = self._naive_dedup_clusters(self.canonical)
        elif ablation == "denstream":
            predicted = self._denstream_clusters(self.canonical)
        else:
            graph = self.topology.graph if ablation != "no_topology" else nx.DiGraph()
            predicted = self._windowed_clusters(graph, **overrides)

        # Suppressed duplicates belong to their canonical's incident (the UI
        # shows them as the xN badge) — scoring must count them the same way.
        alert_to_ck = {aid: ck for ck, ms in predicted.items() for aid in ms}
        for dup_id, canon_id in self.dup_of.items():
            ck = alert_to_ck.get(canon_id)
            if ck:
                predicted[ck].add(dup_id)
            else:
                predicted[f"noise-{dup_id}"] = {dup_id}

        ranking_topology = self.topology if ablation != "no_topology" else TopologyLoader()
        root_predictions: dict[str, str] = {}
        for ck, member_ids in predicted.items():
            member_alerts = [self.alert_index[aid] for aid in member_ids if aid in self.alert_index]
            if member_alerts:
                candidates = self.ranker.rank(member_alerts, ranking_topology, top_k=3)
                if candidates:
                    root_predictions[ck] = "|".join(c.alert_id for c in candidates)
        return predicted, root_predictions

    def score(
        self,
        predicted: dict[str, set[str]],
        root_predictions: dict[str, str],
        gt_labels: dict[str, str],
        gt_roots: dict[str, str],
    ) -> dict:
        # A GT root swallowed by dedup is represented by its canonical alert
        gt_roots_c = {label: self.dup_of.get(rid, rid) for label, rid in gt_roots.items()}

        incident_count = len([k for k in predicted if not k.startswith("noise-")])
        noise_count = len(predicted) - incident_count
        h1, h3, breakdown = hit_at_k(root_predictions, gt_roots_c, predicted)
        return {
            "compression_ratio": compression_ratio(self.raw_count, incident_count, noise_count),
            "cluster_purity": purity(predicted, gt_labels),
            "ari": adjusted_rand_index(predicted, gt_labels),
            "fragmentation": fragmentation(predicted, gt_labels),
            "hit_at_1": h1,
            "hit_at_3": h3,
            "hit_breakdown": breakdown,
        }

    def run(self, dataset: str, ablation: str | None = None) -> EvalResult:
        self.prepare(dataset)
        predicted, root_predictions = self.cluster_and_predict(ablation)
        gt = self.ground_truth
        metrics = self.score(predicted, root_predictions, gt.cluster_labels, gt.root_causes)

        sha = self._git_sha()
        eval_result = EvalResult(
            dataset=dataset,
            ablation=ablation,
            git_sha=sha,
            timestamp=datetime.now(UTC).isoformat(),
            compression_ratio=round(metrics["compression_ratio"], 4),
            cluster_purity=round(metrics["cluster_purity"], 4),
            ari=round(metrics["ari"], 4),
            fragmentation=round(metrics["fragmentation"], 4),
            hit_at_1=round(metrics["hit_at_1"], 4),
            hit_at_3=round(metrics["hit_at_3"], 4),
            hit_breakdown=metrics["hit_breakdown"],
        )

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        ablation_str = ablation or "full"
        fname = f"{dataset}_{ablation_str}_{sha}.json"
        (RESULTS_DIR / fname).write_text(json.dumps(asdict(eval_result), indent=2))
        logger.info("Eval results -> %s", fname)

        return eval_result

    # ── Ablation helpers ───────────────────────────────────────────────────────

    def _naive_dedup_clusters(self, alerts: list[Alert]) -> dict[str, set[str]]:
        """Strawman: one cluster per unique (template_id, service) pair."""
        clusters: dict[str, set[str]] = {}
        for a in alerts:
            key = f"naive-{a.template_id}-{a.service or ''}"
            clusters.setdefault(key, set()).add(a.id)
        return clusters

    def _denstream_clusters(self, alerts: list[Alert]) -> dict[str, set[str]]:
        from app.correlation.denstream_clusterer import DenStreamClusterer

        ds = DenStreamClusterer()
        for a in alerts:
            emb = self.embedder.embed(a.template, a.template_id)
            ds.partial_fit(a, emb)
        result = ds.get_clusters(alerts, self.embedder)
        clusters = dict(result.clusters)
        for aid in result.noise:
            clusters[f"ds-noise-{aid}"] = {aid}
        return clusters

    @staticmethod
    def _git_sha() -> str:
        try:
            return (
                subprocess.check_output(
                    ["git", "rev-parse", "--short", "HEAD"],
                    stderr=subprocess.DEVNULL,
                )
                .decode()
                .strip()
            )
        except Exception:
            return "unknown"


# ── CLI entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="StormLens eval harness")
    parser.add_argument("--dataset", default="aiops-scn1")
    parser.add_argument(
        "--ablation",
        choices=[
            "no_semantic",
            "no_topology",
            "no_temporal",
            "denstream",
            "naive_dedup",
            "topology_gated_1hop",
            "topology_gated_2hop",
        ],
        default=None,
    )
    parser.add_argument(
        "--scenario", default="aiops", help="topology scenario (data/scenarios/<name>.yaml)"
    )
    parser.add_argument(
        "--eps", type=float, default=None, help="override the scenario's clustering.eps"
    )
    parser.add_argument("--min-samples", type=int, default=None)
    args = parser.parse_args()

    harness = EvalHarness(scenario=args.scenario, eps=args.eps, min_samples=args.min_samples)
    result = harness.run(dataset=args.dataset, ablation=args.ablation)
    print(f"\nResults ({args.ablation or 'full'}):")
    print(f"  Compression ratio : {result.compression_ratio:.2%}")
    print(f"  Cluster purity    : {result.cluster_purity:.4f}")
    print(f"  ARI               : {result.ari:.4f}")
    print(f"  Fragmentation     : {result.fragmentation:.2f}")
    print(f"  Hit@1             : {result.hit_at_1:.2%}")
    print(f"  Hit@3             : {result.hit_at_3:.2%}")
