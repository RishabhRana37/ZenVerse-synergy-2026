"""
DenStream clusterer — ABLATION ONLY. Do NOT use as primary.

River DenStream does not support precomputed distance matrices.
This module feeds only the embedding vector (no temporal or attribute signals).
It is run by eval/harness.py to compare against DBSCAN and quantify the
value of the full 3-signal distance function.
"""

from __future__ import annotations

import logging

import numpy as np

from app.correlation.dbscan_clusterer import ClusterResult
from app.correlation.embedder import Embedder
from app.models.schema import Alert

logger = logging.getLogger(__name__)


class DenStreamClusterer:
    """Ablation-only streaming clusterer (embedding features only)."""

    def __init__(
        self,
        decaying_factor: float = 0.25,
        beta: float = 0.75,
        mu: float = 2.0,
        epsilon: float = 0.5,
    ) -> None:
        self._model = None
        try:
            from river.cluster import DenStream

            self._model = DenStream(
                decaying_factor=decaying_factor,
                beta=beta,
                mu=mu,
                epsilon=epsilon,
            )
            logger.info("DenStream ablation clusterer initialised")
        except ImportError:
            logger.warning("river not installed — DenStream ablation disabled")

    def partial_fit(self, alert: Alert, embedding: np.ndarray) -> None:
        """Incrementally update DenStream with one alert's embedding."""
        if self._model is None:
            return
        x = {f"f{i}": float(v) for i, v in enumerate(embedding)}
        try:
            self._model.learn_one(x)
        except Exception as exc:
            logger.debug("DenStream learn_one error: %s", exc)

    def get_clusters(self, alerts: list[Alert], embedder: Embedder) -> ClusterResult:
        """Assign current DenStream labels to all alerts in the window."""
        if self._model is None:
            return ClusterResult(noise={a.id for a in alerts})

        result = ClusterResult()
        for alert in alerts:
            emb = embedder.embed(alert.template, alert.template_id)
            x = {f"f{i}": float(v) for i, v in enumerate(emb)}
            try:
                label = self._model.predict_one(x)
            except Exception:
                logger.debug("DenStream predict_one error", exc_info=True)
                label = None

            if label is None or label == -1:
                result.noise.add(alert.id)
            else:
                result.clusters.setdefault(f"ds-{label}", set()).add(alert.id)
        return result
