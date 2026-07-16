# StormLens — Technical Architecture

Companion to `PRD.md`. This is the build spec: pipeline stages, algorithms, data model, and API surface.

---

## 1. Stack

Every choice below was researched, not assumed. Language is **Python** because the entire alert-mining ecosystem lives there (Drain3, model2vec, scikit-learn, River, NetworkX) — any other backend language means reimplementing or bridging the core libraries.

| Layer | Choice | Rationale (researched) |
|---|---|---|
| Backend | Python 3.12 + FastAPI | Only language with the full AIOps library ecosystem; FastAPI = native async WebSockets; team velocity is a bonus, not the reason |
| Template mining | **Drain3** (`logpai/Drain3`) | The industry-standard *streaming* log template miner — used in IBM production AIOps; extracts templates + parameters on-the-fly, exactly our normalizer stage. Do NOT hand-roll this |
| Deduplication | **Fingerprint hashing** — hash of (template_id, host, service) | The approach used by Keep (leading open-source AIOps platform): O(1) dedup via configurable-field fingerprints |
| Embeddings | **model2vec static embeddings** (`minishlab/potion-base-8M`, ~30 MB) primary; `all-MiniLM-L6-v2` as pluggable alternative | Static embeddings are 80–500× faster than MiniLM on CPU (15k+ sentences/s) at competitive quality — removes the embedding bottleneck entirely at stream rate. Both run fully offline. Eval compares them (ablation). Embeddings are kept **in-memory only** (template cache), never written to SQLite |
| Clustering | **scikit-learn DBSCAN micro-batch (PRIMARY)** | DBSCAN supports `metric="precomputed"` and therefore accepts our full 3-signal combined distance matrix directly. River DenStream does NOT support precomputed distances — it requires raw feature vectors and cannot consume the time+semantic+attribute combined signal. DBSCAN is therefore the correct primary. DenStream is evaluated as an ablation (embedding-only distance) and kept if it outperforms. |
| Graph | `networkx` (backend analysis) | Dependency graph + co-occurrence centrality, tiny data sizes |
| Storage | SQLite (via SQLAlchemy) | Zero-ops, single file, sufficient for demo scale; schema portable to Postgres. Embeddings are NOT stored in SQLite (see above — template cache only) |
| LLM | Any chat-completion API behind a thin adapter + **template fallback** | Summaries are garnish, not core; must degrade gracefully offline. Hard 8 s timeout — if exceeded, template fallback fires and `generated_by: "template"` is pushed |
| Frontend | React 18 + Vite + TypeScript | No researched reason against; team velocity decides |
| Dependency-graph viz | **Cytoscape.js** via `react-cytoscapejs`, **dagre** layout | Research consensus for dependency graphs: hierarchical (dagre/breadthfirst) layouts where depth = dependency distance; Cytoscape recommended over force-graph libs for dense relationship navigation |
| Charts | Recharts (timelines, sparklines) | Fast to ship |

**Design rule: everything runs on one laptop, fully offline.** The only optional network call is the LLM; it has a fallback.

---

## 2. Pipeline

