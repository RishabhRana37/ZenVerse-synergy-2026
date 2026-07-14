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
| Embeddings | **model2vec static embeddings** (`potion-base-8M`, ~30 MB) primary; `all-MiniLM-L6-v2` as pluggable alternative | Static embeddings are 80–500× faster than MiniLM on CPU (15k+ sentences/s) at competitive quality — removes the embedding bottleneck entirely at stream rate. Both run fully offline. Eval compares them (ablation) |
| Clustering | **River `DenStream`** (true streaming, incremental) primary; `scikit-learn` DBSCAN micro-batch as baseline + fallback | Published comparison shows DenStream beating batch HDBSCAN on stream data (silhouette 0.685 vs 0.592) with far lower memory and no full re-cluster per tick. DBSCAN micro-batch is the guaranteed-floor fallback and an eval ablation |
| Graph | `networkx` (backend analysis) | Dependency graph + co-occurrence centrality, tiny data sizes |
| Storage | SQLite (via SQLAlchemy) | Zero-ops, single file, sufficient for demo scale; schema portable to Postgres. (Keep validates history-keeping for temporal correlation — we keep full alert history) |
| LLM | Any chat-completion API behind a thin adapter + **template fallback** | Summaries are garnish, not core; must degrade gracefully offline |
| Frontend | React 18 + Vite + TypeScript | No researched reason against; team velocity decides |
| Dependency-graph viz | **Cytoscape.js** via `react-cytoscapejs`, **dagre** layout | Research consensus for dependency graphs: hierarchical (dagre/breadthfirst) layouts where depth = dependency distance; Cytoscape recommended over force-graph libs for dense relationship navigation |
| Charts | Recharts (timelines, sparklines) | Fast to ship |

**Design rule: everything runs on one laptop, fully offline.** The only optional network call is the LLM; it has a fallback.

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
                       │ DEDUPLICATOR             │  fingerprint = hash(template_id, host,
                       │  (Keep-style fingerprint)│  service); repeat within window →
                       │                          │  collapse, increment counter. O(1)
                       └────────────┬─────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ EMBEDDER                 │  model2vec static embedding of templated
                       │  (cached per template)   │  text (15k+ texts/s on CPU); cache key =
                       │                          │  template id → embeds each template ONCE
                       └────────────┬─────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ CORRELATOR               │  incremental clustering over combined
                       │  (the core)              │  distance; emits/updates IncidentClusters
                       └────────────┬─────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ ROOT-CAUSE RANKER        │  topology + timing + severity + centrality
                       │                          │  → ranked candidates w/ confidence
                       └────────────┬─────────────┘
                                    ▼
                       ┌──────────────────────────┐
                       │ SUMMARIZER (async)       │  LLM incident brief + first action
                       │                          │  (template fallback)
                       └────────────┬─────────────┘
                                    ▼
                          SQLite  +  WebSocket push ──► React war room
```

Each stage is a class with a single `process()` entry point, composed in `pipeline.py`. Stages are independently testable and independently rebuildable (matters for the 24-hr finale format).

## 3. Canonical data model

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
  embedding       vector(384)       # cached per template
  dup_count       int = 1           # collapsed identical repeats
  cluster_id      fk → IncidentCluster | None   # None = unclustered/noise

IncidentCluster
  id              uuid
  created_at / updated_at
  status          enum(active, resolved)
  alert_count     int               # incl. dup counts
  services        [str]             # blast radius
  root_candidates [{alert_id, score, confidence}]   # ranked, top-3 surfaced
  summary         str | None        # LLM/template brief
  first_action    str | None
  title           str               # short human label

TopologyNode / TopologyEdge        # loaded from scenario YAML
  service, depends_on[]
```

**Topology YAML** (per demo scenario) — deliberately simple:

```yaml
services:
  - name: postgres-primary
  - name: api-gateway
    depends_on: [auth-svc, order-svc]
  - name: order-svc
    depends_on: [postgres-primary, redis-cache]
  - name: auth-svc
    depends_on: [postgres-primary]
```

## 4. Correlation algorithm (the core)

Combined pairwise distance between alerts *a, b*:

```
D(a,b) = w_t · d_time(a,b)  +  w_s · d_sem(a,b)  +  w_a · d_attr(a,b)

d_time  = min(|ts_a − ts_b| / T_max, 1)          T_max ≈ 300 s (tunable)
d_sem   = 1 − cosine(emb_a, emb_b)               on template embeddings
d_attr  = 1 − Jaccard({host, service, dc, tags}) # shared attributes pull together
        − topology_bonus                          # connected services pull together

Starting weights: w_t = 0.3, w_s = 0.4, w_a = 0.3 — tuned on labeled data (Day 3).
```

