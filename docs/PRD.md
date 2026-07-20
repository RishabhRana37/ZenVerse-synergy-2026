# StormLens — Product Requirements Document

**Problem Statement:** HPE PS #10 — Alert Correlation and Deduplication Engine
**Team:** ZenVerse · Synergy 2026 · Manipal University Jaipur
**Judges:** HPE engineers (AIOps / OpsRamp domain experts)
**Version:** 1.0 · July 14, 2026

---

## 1. Problem

During a significant infrastructure incident, monitoring systems (Prometheus, Nagios, CloudWatch, SNMP traps, app-level health checks) generate hundreds to thousands of alerts within minutes. The overwhelming majority are **downstream symptoms of a single root cause**: a database node fails → every service that depends on it times out → every service that depends on *those* services degrades → thousands of alerts, one actual problem.

Consequences today:

- **Alert fatigue** — on-call engineers mute channels, miss real signals
- **Slow MTTR** — the first 10–15 minutes of an incident are spent triaging noise instead of fixing the cause; industry benchmark puts downtime cost at ~$5,600/minute (Gartner)
- **Institutional dependence** — only the senior engineer who "knows the system" can find root cause quickly

This is the exact problem class HPE acquired OpsRamp to solve — the problem is commercially validated and unsolved enough to be interesting.

## 2. Solution

StormLens is an alert correlation engine that converts a raw alert flood into a small set of **incident cards**, each with an identified root-cause alert, a confidence score, a blast-radius view, and an LLM-generated summary with a recommended first action.

**One-line pitch:** *From 2,000 alerts to 3 answers.*

## 3. Users

| User | Need | StormLens answer |
|---|---|---|
| On-call engineer (primary) | "What actually broke and what do I do first?" | Incident card: root cause + confidence + first action |
| SRE / NOC lead | "How big is the blast radius? Is this one incident or three?" | Correlated view with cluster membership and affected services |
| Engineering manager | "How noisy is our monitoring? Are we improving?" | Compression ratio and noise statistics over time |

## 4. Goals & Success Metrics

The product succeeds if, on labeled ground-truth data (AIOps Challenge dataset — see `DATASETS.md`), it demonstrates:

| Metric | Target | **Measured** (aiops-scn1, 15 days, 26 labeled faults) | Why it matters |
|---|---|---|---|
| **Compression ratio** | ≥ 95% (e.g. 2,000 alerts → ≤ 100 items, ideally ≤ 10 incidents) | **60.2% — miss, and correctly so** (see note) | The headline value: noise eliminated |
| **Cluster accuracy (ARI / purity vs labels)** | ≥ 0.8 purity | **Purity 1.00, ARI 0.349** — purity hit, ARI reported (no target set) | Groups must be *correct*, not just fewer |
| **Root-cause hit rate** | Hit@1 ≥ 60%, Hit@3 ≥ 85% | **Hit@1 92%, Hit@3 100%** — both hit | The root cause must be in the top suggestions |
| **End-to-end latency** | Alert → incident card in < 5 s at 100 alerts/s replay | **db-cascade: p50/p95 1.7 s (hit, n=4 — small sample, cold-start-dominated). aiops-scn1: p50 157 ms, p95 578 ms (hit, n=305)** | Must feel real-time in the demo |
| **Demo reliability** | Fully offline-capable (no live API dependency on stage) | Hit — replay/clustering fully local; only the LLM call is optional network, with a template fallback | Zero demo risk at the finale |

These numbers go on a slide. Measured evaluation is a core deliverable, not an afterthought — it is the primary differentiator against teams that demo without evidence. Every number above is traceable to a committed `eval/results/*.json` (`python -m eval.harness` / `eval.bench` reproduce them).

**Held-out validation:** the clustering `eps` was chosen using only 4 faults from a single day; the numbers above are reported against 22 faults from different days never used to tune it, per the protocol in `EVALUATION.md`.

**On the compression miss — reported honestly, not hidden:** the 15-day dataset contains real background anomaly noise scattered across widely separated timestamps, which the correlator now correctly refuses to merge (see the event-clock fix in `ARCHITECTURE.md` §9). The `naive_dedup` ablation reaches 95.8% compression with 12% Hit@1 — proof that compression alone is a vanity metric decoupled from correctness, which is exactly the argument this row is meant to make to a domain-expert judge.

## 5. Features

### P0 — must ship (the product)

1. **Alert ingestion & normalization**
   - Dataset replay engine: stream historical/labeled alerts at configurable speed (1×–1000×)
   - Generic webhook endpoint (`POST /alerts`) accepting a normalized alert JSON — proves it's not dataset-locked
   - Normalizer: maps source-specific fields → canonical schema (timestamp, source, host, service, severity, message, tags)

