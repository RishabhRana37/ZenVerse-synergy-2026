# StormLens — Finale Demo Script (target: 6 minutes + Q&A)

Rule of the demo: **show the pain before the product.** Judges must feel the alert flood before they see it collapse.

---

## 0:00 — Cold open (30 s)

Start on the WAR ROOM with replay already primed. One sentence:

> "It's 2 AM. A database node just died. This is what the on-call engineer's screen looks like."

**Hit play on the storm (left panel only, right panel hidden/collapsed).** Raw alerts flood in — counter spinning: 200… 800… 1,500. Let it run 15 seconds in silence. The silence sells it.

> "Two thousand alerts. One actual problem. Industry data says every minute of this triage costs about $5,600. Somewhere in this flood is the answer."

## 0:45 — The reveal (30 s)

**Expand the right panel.**

> "This is the same stream through StormLens."

Three incident cards. Top bar reads: `2,143 alerts → 3 incidents · 99.86% noise suppressed`.

> "From two thousand alerts to three answers — live, as they streamed in."

## 1:15 — Anatomy of an incident (90 s)

Click the biggest incident card → drill-down.

- Root cause: **postgres-primary disk latency — 87% confidence**, with candidates #2 and #3 visible below it
  > "We never claim certainty — we rank candidates with confidence, the same way real operators reason."
- Dependency graph with the propagation path lit up: postgres → order-svc → api-gateway → checkout
  > "It didn't just group these 1,400 alerts by text similarity — it knows checkout depends on orders depends on this database. It reasons over topology, timing, semantics, and severity together."
- LLM summary + first action:
  > "And it drafts the incident brief: what broke, blast radius, and the first thing to check. The on-call engineer starts fixing at minute one, not minute fifteen."

## 2:45 — Proof, not vibes (90 s)

Switch to the EVAL DASHBOARD.

> "Anyone can demo a happy path. We measured ours on labeled ground truth — the AIOps Challenge dataset, real incidents with annotated root causes."

Walk the table: compression ratio, cluster purity/ARI, **root-cause Hit@1 and Hit@3**, end-to-end latency.

> "The labeled root cause appears in our top-3 candidates X% of the time. These numbers are reproducible — the harness ships in the repo."

*(This is the section no other team will have. Slow down here.)*

## 4:15 — Generality (45 s)

Run a SECOND scenario live — different failure type (network partition or rolling-deploy regression), different topology file.

> "Different failure, different topology, same engine — nothing here is hard-coded to one incident."

If P1 shipped: trigger a live synthetic storm from the stage laptop instead.

## 5:00 — Close (45 s)

Architecture slide, one breath:

> "Ingest, normalize, embed locally, cluster incrementally, rank root causes over the dependency graph, summarize. Runs on this laptop, fully offline — the storm you saw needed zero network."

Business close:

> "This is the problem class HPE acquired OpsRamp to solve. We built the core of it in two weeks and measured it against ground truth. Compress triage from fifteen minutes to one, and you've saved real money on every incident, every time."

## Q&A prep — likely judge questions

| Question | Answer sketch |
|---|---|
| "How does it scale beyond a laptop?" | Micro-batch design maps to a stream processor; embedding cache keyed by template keeps unique work small; SQLite→Postgres is a config change. We optimized for algorithm proof, not throughput. |
| "What if the topology YAML is wrong/missing?" | Ranker degrades gracefully — topology is one of four weighted signals; without it, timing + centrality + severity still rank. Auto-discovery is the obvious roadmap item. |
| "Why not train a model?" | Deliberate: off-the-shelf embeddings + tunable weights deploy on day one with no training data, and the weights are interpretable. A learned ranker is the v2 once feedback data accumulates. |
| "How is this different from OpsRamp/BigPanda?" | Same problem class — that's validation. Differences: fully local/offline capable, transparent scoring (every confidence is decomposable into its four signals), and open evaluation. |
| "False positives — wrong grouping?" | Show the noise handling: DBSCAN noise points stay ungrouped by design; drill-down always exposes full membership so nothing is hidden; operator merge/split feedback (P1) corrects it. |

## Failure drills (rehearse each once)

- LLM unreachable → template summaries render; nobody notices
- Replay crashes mid-demo → restart replay at 100× to refill in seconds; keep talking over it
- Projector/laptop swap → backup video of the full demo on a phone + USB
