from __future__ import annotations

import logging
from dataclasses import dataclass, field

import networkx as nx
import numpy as np
from sklearn.cluster import DBSCAN

from app.correlation.distance import build_distance_matrix
from app.correlation.embedder import Embedder
from app.models.schema import Alert

logger = logging.getLogger(__name__)


@dataclass
class ClusterResult:
    """Output of a single DBSCAN run."""
    clusters: dict[str, set[str]] = field(default_factory=dict)  # label → {alert_ids}
    noise: set[str] = field(default_factory=set)                  # unclustered alert_ids


class DBSCANClusterer:
    """
    PRIMARY clusterer.

    Uses sklearn DBSCAN with metric="precomputed", which accepts our full
    combined distance matrix (temporal + semantic + attribute).

    River DenStream is NOT used here — it cannot accept precomputed distances
    and would require discarding the temporal and attribute signals.
    DenStream is implemented separately as an ablation-only path in denstream_clusterer.py.
    """

    def __init__(self, eps: float = 0.35, min_samples: int = 3) -> None:
        self.eps = eps
        self.min_samples = min_samples

    def cluster(
        self,
        alerts: list[Alert],
        embedder: Embedder,
        graph: nx.DiGraph,
        **distance_kwargs,
    ) -> ClusterResult:
        """
        Run DBSCAN on the active alert window.
        Returns ClusterResult with stable cluster labels (cluster-0, cluster-1, …)
        that will be reconciled to incident IDs by the Reconciler.
        """
        if not alerts:
            return ClusterResult()

        if len(alerts) < self.min_samples:
            # Not enough points to form any cluster — all noise
            return ClusterResult(noise={a.id for a in alerts})

        # Build embedding dict for all unique templates in this window
        template_pairs = list({(a.template, a.template_id) for a in alerts})
        embeddings = embedder.embed_batch(template_pairs)

        # Build N×N symmetric precomputed distance matrix
        matrix = build_distance_matrix(alerts, embeddings, graph, **distance_kwargs)

        # Run DBSCAN
        labels = DBSCAN(
            eps=self.eps,
            min_samples=self.min_samples,
            metric="precomputed",
            n_jobs=-1,
        ).fit_predict(matrix)

        result = ClusterResult()
        for alert, label in zip(alerts, labels):
            if label == -1:
                result.noise.add(alert.id)
            else:
                cluster_key = f"cluster-{label}"
                result.clusters.setdefault(cluster_key, set()).add(alert.id)

        logger.debug(
            "DBSCAN: %d alerts → %d clusters, %d noise",
            len(alerts), len(result.clusters), len(result.noise),
        )
        return result