2. **Correlation engine**
   - Temporal windowing: sliding window grouping of co-occurring alerts
   - Semantic similarity: sentence-transformer embeddings of normalized alert text; template extraction (Drain-style) so "disk full on host-42" and "disk full on host-17" correlate
   - Attribute affinity: same service / host / datacenter boosts correlation
   - Clustering over a combined distance (weighted temporal + semantic + attribute), incremental so clusters form live as alerts stream in

3. **Root-cause ranking**
   - Service dependency graph (declared in a simple YAML topology file per scenario)
   - Ranking score per alert in a cluster combining: topology depth (upstream services score higher), temporal precedence (earlier alerts score higher), severity, and centrality in the alert co-occurrence graph
   - Output: ranked root-cause candidates with confidence scores — never a single unqualified verdict

4. **Deduplication & suppression**
   - Identical/templated repeats collapse into one alert with a counter ("×47")
   - Derivative alerts suppressed from the primary view, fully visible in incident drill-down

5. **War-room UI**
   - Split view: raw stream (left, flooding) vs. correlated incidents (right, calm)
   - Live counters: total alerts, active incidents, compression ratio
   - Incident card: title, root-cause alert + confidence, affected services, alert count, timeline sparkline
   - Drill-down: full cluster membership, dependency-graph visualization highlighting the failure propagation path

6. **LLM incident summarizer**
   - Per-cluster: one-paragraph summary + recommended first action, generated from cluster contents + topology context
   - Template-based fallback if the LLM is unreachable (offline demo safety)

7. **Evaluation harness**
   - Scripted run over labeled data producing the metrics table in §4, exported as JSON + rendered in an eval page in the UI

### P1 — build if ahead of schedule

- **Synthetic storm generator**: scriptable scenarios (e.g. "DB failure cascades through 12 services") for controllable live demos and stress tests
- **Feedback loop**: operator can merge/split clusters or reassign root cause; corrections stored (and shown as "the system learns" story)
- **Notification digest**: one Slack/webhook message per incident instead of thousands

### Non-goals (say them out loud to judges)

- No auto-remediation — StormLens informs the human, it doesn't act
- No custom model training — few-shot/off-the-shelf components only, by design (deployable day one)
- No multi-tenancy, auth, or billing — this is an engine demo, not a SaaS

## 6. Why we win with this

1. **Hardest PS in the set** — requires embeddings, clustering, and graph reasoning; most teams won't attempt it (proven strategy from our Randomize win)
2. **Judge fit** — alert correlation is HPE's own product domain (OpsRamp); evaluators will judge as experts and respect a real attempt
3. **Measured, not claimed** — labeled ground truth lets us show accuracy numbers no other team will have (see §4 — real numbers, not placeholders)
4. **Visceral demo** — the raw-vs-correlated split screen communicates value in 5 seconds to any audience
5. **Zero live-demo risk** — offline replay, local embeddings, LLM fallback templates
6. **Design decisions are evidence-backed, not just asserted** — every non-obvious choice (DBSCAN over DenStream, the distance weights, `eps`) has a measured ablation behind it, including negative results: an external review proposed replacing the blended distance with a hard topology-radius pre-filter for clustering and centrality-based root-cause ranking. Both were built as testable ablations and rejected on measurement, not argument — the gate reproduced the existing default at best and made db-cascade *worse* at a tight radius; pure centrality scored 0% Hit@1 because most real incidents here are single-service, leaving nothing for graph centrality to rank. Being able to show a judge "we tested the alternative your gut suggests, here's why it didn't win" is a stronger position than a design that was never stress-tested.

## 7. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Clustering quality poor on real data | Medium | Layered signals (time + semantics + attributes) so no single signal must carry it; tune on labeled data early (Day 2–3, before UI) |
| Root-cause ranking wrong too often | Medium | Present ranked candidates with confidence, never a single verdict; topology heuristic as a floor |
| Dataset too messy to preprocess in time | Low-Med | Three-source strategy (AIOps Challenge + Loghub + synthetic); synthetic generator guarantees a working demo path |
| Finale is a strict 24-hr from-scratch build | Unknown | Rehearse full reassembly; keep architecture modular so each member can rebuild their component from memory; confirm rules with organizers early |
| LLM API down/rate-limited on stage | Low | Template fallback; pre-generated summaries for the rehearsed scenario |

## 8. Timeline anchors

- **July 14** — PS selection submitted (done)
- **July 17** — Correlation engine measured against real labeled ground truth (done — see §4); topology-first and centrality-ranking alternatives tested and rejected on evidence
- **July 20** — Round 1 (online): idea submission & screening → PRD + architecture + early proof (correlation working on sample data) is the screening package
- **July 31** — Grand Finale (on-campus, 24-hr build + demo to judges)

Detailed plan and per-member split: `EXECUTION_PLAN.md`.
