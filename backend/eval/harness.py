from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx

from app.correlation.dbscan_clusterer import DBSCANClusterer
from app.correlation.embedder import Embedder
from app.ingest.deduplicator import Deduplicator
from app.ingest.normalizer import Normalizer
from app.models.schema import Alert
from app.models.state import AppState
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
    Runs the full pipeline synchronously over a labeled dataset (no replay delays).
    Measures clustering quality only. Latency is measured by eval/bench.py.

    Ablation modes — each disables one signal to prove the layered design:
      None          — full system (baseline numbers)
      no_semantic   — w_s=0, redistribute to w_t + w_a
      no_topology   — empty graph (topology_bonus=0, topology_depth=0)
      no_temporal   — w_t=0, redistribute to w_s + w_a
      denstream     — use DenStream instead of DBSCAN (embedding-only distance)
      naive_dedup   — one cluster per unique template+service (strawman baseline)
    """

    ABLATION_DISTANCE_OVERRIDES: dict[str | None, dict] = {
        None:          {},
        "no_semantic": {"w_s": 0.0, "w_t": 0.45, "w_a": 0.55},
        "no_temporal": {"w_t": 0.0, "w_s": 0.57, "w_a": 0.43},
        "no_topology": {},   # handled via empty graph
        "denstream":   {},   # handled via DenStream path
        "naive_dedup": {},   # handled before clustering
    }

    def __init__(self, scenario: str = "db-cascade") -> None:
        self.normalizer = Normalizer()
        self.deduplicator = Deduplicator()
        self.embedder = Embedder()
        self.topology = TopologyLoader()
        self.topology.load(scenario)
        self.ranker = RootCauseRanker()

    def run(self, dataset: str, ablation: str | None = None) -> EvalResult:
        local_state = AppState()
        gt_loader = GroundTruthLoader()
        ground_truth = gt_loader.load(dataset)

        raw_alerts = list(gt_loader.load_raw_alerts(dataset))
        if not raw_alerts:
            logger.warning("Eval: no alerts found for dataset '%s'", dataset)

        logger.info("Eval: %d raw alerts | ablation=%s", len(raw_alerts), ablation)

        # ── Normalise + dedup ──────────────────────────────────────────────────
        canonical: list[Alert] = []
        for raw in raw_alerts:
            alert = self.normalizer.process(raw, source=f"eval:{dataset}")
            alert, is_dup = self.deduplicator.process(alert, local_state)
            if not is_dup:
                self.embedder.embed(alert.template, alert.template_id)
                canonical.append(alert)
                local_state.add_alert(alert)

        # ── Cluster ────────────────────────────────────────────────────────────
        overrides = self.ABLATION_DISTANCE_OVERRIDES.get(ablation, {})

        if ablation == "naive_dedup":
            predicted = self._naive_dedup_clusters(canonical)
        elif ablation == "denstream":
            predicted = self._denstream_clusters(canonical)
        else:
            graph = self.topology.graph
            if ablation == "no_topology":
                graph = nx.DiGraph()  # empty → topology_bonus=0, topology_depth=0
            clusterer = DBSCANClusterer()
            result = clusterer.cluster(canonical, self.embedder, graph, **overrides)
            predicted = dict(result.clusters)
            for aid in result.noise:
                predicted[f"noise-{aid}"] = {aid}

        # ── Root-cause ranking ─────────────────────────────────────────────────
        root_predictions: dict[str, str] = {}
        for ck, member_ids in predicted.items():
            members = [local_state.alert_index[aid] for aid in member_ids if aid in local_state.alert_index]
            if members:
                candidates = self.ranker.rank(members, self.topology, top_k=3)
                if candidates:
                    # Join top-3 for Hit@3 computation in metrics.hit_at_k
                    root_predictions[ck] = "|".join(c.alert_id for c in candidates)

        # ── Metrics ────────────────────────────────────────────────────────────
        incident_count = len([k for k in predicted if not k.startswith("noise-")])
        noise_count = len([k for k in predicted if k.startswith("noise-")])

        comp = compression_ratio(len(raw_alerts), incident_count, noise_count)
        pur = purity(predicted, ground_truth.cluster_labels)
        ari = adjusted_rand_index(predicted, ground_truth.cluster_labels)
        frag = fragmentation(predicted, ground_truth.cluster_labels)
        h1, h3, breakdown = hit_at_k(root_predictions, ground_truth.root_causes, predicted)

        sha = self._git_sha()
        eval_result = EvalResult(
            dataset=dataset,
            ablation=ablation,
            git_sha=sha,
            timestamp=datetime.now(timezone.utc).isoformat(),
            compression_ratio=round(comp, 4),
            cluster_purity=round(pur, 4),
            ari=round(ari, 4),
            fragmentation=round(frag, 4),
            hit_at_1=round(h1, 4),
            hit_at_3=round(h3, 4),
            hit_breakdown=breakdown,
        )

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        ablation_str = ablation or "full"
        fname = f"{dataset}_{ablation_str}_{sha}.json"
        (RESULTS_DIR / fname).write_text(json.dumps(asdict(eval_result), indent=2))
        logger.info("Eval results → %s", fname)

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
            return subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                stderr=subprocess.DEVNULL,
            ).decode().strip()
        except Exception:
            return "unknown"


# ── CLI entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="StormLens eval harness")
    parser.add_argument("--dataset", default="aiops-scn1")
    parser.add_argument(
        "--ablation",
        choices=["no_semantic", "no_topology", "no_temporal", "denstream", "naive_dedup"],
        default=None,
    )
    parser.add_argument("--scenario", default="db-cascade")
    args = parser.parse_args()

    harness = EvalHarness(scenario=args.scenario)
    result = harness.run(dataset=args.dataset, ablation=args.ablation)
    print(f"\nResults ({args.ablation or 'full'}):")
    print(f"  Compression ratio : {result.compression_ratio:.2%}")
    print(f"  Cluster purity    : {result.cluster_purity:.4f}")
    print(f"  ARI               : {result.ari:.4f}")
    print(f"  Fragmentation     : {result.fragmentation:.2f}")
    print(f"  Hit@1             : {result.hit_at_1:.2%}")
    print(f"  Hit@3             : {result.hit_at_3:.2%}")