```
                       ┌──────────────────────────────────────────────────────────┐
                       │ INGESTION                                                │
 dataset replay ────►  │  POST /alerts (webhook)         ReplayEngine (file → ws) │
 synthetic storm ───►  │            │                                             │
                       └────────────┼─────────────────────────────────────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ NORMALIZER               │  source-specific → canonical Alert
                       │  + Drain3 template miner │  "disk full on host-42" → "disk full on <HOST>"
                       │    (streaming, online)   │  + extracted parameters (host, values)
                       └────────────┬─────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ DEDUPLICATOR             │  fingerprint = hash(template_id, host, service)
                       │  (Keep-style fingerprint)│  repeat within TTL window → collapse, incr counter
                       │  TTL = T_max (300 s)     │  Expired entries evicted on each tick. O(1)
                       └────────────┬─────────────┘
                                    │           ↑ dedup hit → push alert.dedup WS event (skip rest)
                                    ▼
                       ┌──────────────────────────┐
                       │ EMBEDDER                 │  model2vec static embedding of templated text
                       │  (in-memory cache only)  │  Cache key = template_id → embed each ONCE
                       │  template_id → np.array  │  NOT stored in SQLite
                       └────────────┬─────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ ALERT BUFFER + WS PUSH   │  New unique alerts → alert.batch WS event
                       │  Batched: flush every    │  (flushed every 100 ms or 50 alerts)
                       │  100 ms or 50 alerts     │  Sparkline buckets updated here
                       └────────────┬─────────────┘
                                    ▼  (every 2 s tick — background asyncio task)
                       ┌──────────────────────────┐
                       │ CORRELATOR               │  DBSCAN over precomputed distance matrix
                       │  (DBSCAN — primary)      │  Active window = last T_max unique alerts
                       │  metric="precomputed"    │  Reconcile → stable incident IDs
                       └────────────┬─────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ ROOT-CAUSE RANKER        │  topology + timing + severity + centrality
                       │                          │  → ranked candidates w/ confidence
                       └────────────┬─────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ SUMMARIZER (async)       │  LLM incident brief + first action
                       │  8 s hard timeout        │  Template fallback if timeout/offline
                       └────────────┬─────────────┘
                                    ▼
                          SQLite  +  WebSocket push ──► React war room
```

Each stage is a class with a single `process()` entry point, composed in `pipeline.py`. Stages are independently testable and independently rebuildable (matters for the 24-hr finale format).

---

## 3. Canonical Data Model

```
Alert
  id              uuid
  ts              datetime          # source timestamp
  received_at     datetime
  source          str               # "prometheus" | "replay:aiops" | "synthetic" | ...
  host            str | None
  service         str | None
  severity        enum(critical, warning, info)
  message         str               # raw text
  template        str               # parameterized text ("disk full on <HOST>")
  template_id     str               # Drain3-assigned template ID (embedding cache key)
  dup_count       int = 1           # collapsed identical repeats
  cluster_id      fk → IncidentCluster | None   # None = unclustered/noise

  # NOTE: embedding is NOT a field on Alert. It lives only in the Embedder's
  # in-memory cache keyed by template_id. Loading alerts from SQLite never
  # deserializes 384 floats — embeddings are recomputed from cache on demand.

IncidentCluster
  id              uuid
  created_at / updated_at
  status          enum(active, resolved)
  acknowledged    bool = False
  resolved_at     datetime | None
  alert_count     int               # incl. dup counts
  unique_count    int               # post-dedup
  services        [str]             # blast radius
  root_candidates [{alert_id, service, template, score, confidence}]   # ranked, top-3
  sparkline       [int]             # alert count per 10 s bucket, last 6 buckets — maintained
                                    # by the tick loop in AppState, not computed on the fly
  summary         str | None        # LLM/template brief
  first_action    str | None
  title           str               # short human label (auto-generated until summary arrives)

TopologyNode / TopologyEdge        # loaded from scenario YAML, reloaded on each /replay/start
  service, depends_on[]
```

**Topology YAML** (per demo scenario) — deliberately simple:

```yaml
scenario: db-cascade
services:
  - name: postgres-primary
  - name: redis-cache
  - name: auth-svc
    depends_on: [postgres-primary]
  - name: order-svc
    depends_on: [postgres-primary, redis-cache]
  - name: api-gateway
    depends_on: [auth-svc, order-svc]
```

---

## 4. Correlation Algorithm (the core)

### 4.1 Combined Pairwise Distance

