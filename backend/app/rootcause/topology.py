from __future__ import annotations

import logging
from pathlib import Path

import networkx as nx
import yaml

from app.models.schema import TopologyEdge, TopologyNode

logger = logging.getLogger(__name__)


class TopologyLoader:
    """
    Loads scenario topology YAML → directed NetworkX graph.
    Edge direction: A → B means "A depends_on B" (B is upstream of A).

    Reloaded on every POST /replay/start so scenario changes take effect.
    """

    DATA_DIR = Path(__file__).parent.parent.parent / "data"

    def __init__(self) -> None:
        self._graph: nx.DiGraph = nx.DiGraph()
        self._scenario: str = ""
        self._clustering_overrides: dict = {}

    def load(self, scenario: str) -> nx.DiGraph:
        """Load topology from data/scenarios/{scenario}.yaml. Resets existing graph."""
        self._scenario = scenario
        self._graph = nx.DiGraph()
        self._clustering_overrides = {}

        path = self.DATA_DIR / "scenarios" / f"{scenario}.yaml"
        if not path.exists():
            logger.warning("Topology: scenario file '%s' not found", path)
            return self._graph

        with open(path) as f:
            data = yaml.safe_load(f)

        for svc in data.get("services", []):
            name = svc["name"]
            self._graph.add_node(name)
            for dep in svc.get("depends_on", []):
                self._graph.add_edge(name, dep)  # name depends_on dep

        self._clustering_overrides = data.get("clustering", {})

        logger.info(
            "Topology: loaded scenario '%s' — %d nodes, %d edges",
            scenario,
            self._graph.number_of_nodes(),
            self._graph.number_of_edges(),
        )
        return self._graph

    @property
    def graph(self) -> nx.DiGraph:
        return self._graph

    @property
    def clustering_overrides(self) -> dict:
        """Optional per-scenario {eps, min_samples} from the scenario YAML's
        `clustering:` block. Density-appropriate eps is scale-sensitive — a
        90 s multi-service cascade and a day-long single-host anomaly stream
        are different density regimes (see eval/results/db-cascade_* vs
        aiops-scn1_* for the evidence). Empty dict if the scenario doesn't
        declare one; callers should fall back to DBSCANClusterer's default."""
        return self._clustering_overrides

    # ── Root-cause helpers ────────────────────────────────────────────────────

    def topology_depth(self, service: str | None, cluster_services: list[str]) -> float:
        """
        Fraction of cluster_services that are downstream of `service`.
        Returns -0.05 penalty if service is not in the topology graph
        (distinguishes unknown services from genuine leaf nodes).
        """
        if not service:
            return 0.0
        if not self._graph.has_node(service):
            return -0.05  # penalty: service not declared in topology

        if not cluster_services:
            return 0.0

        downstream = set()
        for node in cluster_services:
            if node == service:
                continue
            try:
                if nx.has_path(self._graph, service, node):
                    downstream.add(node)
            except nx.NodeNotFound:
                pass

        return len(downstream) / len(cluster_services)

    def propagation_path(
        self, root_service: str, affected_services: list[str]
    ) -> list[tuple[str, str]]:
        """
        BFS from root_service outward through affected_services only.
        Returns edge list ordered by propagation sequence for frontend animation.
        """
        if not self._graph.has_node(root_service):
            return []

        affected_set = set(affected_services)
        edges: list[tuple[str, str]] = []
        visited = {root_service}
        queue = [root_service]

        while queue:
            current = queue.pop(0)
            # Traverse edges in the dependency direction (A → B: B depends on A)
            for neighbor in self._graph.predecessors(current):
                # predecessors = services that depend ON current (downstream victims)
                if neighbor in affected_set and neighbor not in visited:
                    edges.append((current, neighbor))
                    visited.add(neighbor)
                    queue.append(neighbor)

        return edges

    # ── Serialisation helpers (for GET /topology) ─────────────────────────────

    def nodes_list(self) -> list[TopologyNode]:
        return [TopologyNode(id=n) for n in self._graph.nodes]

    def edges_list(self) -> list[TopologyEdge]:
        return [TopologyEdge(source=u, target=v) for u, v in self._graph.edges]
