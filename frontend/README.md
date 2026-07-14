# frontend — React + Vite + TypeScript war room

Views (spec: `docs/ARCHITECTURE.md` §8, demo flow: `docs/DEMO_SCRIPT.md`):

1. **War Room** (`src/views/`) — split screen: raw alert stream (left) vs incident cards (right), live counters top bar. This is the demo. Optimize for the 5-second wow.
2. **Incident drill-down** — cluster members, ranked root-cause candidates with confidence, dependency graph with propagation path highlighted, LLM summary.
3. **Eval dashboard** — metrics table from `GET /eval/results`.

Rules:
- Develop against fixture JSON (`src/fixtures/`) until the backend WebSocket is live (Day 3) — never block on backend
- Data via WebSocket `/ws/stream` (alerts + incident updates) and REST for queries
- Incident cards must UPDATE in place (stable incident IDs) — no flicker
- `npm run build` (strict TS) must pass before every commit
