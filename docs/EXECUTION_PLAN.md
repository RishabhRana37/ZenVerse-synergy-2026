# StormLens — Execution Plan

Timeline anchors: **Round 1 (online idea screening) July 20** · **Grand Finale (on-campus, 24-hr build + demo) July 31**.

Strategy: prove the risky part (correlation quality) FIRST, on labeled data, before any UI work. If the core doesn't measure well by Day 4, we drop to the fallback correlator (see ARCHITECTURE.md §4) — no panic, planned lever.

---

## Team roles (4 members)

| Role | Owns | Deliverables |
|---|---|---|
| **A — Correlation lead** | Embedder, correlator, clustering tuning | Working clusterer hitting eval targets |
| **B — Backend/data lead** | Ingestion, normalizer, replay engine, datasets, storage, API | Replayable labeled datasets through a stable API |
| **C — Frontend lead** | War room, drill-down, eval dashboard | The 5-second-wow split screen |
| **D — Intelligence/eval lead** | Root-cause ranker, topology, LLM summarizer, eval harness | Root-cause Hit@k numbers + incident briefs |

Rule: **A and B start immediately; C mocks against fixture JSON until Day 3 so frontend never blocks on backend.**

## Phase 1 — Prove the core (July 14–17)

| Day | A (correlation) | B (backend/data) | C (frontend) | D (intel/eval) |
|---|---|---|---|---|
| **14** | Env setup; embed sample alerts; template extraction spike | Download AIOps Challenge + Loghub; canonical schema; parser for one dataset | Vite scaffold; war-room layout with fixture data | Eval harness skeleton; metrics definitions; topology YAML format |
| **15** | Distance function + DBSCAN over static labeled batch | Replay engine (file → timed stream); SQLite models | Raw-stream panel with fake streaming | Ground-truth loader; scoring functions (ARI, purity, Hit@k) |
| **16** | First measured run: clusters vs labels; start weight tuning | Webhook ingest + WebSocket push; wire pipeline end-to-end | Incident cards + live counters (still fixtures) | Root-cause ranker v1 (topology + precedence) |
| **17** | **CHECKPOINT: eval numbers reviewed by whole team** — continue tuning or pull fallback lever | Second dataset parsed; synthetic storm generator v0 | Connect to real WebSocket; kill fixtures | Ranker measured (Hit@1/Hit@3); LLM summarizer + fallback templates |

**Gate (evening July 17):** compression ≥ 90%, purity ≥ 0.7, Hit@3 ≥ 70% on at least one labeled scenario. Below gate → fallback correlator becomes primary, semantic layer becomes tiebreaker.

## Phase 2 — Round 1 package (July 18–20)

- **18:** End-to-end demo run on one polished scenario; drill-down view; eval dashboard page; record a 2–3 min screen capture as backup
- **19:** Round 1 submission package: PRD + architecture + measured results + demo video/screenshots. Rehearse the pitch. Fix top-3 ugliest things.
- **20:** **Round 1 submission.** Buffer day otherwise.

Round 1 pitch skeleton: problem (alert storms cost $5,600/min) → demo clip (2,000 → 3) → the measured-accuracy slide (our differentiator: numbers on labeled ground truth) → architecture in one diagram → why HPE cares (OpsRamp domain).

## Phase 3 — Harden & rehearse (July 21–30)

Priorities in order:
1. **Second + third demo scenario** (different failure types: DB cascade, network partition, rolling-deploy regression) — proves generality
2. **Dependency-graph visualization** with propagation path highlighted (the drill-down wow)
3. P1 features only if green: synthetic storm live-generation on stage, feedback loop, notification digest
4. **Finale rehearsals (July 27–30): full rebuild drills.** The finale is billed as a 24-hr on-campus build — confirm with organizers what may be pre-built. Worst case (from scratch): every member must be able to rebuild their component from memory; modular stage design exists for exactly this. Target: full system reassembly in < 12 hrs, leaving 12 for polish + rehearsal.

## Phase 4 — Finale (July 31)

- Hours 0–12: rebuild per rehearsed drill (or integrate/polish if pre-build allowed)
- Hours 12–18: run all three scenarios; regenerate eval numbers live; pre-generate LLM summaries for the rehearsed scenario as fallback
- Hours 18–24: demo rehearsal ×3 (script: `DEMO_SCRIPT.md`), sleep in shifts
- Demo laptop: everything local (embeddings, datasets, SQLite). Optional LLM call is the ONLY network dependency and has a fallback. Test on venue Wi-Fi assumption: none.

## Standing rules

- Eval numbers are re-run after every correlator change — no "it seems better"
- `main` always demoable; feature branches for everything
- Any member blocked > 2 hrs raises it in the group immediately
- Every day ends with a 10-min sync: numbers, blockers, next day's single priority