**Streaming operation (primary — River DenStream):** alerts feed River's `DenStream` incrementally as they arrive — micro-clusters update in O(1) per alert, no re-clustering, memory stays bounded. The offline macro-clustering step runs on each UI tick (2 s) to emit incident clusters, then **reconciles** them against existing incidents (max-overlap matching) so incident IDs are stable in the UI — cards must update, not flicker in and out.

**Baseline (and fallback #1 — micro-batch DBSCAN):** every tick, take the active window (last `T_max`), compute the distance matrix (cheap: fingerprint dedup + template-cached embeddings keep unique items small), run scikit-learn DBSCAN, reconcile. Simpler to tune than DenStream; this is the guaranteed floor and an eval ablation. **Build this first (Day 2), add DenStream after (Day 3–4), keep whichever measures better.**

**Noise handling:** density-based noise points (both algorithms) stay unclustered and appear only in the raw stream — correct behavior, since singleton alerts aren't incidents.

**Fallback #2:** if tuned clustering underperforms on labeled data by Day 4, drop to attribute+topology-first correlation (service-connected components within the window) with semantics as a tiebreaker. Lower ceiling, guaranteed floor.

## 5. Root-cause ranking

For each alert *i* in cluster *C*:

```
score(i) = α · topology_depth(i)     # fraction of C's services downstream of service(i)
         + β · temporal_precedence(i) # 1 − rank(ts_i)/|C|  (earlier → higher)
         + γ · severity(i)            # critical=1, warning=0.5, info=0.2
         + δ · centrality(i)          # degree centrality in co-occurrence graph of C

Starting: α=0.4, β=0.3, γ=0.2, δ=0.1 — tuned on labeled root causes.
confidence = softmax over cluster scores → top-3 surfaced as ranked candidates
```

Key presentation rule (aligned with how judges' own products behave): **ranked candidates with confidence, never a single unqualified verdict.**

## 6. LLM summarizer

- Input: cluster stats (services, counts, span), top root-cause candidate + confidence, 5 representative alert templates, topology path
- Output (JSON-forced): `{title, summary, first_action}`
- Async, off the hot path: cards render immediately with template titles; summary streams in when ready
- **Fallback**: deterministic template — `"{root_service} failure affecting {n} services ({m} alerts). Likely cause: {root_template}. First action: check {root_service}."` Demo never blocks on a network call.

## 7. API surface

```
POST  /alerts                  # webhook ingest (single or batch)
GET   /incidents               # active incident cards
GET   /incidents/{id}          # drill-down: members, root candidates, topology path
GET   /alerts?raw=true         # raw stream, paginated
POST  /replay/start            # {dataset, speed, scenario}
POST  /replay/stop
GET   /eval/results            # metrics JSON from last eval run
GET   /topology                # current scenario graph
WS    /ws/stream               # pushes: alert events, incident create/update events
```

## 8. Frontend views

1. **War Room** (the demo view)
   - Left: raw stream, auto-scrolling, alert-rate counter ticking up
   - Right: incident cards (title, root cause + confidence bar, services affected, ×N alert count, sparkline)
   - Top bar: `2,143 alerts → 3 incidents · 99.86% noise suppressed`
2. **Incident drill-down** — full member list, ranked root candidates, dependency graph with the propagation path highlighted, LLM summary + first action
3. **Eval dashboard** — metrics table from `GET /eval/results`, per-scenario. This page IS the credibility slide, live.

## 9. Evaluation harness (`eval/`)

Runs the full pipeline over a labeled dataset offline (no replay delay) and computes: compression ratio, cluster purity + Adjusted Rand Index vs. labels, root-cause Hit@1/Hit@3, p50/p95 pipeline latency. Outputs JSON consumed by the eval dashboard. Details: `EVALUATION.md`.

## 10. Deliberate simplifications

Stated up front so reviewers know they're choices, not oversights:

- SQLite, single process, in-memory active window — demo scale (thousands of alerts), not production scale; the algorithm layer is what we're proving
- Topology is declared YAML, not auto-discovered — auto-discovery is its own product
- Incident cards refresh on 2 s ticks (even though DenStream ingests per-alert) — indistinguishable in the demo, keeps UI reconciliation simple
- No auth/multi-tenant — engine demo, not SaaS
