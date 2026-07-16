from __future__ import annotations

import math

import networkx as nx

from app.models.schema import Alert, RootCandidate
from app.rootcause.topology import TopologyLoader


def _severity_score(severity: str) -> float:
    return {"critical": 1.0, "warning": 0.5, "info": 0.2}.get(severity, 0.2)


def _softmax(scores: list[float]) -> list[float]:
    if not scores:
        return []
    mx = max(scores)
    exps = [math.exp(s - mx) for s in scores]
    total = sum(exps)
    return [e / total for e in exps] if total > 0 else [1.0 / len(scores)] * len(scores)


def _cooccurrence_centrality(alerts: list[Alert]) -> dict[str, float]:
    """
    Degree centrality in the co-occurrence graph of this cluster.
    Two alerts share an edge if they have the same service or host.
    O(|C|²) — fine since |C| is typically < 100 unique alerts.
    """
    g = nx.Graph()
    for a in alerts:
        g.add_node(a.id)
    for i, a in enumerate(alerts):
        for b in alerts[i + 1:]:
            if (a.service and a.service == b.service) or (a.host and a.host == b.host):
                g.add_edge(a.id, b.id)
    return nx.degree_centrality(g) if g.number_of_nodes() > 0 else {}


class RootCauseRanker:
    """
    Ranks alerts within a cluster as root-cause candidates.

    score(i) = α·topology_depth(i) + β·temporal_precedence(i)
             + γ·severity(i)       + δ·centrality(i)

    topology_depth returns -0.05 for services not in the topology graph
    (unknown services receive a slight penalty vs genuine leaf nodes).

    confidence = softmax(scores) → top-3 returned as RootCandidate list.
    """

    def __init__(
        self,
        alpha: float = 0.4,
        beta: float = 0.3,
        gamma: float = 0.2,
        delta: float = 0.1,
    ) -> None:
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.delta = delta

    def rank(
        self,
        cluster_alerts: list[Alert],
        topology: TopologyLoader,
        top_k: int = 3,
    ) -> list[RootCandidate]:
        if not cluster_alerts:
            return []

        services = [a.service for a in cluster_alerts if a.service]
        centrality = _cooccurrence_centrality(cluster_alerts)

        # Temporal rank: sort ascending by ts, assign rank index
        sorted_by_ts = sorted(cluster_alerts, key=lambda a: a.ts)
        ts_rank = {a.id: i for i, a in enumerate(sorted_by_ts)}
        n = len(cluster_alerts)

        raw_scores: list[float] = []
        for alert in cluster_alerts:
            topo = topology.topology_depth(alert.service, services)
            # topo = -0.05 if service not in topology graph
            prec = 1.0 - (ts_rank[alert.id] / n) if n > 1 else 1.0
            sev = _severity_score(alert.severity)
            cent = centrality.get(alert.id, 0.0)

            score = (
                self.alpha * topo
                + self.beta * prec
                + self.gamma * sev
                + self.delta * cent
            )
            raw_scores.append(score)

        confidences = _softmax(raw_scores)

        ranked = sorted(
            zip(cluster_alerts, raw_scores, confidences),
            key=lambda x: x[1],
            reverse=True,
        )[:top_k]

        return [
            RootCandidate(
                alert_id=a.id,
                service=a.service or "",
                template=a.template,
                score=round(score, 4),
                confidence=round(conf, 4),
            )
            for a, score, conf in ranked
        ]
