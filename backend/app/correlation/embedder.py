from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)


class Embedder:
    """
    Template-level embedding cache.

    Embeddings are NEVER written to SQLite — they live here in _cache only.
    The cache key is template_id (from Drain3), so each unique log template
    is embedded exactly once regardless of how many alerts share it.

    Primary model:  model2vec  potion-base-8M  (~30 MB, ~15k texts/s on CPU)
    Fallback model: sentence-transformers  all-MiniLM-L6-v2
    Zero-vector:    if neither is available (pipeline still runs, clustering degrades)
    """

    MODEL_NAME = "minishlab/potion-base-8M"
    EMBEDDING_DIM = 384

    def __init__(self, model_name: str | None = None) -> None:
        self._cache: dict[str, np.ndarray] = {}
        self._model = None
        self._model_name = model_name or self.MODEL_NAME
        self._load_model()

    def _load_model(self) -> None:
        try:
            from model2vec import StaticModel
            self._model = StaticModel.from_pretrained(self._model_name)
            logger.info("Embedder: loaded model2vec '%s'", self._model_name)
            return
        except Exception as exc:
            logger.warning("model2vec unavailable (%s) — trying SentenceTransformer", exc)

        try:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("Embedder: loaded SentenceTransformer fallback")
        except Exception as exc:
            logger.error("No embedding model available: %s — using zero vectors", exc)
            self._model = None

    # ── Public API ─────────────────────────────────────────────────────────────

    def embed(self, template: str, template_id: str) -> np.ndarray:
        """Return embedding for a template, computing and caching if not present."""
        if template_id not in self._cache:
            self._cache[template_id] = self._compute([template])[0]
        return self._cache[template_id]

    def embed_batch(self, items: list[tuple[str, str]]) -> dict[str, np.ndarray]:
        """
        Embed a batch of (template, template_id) pairs.
        Only computes embeddings for cache misses — existing entries are reused.
        Returns {template_id: np.ndarray}.
        """
        missing_text: list[str] = []
        missing_ids: list[str] = []
        for template, template_id in items:
            if template_id not in self._cache:
                missing_text.append(template)
                missing_ids.append(template_id)

        if missing_text:
            vecs = self._compute(missing_text)
            for tid, vec in zip(missing_ids, vecs):
                self._cache[tid] = vec

        return {tid: self._cache[tid] for _, tid in items if tid in self._cache}

    @property
    def cache_size(self) -> int:
        return len(self._cache)

    # ── Internal ───────────────────────────────────────────────────────────────

    def _compute(self, texts: list[str]) -> list[np.ndarray]:
        if not texts:
            return []
        if self._model is None:
            return [np.zeros(self.EMBEDDING_DIM, dtype=np.float32) for _ in texts]
        try:
            result = self._model.encode(texts)
            return [np.array(r, dtype=np.float32) for r in result]
        except Exception as exc:
            logger.error("Embedding computation failed: %s", exc)
            return [np.zeros(self.EMBEDDING_DIM, dtype=np.float32) for _ in texts]
