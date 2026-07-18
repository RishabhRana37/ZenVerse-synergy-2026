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

---

## 7. Operational Guidelines (Version 2.0 Updates)

### 7.1 Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.
Before implementing:
- State your assumptions explicitly.
- If uncertain, ask. If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 7.2 Simplicity First
Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
*Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.*

### 7.3 Surgical Changes
Touch only what you must. Clean up only your own mess.
When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
*The test: Every changed line should trace directly to the user's request.*

### 7.4 Goal-Driven Execution
Define success criteria. Loop until verified.
Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan and verify each step before moving on.

### 7.5 Commits — STRICT RULES
- DO NOT add Co-Authored-By trailers to commit messages.
- DO NOT add "Generated with Claude Code" footers.
- DO NOT mention Claude, Anthropic, AI, or any model name in commit messages.
- Commits should read as if written by the human author. No attribution to AI.
- Keep commit messages factual: what changed and why. No emojis unless the user explicitly asks.
*If the user explicitly requests an attribution line, follow their wording exactly — but never add one by default.*

### 7.6 Pull Requests
- Same rule as commits: no AI attribution, no Co-Authored-By.
- PR body should focus on the change itself, not who wrote it.

### 7.7 Code Style
- Match the existing style of the file you're editing. Don't reformat unrelated lines.
- Don't add comments like "// Added by Claude" or "# AI-generated".
- Comments should explain WHY non-obvious decisions were made, not narrate what the code does.
- **Backend**: always run `ruff check .` and `ruff format .` before committing. CI enforces both.
- **Frontend**: run `npm run build` (TypeScript strict) before committing. All type errors must be zero.

### 7.8 Scope Discipline
- Do only what the user asked. Don't refactor adjacent code unless explicitly requested.
- If you spot a bug or improvement out of scope, mention it briefly at the end of your reply — don't silently fix it.

### 7.9 Implementation vs. Recommendation
- When the user says "tell me" or "what changes are needed" — write up the changes, do not implement them.
- When the user says "implement", "do it", "fix it", or "code it" — implement directly.
- When ambiguous, default to writing up first and ask.

### 7.10 Verifying Work
- Before reporting work as done, verify with `git status` / `git diff` that the changes actually landed.
- Do not claim a commit is pushed without confirming with `git push` output.
- Run CI checks locally before pushing: `ruff check .` + `pytest tests -q` for backend; `npm run build` for frontend.

### 7.11 Destructive Actions
- Never run `git reset --hard`, `git push --force`, or delete files/branches without the user's explicit go-ahead.
- Never modify `.env`, secrets, or credentials files.
