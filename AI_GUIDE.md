# StormLens — AI Coding Agent Guide
**Version 1.0 · July 2026 · Team ZenVerse @ Synergy 2026**

This guide is the binding constitution for all AI agents (Antigravity/Gemini, Claude Code, Cursor) and humans working on **StormLens** (Alert Correlation & Deduplication Engine, HPE Problem Statement #10). Never contradict these rules.

---

## 1. Prime Directive & Architecture Defaults

We build under hackathon constraints. The priority is to ship a working, demo-able system. 

### Stacks & Defaults
*   **Backend**: FastAPI (Python 3.12) + SQLite (SQLAlchemy ORM).
*   **Frontend**: React + Vite (TypeScript) + TailwindCSS + shadcn/ui.
*   **Real-time Streaming**: WebSockets connecting frontend to backend.
*   **Deployment**: Local-first monorepo. Single command setup.

### Directory Structure
*   `backend/`: FastAPI application (`app/ingest`, `app/correlation`, `app/rootcause`, `app/summarize`, `app/api`, `app/models`).
*   `frontend/`: React Vite application.
*   `data/`: Labeled alert datasets, scenario definitions.
*   `docs/`: PRD, Architecture, Evaluation, Demo Script.
*   `eval/`: Evaluation harness and benchmarking tools.

---

## 2. Plan-Gate Protocol (Mandatory)

*   **Touch >1 file**: You **MUST** write an implementation plan listing modified/created files, order, and acceptance tests. **Stop and wait for explicit human approval** (`approved` or `go`) before writing code.
*   **Touch 1 file**: State a one-line intent, then implement immediately.
*   **Ambiguity**: Ask exactly one clarifying question. Never guess architecture.
*   **Scope Creep**: Never expand scope. If you notice unrelated bugs/issues, list them in a `"NOTED, NOT DONE"` section at the end of your response.

---

## 3. Code Rules & Quality

*   **Type Safety**: Strict type hints in Python; strict mode + Zod schemas for all external inputs in TypeScript. No `any`.
*   **Resiliency**: Every external API or LLM call must have a timeout, 1 retry, and a mock fallback behind a `MOCK=true` env var. The demo must run with zero internet.
*   **No Rewrites**: Extend existing working code. Never rewrite/refactor working parts near deadlines.
*   **Test-Driven**: Every new endpoint/function must ship with a unit/integration test. "Done" means the test passes in the terminal, not just "code written".

---

## 4. Self-Verification Loop

Before reporting any task as completed:
1.  Run the tests or check the server status.
2.  If the task involves UI, run it in the browser, exercise the happy path, and take screenshots.
3.  Include in your final response:
    *   **What changed** (list of files).
    *   **Proof** (pasted test/run output or screenshot).
    *   **Risks** (anything potentially fragile).
    *   **Noted, Not Done** (unrelated adjacent tasks or cleanups).

---

## 5. Git Discipline & Push Protocol

### Commit Messages
Use conventional commits that state what works:
*   `feat: /route returns hospital list — demo path 2/5`
*   `fix: memory leak in alert correlation window`

### Push Rules (Non-Negotiable)
Whenever someone pushes to remote:
1.  **They MUST read/review this AI Guide.**
2.  **They MUST read/review `docs/PRD.md`, `docs/ARCHITECTURE.md`, and all other important documents under `docs/`.**
3.  **They MUST update `CHANGES.md`** in the root of the project to document the new changes.
4.  We enforce this via a git `pre-push` hook.

---

## 6. Git Hook Setup

To install the pre-push hook that enforces updates to `CHANGES.md`:

1.  Set the git hooks path to the shared `.githooks` directory:
    ```bash
    git config core.hooksPath .githooks
    ```
2.  Make the hook executable (macOS/Linux):
    ```bash
    chmod +x .githooks/pre-push
    ```