```
D(a, b) = w_t · d_time(a, b)  +  w_s · d_sem(a, b)  +  w_a · d_attr(a, b)

d_time  = min(|ts_a − ts_b| / T_max, 1)          T_max = 300 s (tunable)

d_sem   = 1 − cosine(emb_a, emb_b)               on template embeddings
          (embeddings fetched from in-memory cache by template_id)

d_attr  = 1 − Jaccard({host, service, dc, tags})
        − topology_bonus(service_a, service_b)

topology_bonus:
  0.15   if direct edge exists between service_a and service_b (either direction)
  0.05   if a directed path exists with ≤ 2 hops
  0.00   otherwise (no relationship in topology graph)
  Note: topology_bonus is clamped so d_attr ≥ 0 always.

Starting weights: w_t = 0.3, w_s = 0.4, w_a = 0.3 — tuned on labeled data.
```

### 4.2 Primary Clusterer — DBSCAN micro-batch

**Why DBSCAN, not DenStream:** River's `DenStream` requires raw feature vectors and computes its own internal distance. It **cannot accept a precomputed distance matrix**. Our distance function `D(a,b)` combines three heterogeneous signals (temporal, semantic, attribute). To use DenStream, we would have to discard the temporal and attribute signals and feed only the embedding — degrading quality. DBSCAN with `metric="precomputed"` accepts our full distance matrix directly, making it the correct primary algorithm.

**Operation:**
- Every 2 s tick: take the active window (all unique alerts with `ts ≥ now − T_max`)
- Compute the N×N pairwise distance matrix (cheap: dedup + template-cached embeddings keep N small, typically < 500)
- Run `sklearn.cluster.DBSCAN(eps=0.35, min_samples=3, metric="precomputed")`
- Reconcile output against existing incidents (§4.3)
- Emit `incident.created` / `incident.updated` WS events for changed incidents

**Parameter guidance:** `eps` is the primary tuning knob. With D in [0, 1]: `eps=0.35` is a good start — tune up if clusters are too fragmented, down if unrelated alerts merge.

### 4.3 Reconciliation — Stable Incident IDs

The reconciler runs after each DBSCAN tick to ensure incident IDs are stable (cards must update, not flicker):

**Algorithm (greedy max-overlap):**
1. Build overlap matrix: for each (old_incident, new_cluster), count shared `alert_id`s.
2. Greedy assignment: sort pairs by overlap count descending; assign new_cluster → old_incident if old_incident not yet claimed AND overlap ≥ `min_overlap_pct` (default 30%).
3. Unassigned new clusters → new incidents (emit `incident.created`).
4. Old incidents with no assignment: if their member alerts have all aged out of the window → mark `resolved` (emit `incident.updated` with `status: resolved`).

**Split handling:** If old incident A overlaps two new clusters at > 30% each → A keeps the larger overlap, the smaller cluster becomes a new incident. This prevents cards from disappearing.

### 4.4 DenStream (ablation only)

Run DenStream in parallel during eval, feeding it only the embedding vector. Compare silhouette and ARI against DBSCAN. Promote to primary only if it demonstrably outperforms on the held-out labeled scenario.

### 4.5 Fallback #2 (if both density clusterers underperform)

Attribute+topology-first correlation: service-connected components within the window, semantics as tiebreaker. Lower ceiling, guaranteed floor.

### 4.6 Noise handling

Density-based noise points (DBSCAN label = -1) stay unclustered — correct, since singleton alerts aren't incidents. They appear only in the raw stream.

---

## 5. Root-Cause Ranking

For each alert *i* in cluster *C*:

```
score(i) = α · topology_depth(i)
         + β · temporal_precedence(i)
         + γ · severity(i)
         + δ · centrality(i)

topology_depth(i):
  fraction of C's services that are downstream of service(i) in the topology graph
  = |{s ∈ services(C) : path_exists(service(i) → s)}| / |services(C)|
  = 0.0  if service(i) is not in the topology graph at all
  Penalty: services NOT in the topology graph receive topology_depth = -0.05
           (distinguishes "genuine leaf node" from "unknown service")

temporal_precedence(i):
  1 − (rank of ts_i within C sorted ascending) / |C|
  (earliest alert → score approaches 1.0)

severity(i):
  critical = 1.0, warning = 0.5, info = 0.2

centrality(i):
  degree centrality of alert i in the co-occurrence graph of C
  (co-occurrence graph: edge between alerts sharing service or host)
  Computed once per cluster, O(|C|²) — acceptable since |C| is small (< 100 unique)

Starting: α=0.4, β=0.3, γ=0.2, δ=0.1 — tuned on labeled root causes.
confidence = softmax over cluster scores → top-3 surfaced as ranked candidates
```

