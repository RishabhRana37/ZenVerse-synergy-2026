from __future__ import annotations

import networkx as nx
import numpy as np
from scipy.spatial.distance import cosine

from app.models.schema import Alert


# ── Component distance functions ───────────────────────────────────────────────

def d_time(a: Alert, b: Alert, t_max: float = 300.0) -> float:
    """Temporal distance normalised to [0, 1]. T_max is tunable."""
    delta = abs((a.ts - b.ts).total_seconds())
    return min(delta / t_max, 1.0)


def d_sem(emb_a: np.ndarray, emb_b: np.ndarray) -> float:
    """1 − cosine_similarity, in [0, 1]. Returns 1.0 for zero vectors."""
    if np.all(emb_a == 0) or np.all(emb_b == 0):
        return 1.0
    try:
        return float(np.clip(cosine(emb_a, emb_b), 0.0, 1.0))
    except Exception:
        return 1.0


def topology_bonus(
    service_a: str | None,
    service_b: str | None,
    graph: nx.DiGraph,
) -> float:
    """
    Bonus for topologically related services (subtracted from d_attr):
      0.15  — direct dependency edge (either direction)
      0.05  — path exists with ≤ 2 hops (either direction)
      0.00  — no relationship, or service not in graph
    Result is clamped so d_attr ≥ 0 always.
    """
    if not service_a or not service_b or service_a == service_b:
        return 0.0
    if not graph.has_node(service_a) or not graph.has_node(service_b):
        return 0.0
    # Direct edge (either direction)
    if graph.has_edge(service_a, service_b) or graph.has_edge(service_b, service_a):
        return 0.15
    # ≤ 2-hop path (either direction)
    for src, tgt in [(service_a, service_b), (service_b, service_a)]:
        try:
            length = nx.shortest_path_length(graph, src, tgt)
            if length <= 2:
                return 0.05
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            continue
    return 0.0


def _jaccard(set_a: set, set_b: set) -> float:
    union = set_a | set_b
    if not union:
        return 0.0
    return len(set_a & set_b) / len(union)


def d_attr(a: Alert, b: Alert, graph: nx.DiGraph) -> float:
    """Attribute distance in [0, 1] = 1 − Jaccard(attrs) − topology_bonus, clamped ≥ 0."""
    attrs_a = {x for x in [a.host, a.service] if x}
    attrs_b = {x for x in [b.host, b.service] if x}
    jaccard = _jaccard(attrs_a, attrs_b)
    bonus = topology_bonus(a.service, b.service, graph)
    return max(0.0, 1.0 - jaccard - bonus)


# ── Combined distance ──────────────────────────────────────────────────────────

def combined_distance(
    a: Alert,
    b: Alert,
    emb_a: np.ndarray,
    emb_b: np.ndarray,
    graph: nx.DiGraph,
    w_t: float = 0.3,
    w_s: float = 0.4,
    w_a: float = 0.3,
    t_max: float = 300.0,
) -> float:
    """
    D(a, b) = w_t·d_time + w_s·d_sem + w_a·d_attr  ∈ [0, 1]
    Starting weights: w_t=0.3, w_s=0.4, w_a=0.3 — tunable via eval harness.
    """
    return (
        w_t * d_time(a, b, t_max=t_max)
        + w_s * d_sem(emb_a, emb_b)
        + w_a * d_attr(a, b, graph)
    )


def build_distance_matrix(
    alerts: list[Alert],
    embeddings: dict[str, np.ndarray],
    graph: nx.DiGraph,
    **kwargs,
) -> np.ndarray:
    """
    Build the symmetric N×N precomputed distance matrix for DBSCAN.
    Only the upper triangle is computed; the lower is mirrored.
    """
    n = len(alerts)
    matrix = np.zeros((n, n), dtype=np.float32)
    for i in range(n):
        emb_a = embeddings.get(alerts[i].template_id, np.zeros(384, dtype=np.float32))
        for j in range(i + 1, n):
            emb_b = embeddings.get(alerts[j].template_id, np.zeros(384, dtype=np.float32))
            d = combined_distance(alerts[i], alerts[j], emb_a, emb_b, graph, **kwargs)
            matrix[i, j] = d
            matrix[j, i] = d
    return matrix
