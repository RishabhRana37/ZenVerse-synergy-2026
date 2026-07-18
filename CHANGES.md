# StormLens — Changelog (CHANGES.md)

All notable changes to the StormLens project will be documented in this file. Before pushing any changes, ensure this file is updated and that you have reviewed `AI_GUIDE.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, and all other important documents under `docs/`.

---

## [Unreleased]

### Added
*   Operational Guidelines (Version 2.0 Updates) in `AI_GUIDE.md`.
*   Event-time based alert eviction in backend `state.py` to fix memory leak.
*   Asynchronous database writer loop with batch transaction queue in `pipeline.py` to resolve SQLite write contention.
*   Concurrency lock guards in `pipeline.py` and `rest.py` to prevent race conditions during pipeline ticks and replay resets.
*   Comprehensive unit and integration test coverage for the incident reconciler and REST API.
*   Vite/React/TypeScript ESLint configuration file for frontend to run and pass CI lint checks.

### Fixed
*   Backend API ingestion parsing of list/dict payloads using FastAPI `Body`.
*   Conditional Hook calls and unused eslint-disable comments in frontend code.
*   Windows console encoding crash in evaluation benchmark prints.
*   Formatted Python files using ruff to clean up lint issues.

### Added (Original)
*   `AI_GUIDE.md` defining strict guidelines for AI agents and human developers working on StormLens.
*   `CHANGES.md` (this file) to document repository modifications.
*   Git `pre-push` hook under `.githooks/pre-push` to enforce changelog updates and guidelines adherence.
*   Instructions for running local backend (`uvicorn`) and frontend (`vite`) servers.
*   Formatted backend Python codebase and cleaned up import styling.