Key presentation rule: **ranked candidates with confidence, never a single unqualified verdict.**

---

## 6. LLM Summarizer

- **Input:** cluster stats (services, counts, span), top root-cause candidate + confidence, 5 representative alert templates, topology path
- **Output (JSON-forced):** `{title, summary, first_action}`
- **Async, off the hot path:** incident cards render immediately with auto-generated template titles; LLM summary streams in via `incident.summary` WS event when ready
- **Hard timeout:** 8 seconds. If LLM does not respond within 8 s, the template fallback fires immediately and pushes `incident.summary` with `generated_by: "template"`. Demo never hangs on a network call.
- **Fallback (always available offline):**
  ```
  title:        "{root_service} failure affecting {n} services"
  summary:      "{root_service} failure caused cascading alerts across {services_list}.
                 {m} alerts ({unique} unique) over {span}s.
                 Top root candidate: '{root_template}' (confidence {conf:.0%})."
  first_action: "Check {root_service} health, disk, and failover status."
  generated_by: "template"
  ```

---

## 7. API Surface

```
# Ingestion
POST  /alerts                          # webhook ingest (single alert or batch JSON array)

# Replay control
POST  /replay/start                    # {dataset, speed, scenario} — also reloads topology YAML
POST  /replay/stop
POST  /replay/reset                    # clears all in-memory state (incidents, alerts, dedup index)
                                       # then restarts from scratch; maps to keyboard shortcut 'r'

# Incidents
GET   /incidents                       # list all active + recently resolved incidents
GET   /incidents/{id}                  # drill-down: members, root_candidates, topology_path
POST  /incidents/{id}/acknowledge      # set acknowledged=True; pushes incident.updated WS event
POST  /incidents/{id}/resolve          # set status=resolved, resolved_at=now; pushes incident.updated

# Topology
GET   /topology                        # {nodes: [{id}], edges: [{source, target}]}

# Raw alerts (eval/debug only — NOT used by the live war-room UI)
GET   /alerts                          # paginated raw alert history; used by eval harness + debug

# Evaluation
GET   /eval/results                    # metrics JSON from last eval run

# WebSocket
WS    /ws/stream                       # server → client push stream (see WS_CONTRACT.md)
```

**CORS:** `localhost:*` allowed for frontend dev server.

**Notes on new endpoints:**
- `POST /replay/reset`: clears `AppState` (alert_index, dedup_index, incidents, sparkline buckets), reloads topology, and resets the replay engine. Called by keyboard shortcut `r` via the DemoDriver panel.
- `POST /incidents/{id}/acknowledge` and `/resolve`: the DrillDownSlideOver UI allows responders to mutate incident state. Both push an `incident.updated` WS event immediately so all connected clients see the change.
- `GET /alerts` is **not** consumed by the live war-room UI. The raw stream comes from WS `alert.batch` events. This REST endpoint exists for the eval harness and debugging only — document this clearly to avoid implementer confusion.

---

## 8. Sparkline Maintenance

The WS contract requires per-incident sparklines: `[0, 3, 41, 120, 340, 847]` (cumulative alert count per 10 s bucket, last 6 buckets = last 60 s).

**Owner:** `AppState` maintains a `sparkline_buckets: dict[incident_id, deque[int]]` (maxlen=6). The tick loop (every 2 s) adds the delta alert count to the current open bucket. Every 10 s a new bucket opens and the deque rolls.

