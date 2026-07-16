# backend — FastAPI service

Pipeline stages live in `app/`, one package per stage (see `docs/ARCHITECTURE.md` §2 for the spec each must implement):

| Package | Stage | Owner |
|---|---|---|
| `app/ingest/` | Webhook endpoint, replay engine, normalizer + Drain3 template miner, fingerprint deduplicator | B |
| `app/correlation/` | Embedder (model2vec, template-cached), distance function, DenStream + DBSCAN clusterers | A |
| `app/rootcause/` | Topology loader, ranking scorer, confidence | D |
| `app/summarize/` | LLM adapter + template fallback | D |
| `app/api/` | REST routes + WebSocket stream | B |
| `app/models/` | Canonical schema (Alert, IncidentCluster, Topology) + SQLAlchemy | B |

Rules:
- Each stage = one class with a single `process()` entry point, composed in a top-level `pipeline.py`
- Everything must run offline on one laptop; the LLM call is the only permitted network dependency and must have a fallback
- `ruff check .` + `ruff format .` before every commit; tests in `tests/` per stage

## Running the Backend

1. **Set up the virtual environment and install dependencies** (from the `backend/` directory):
   ```bash
   python -m venv .venv
   
   # Activate on Windows:
   .venv\Scripts\activate
   # Activate on macOS/Linux:
   # source .venv/bin/activate
   
   pip install -e ".[dev]"
   ```

2. **Download the embedding model** (first-time setup):
   ```bash
   python scripts/fetch_model.py
   ```

3. **Start the API Server**:
   ```bash
   uvicorn app.api.main:app --reload
   ```

4. **Run the Test Suite** (optional):
   ```bash
   pytest
   ```
