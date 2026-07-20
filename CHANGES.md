# StormLens — Changelog (CHANGES.md)

All notable changes to the StormLens project will be documented in this file. Before pushing any changes, ensure this file is updated and that you have reviewed `AI_GUIDE.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, and all other important documents under `docs/`.

---

## [Unreleased]

### Fixed
*   `docs/PRD.md` latency row still cited the pre-`bench.py`-fix numbers (db-cascade 63ms, aiops-scn1 p50 3.0s/p95 6.1s) that were invalidated by the hardcoded-scenario bug fixed earlier this session. Updated to the corrected, reproducible figures (db-cascade p50/p95 1.7s n=4; aiops-scn1 p50 157ms/p95 578ms n=305).
*   `README.md` Status checklist still showed the correlation engine, root-cause ranking, war-room UI, and evaluation as not-done — all are built and measured. Repository Map pointed at the empty root `eval/` stub instead of the real `backend/eval/`.

*   **Eval accuracy drift**: `backend/pyproject.toml` used unpinned `>=` dependency floors with no lockfile, letting `model2vec` drift to a newer installed version between eval runs and silently flip ranking on 2 near-tie faults — regressing Hit@1 on aiops-scn1 from a stale committed 96.15% to a reproducible 92.31% with zero code change. Pinned every backend dependency to its exact installed version and regenerated all `backend/eval/results/*.json` under the pinned versions (current, reproducible figures: aiops-scn1 compression 60.22%, purity 100%, ARI 0.3488, Hit@1 92.31%, Hit@3 100%; db-cascade compression 92.86%, purity 100%, Hit@1 100%, Hit@3 100%). Not tuning the ranker to push Hit@1 back above the stale figure — the 2 misses are genuine same-service near-ties and "fixing" them would mean overfitting to the exact held-out test set being reported to judges.
*   **`backend/eval/bench.py` hardcoded scenario bug**: `run_bench()` hardcoded `"db-cascade"` for both `pipeline.configure_scenario()` and the replay's `scenario=` regardless of the `--dataset` CLI argument, so every historical non-db-cascade latency benchmark (including all prior aiops-scn1 figures) was silently measuring the pipeline running against db-cascade's tiny 7-node topology and looser eps=0.35. Added a `--scenario` argument (defaults from `--dataset`) and re-ran both benchmarks: aiops-scn1 is now measured correctly for the first time (p50 157ms / p95 578ms, n=305, PASS) — dramatically better than the previously-reported figures, which were never valid. db-cascade (p50=p95=1718ms, n=4) is small-sample/cold-start-dominated since the scenario only produces ~4 incidents; still a clean PASS against the 5000ms target.
*   Eval dashboard hero stat had regressed back to hardcoding `'db-cascade'` / `'DenStream (streaming)'` (a label that never matches the real backend label `'DenStream'`), permanently breaking the hero counters — a regression of an earlier fix, reverted when the `frontend-dev` branch merge pulled in a stale parallel copy of `EvalDashboard.tsx`. Restored to key off `'aiops-scn1'` / `'Full-system'`.
*   `frontend/src/features/eval/eval-results.fallback.json` contained entirely fabricated placeholder numbers, including a `multi-fault` scenario that doesn't exist anywhere in the repo. Replaced with the real regenerated eval/bench results so a backend hiccup during the demo can no longer show judges fake numbers.
*   Eval dashboard hero counters (the large Compression/Purity/ARI/Hit@1/Hit@3 numbers) sat permanently at 0% because they were seeded only via a scroll-triggered `onViewportEnter` / `whileInView` animation, which can fail to fire (e.g. a backgrounded or inactive tab at demo time), leaving the headline metrics blank while the table below showed the real values. Now seeded directly from a `useEffect` on data load, independent of the IntersectionObserver trigger, so the hero always reflects the loaded numbers.

### Added
*   Lens view: 6 canvas physics layers — comet trails, gravity-well spawn shockwaves, inter-incident service overlap arcs, storm surge mode, gravitational vector field, and spacebar freeze/inspect mode. Cherry-picked from `feature/lens-physics-and-resolve-all`, dropping that branch's own duplicate "Resolve All" implementation (main already has one, merged from `frontend-dev`).
*   Merged `frontend-dev`: Graphite/Amber/Teal retheme, cinematic landing page, global Command Palette, Presentation Mode, Time Machine scrub cursor, and "Resolve All" incidents action — reconciled against `main`'s backend-adjacent fixes (alert dedup on batch apply, cluster_id propagation on incident create/update, AudioContext autoplay guard, concurrency lock guards, centralized demo dataset/speed state) so neither side's work was lost.
*   Operational Guidelines (Version 2.0 Updates) in `AI_GUIDE.md`.
*   Logging on 4 previously-silent `except Exception` blocks (`rest.py` eval-file parsers, `ws.py` broadcast-send failure, `denstream_clusterer.py` predict_one guard) — visibility only, no behavior change.
*   Event-time based alert eviction in backend `state.py` to fix memory leak.
*   Asynchronous database writer loop with batch transaction queue in `pipeline.py` to resolve SQLite write contention.
*   Concurrency lock guards in `pipeline.py` and `rest.py` to prevent race conditions during pipeline ticks and replay resets.
*   Comprehensive unit and integration test coverage for the incident reconciler and REST API.
*   Vite/React/TypeScript ESLint configuration file for frontend to run and pass CI lint checks.

### Fixed
*   Eval dashboard displayed a stale Hit@1 (92.3% instead of 96.2%) because `/eval/results` overwrote per-ablation rows in filename-sort order instead of comparing timestamps, letting an older result file silently win.
*   Backend API ingestion parsing of list/dict payloads using FastAPI `Body`.
*   Conditional Hook calls and unused eslint-disable comments in frontend code.
*   Windows console encoding crash in evaluation benchmark prints.
*   Formatted Python files using ruff to clean up lint issues.
*   Lens view particle physics syncing bug where particles ignored gravity wells in Live Mode.
*   Duplicate React Keys warning caused by lack of deduplication during replay restarts.
*   AudioContext autoplay warning caused by missing user interaction guard.
*   React Router v7 future flag warnings in App.tsx.

### Removed
*   `frontend/src/mock/mock-ws-server.ts` — unfinished mock WebSocket client from before the real backend existed, never wired to anything.
*   `frontend/src/components/ui/CommandPalette.tsx` — dead re-export shim left over from a merge; the real component lives at `features/palette/CommandPalette.tsx` and was already imported directly.

### Added (Original)
*   `AI_GUIDE.md` defining strict guidelines for AI agents and human developers working on StormLens.
*   `CHANGES.md` (this file) to document repository modifications.
*   Git `pre-push` hook under `.githooks/pre-push` to enforce changelog updates and guidelines adherence.
*   Instructions for running local backend (`uvicorn`) and frontend (`vite`) servers.
*   Formatted backend Python codebase and cleaned up import styling.