This is computed per-incident from the moment the incident is created. The DBSCAN reconciler updates the incident's member set; the tick loop reads the new `alert_count` and appends to the bucket.

---

## 9. Deduplication — TTL Expiry

The dedup fingerprint index must expire old entries or a service that silences for 5+ minutes and then fires again would silently be collapsed into the same alert.

**Implementation:**
- Each entry in `dedup_index` stores `{alert_id, expires_at}` where `expires_at = received_at + T_max`.
- The tick loop (every 2 s) evicts all entries where `expires_at < now`.
- Use a `sortedcontainers.SortedList` or a simple timestamp-sorted `deque` for O(log n) eviction.
- When an entry expires, the fingerprint is removed. The next alert with the same fingerprint starts a fresh dedup chain.

---

## 10. Evaluation Harness (`eval/`)

Runs the full pipeline over a labeled dataset offline (no replay delay) and computes:

| Metric | Target | Notes |
|---|---|---|
| Compression ratio | ≥ 95% | `1 − (incidents + unclustered) / raw_alerts` |
| Cluster purity | ≥ 0.8 | vs. ground-truth labels |
| ARI | reported | corrects for chance; purity alone rewards over-splitting |
| Fragmentation | ≤ 1.5 | avg predicted clusters per true incident |
| Root-cause Hit@1 | ≥ 60% | per failure-type breakdown |
| Root-cause Hit@3 | ≥ 85% | per failure-type breakdown |
| p50 / p95 latency | p95 < 5 s | **streaming bench mode only** (see below) |

**Important: latency cannot be measured by the offline harness** (no replay delays → no realistic timing). p50/p95 is measured by a separate **streaming bench mode**:

```bash
python -m eval.bench --dataset aiops-scn1 --speed 100
# Replays at 100 alerts/s, instruments (alert_received → incident_card_updated) timestamps
# Outputs p50/p95 to stdout and appends to eval/results/
```

**Ablations** (run harness with each signal disabled — the expert-judge slide):

| Configuration | Shows |
|---|---|
| Full system | baseline numbers |
| − semantic (no embeddings, attr+time only) | what semantics buys |
| − topology (topology_bonus = 0, topology_depth = 0) | what the dependency graph buys |
| − temporal (w_t = 0, redistribute to w_s and w_a) | why timing matters |
| DenStream instead of DBSCAN | streaming vs. batch clustering trade-off |
| Naive dedup only (exact-duplicate collapse) | the strawman most teams will ship |

Output: `eval/results/{dataset}_{git_sha}.json` — every reported number traceable to a commit.

---

## 11. Frontend Views

1. **War Room** (the demo view)
   - Left: raw stream, auto-scrolling, alert-rate counter ticking up
   - Right: incident cards (title, root cause + confidence bar, services affected, ×N alert count, sparkline)
   - Top bar: `2,143 alerts → 3 incidents · 99.86% noise suppressed`
2. **Incident drill-down** — full member list, ranked root candidates, dependency graph with the propagation path highlighted, LLM summary + first action, acknowledge / resolve buttons
3. **Eval dashboard** — metrics table from `GET /eval/results`, per-scenario. This page IS the credibility slide, live.

---

## 12. Deliberate Simplifications

Stated up front so reviewers know they're choices, not oversights:

- SQLite, single process, in-memory active window — demo scale (thousands of alerts), not production scale; the algorithm layer is what we're proving
- Topology is declared YAML, not auto-discovered — auto-discovery is its own product; topology is reloaded on every `POST /replay/start`
- Incident cards refresh on 2 s ticks (even though DBSCAN can run faster) — indistinguishable in the demo, keeps UI reconciliation simple
- No auth/multi-tenant — engine demo, not SaaS
- Embeddings in-memory only (not persisted) — on restart, the Embedder rebuilds its template cache from the first alerts seen; no data loss because SQLite stores the template text and embeddings are fully deterministic
