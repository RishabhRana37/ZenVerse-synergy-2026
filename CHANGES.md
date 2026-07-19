# StormLens — Changelog (CHANGES.md)

All notable changes to the StormLens project will be documented in this file. Before pushing any changes, ensure this file is updated and that you have reviewed `AI_GUIDE.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, and all other important documents under `docs/`.

---

## [Unreleased]

### Added
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
