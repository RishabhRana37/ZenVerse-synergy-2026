# StormLens

**From 2,000 alerts to 3 answers.**

Alert Correlation & Deduplication Engine — Team ZenVerse @ Synergy 2026 (HPE Problem Statement #10).

## The Problem

During a significant infrastructure incident, monitoring systems generate hundreds or thousands of alerts within minutes. Almost all of them are downstream symptoms of a single root cause. On-call engineers waste the most critical minutes of an incident scrolling through noise instead of fixing the actual failure.

## What StormLens Does

StormLens ingests a raw alert stream and, in real time:

1. **Correlates** — groups temporally and semantically related alerts into incident clusters
2. **Identifies root cause** — ranks the most likely root-cause alert within each cluster using topology, timing, and severity signals, with a confidence score
3. **Suppresses noise** — collapses derivative alerts out of the primary view (still available in drill-down)
4. **Summarizes** — generates a one-paragraph incident brief and recommended first action via LLM

The result: an on-call engineer sees **3 incident cards instead of 2,000 alerts**, each answering "what broke, how bad, what do I do first."

## The Demo

Side-by-side war room view:

- **Left panel**: the raw alert stream, flooding in real time (replayed from labeled datasets at accelerated speed)
- **Right panel**: StormLens's correlated view — a handful of incident cards, each with a root-cause alert, confidence score, blast radius, and LLM-generated summary

Measured on labeled ground truth (AIOps Challenge dataset): compression ratio, cluster accuracy, and root-cause hit rate. Numbers, not vibes.

## Architecture (high level)

```
                        ┌─────────────────────────────────────────────┐
                        │                  BACKEND (FastAPI)          │
                        │                                             │
 Alert Sources ───────► │  Ingest ─► Normalize ─► Embed ─► Correlate  │
 (dataset replay,       │                                    │        │
  webhook, synthetic    │              Root-Cause Ranker ◄───┘        │
  storm generator)      │                     │                       │
                        │              LLM Summarizer                 │
                        │                     │                       │
                        │            SQLite + WebSocket push          │
                        └─────────────────────┬───────────────────────┘
                                              │
                        ┌─────────────────────▼───────────────────────┐
                        │        FRONTEND (React + Vite)              │
                        │   War Room: raw stream ◄─vs─► incidents     │
                        │   Incident drill-down · Eval dashboard      │
                        └─────────────────────────────────────────────┘
```

Full details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Repository Map

| Path | Purpose |
|---|---|
| `docs/PRD.md` | Product requirements — what we build and why |
| `docs/ARCHITECTURE.md` | Technical design — pipeline, algorithms, data model, API |
| `docs/EXECUTION_PLAN.md` | Timeline, milestones, and per-member task split |
| `docs/DEMO_SCRIPT.md` | Minute-by-minute finale demo script |
| `docs/EVALUATION.md` | Metrics and evaluation methodology |
| `docs/DATASETS.md` | Datasets, download links, and preprocessing notes |
| `backend/` | FastAPI service — ingestion, correlation, root-cause, summarization |
| `frontend/` | React war-room UI |
| `data/` | Raw datasets, curated samples, synthetic storm scenarios |
| `backend/eval/` | Evaluation harness, ablations, benchmarks, and committed results |
| `scripts/` | Dataset download, replay, and utility scripts |

## Team ZenVerse

Synergy 2026 · Dept. of CSE, Manipal University Jaipur · Industry Partner: HPE

## Getting Started

To run StormLens locally, you'll need two terminal windows.

### 1. Backend
Navigate to the `backend/` directory and create a virtual environment:
```bash
cd backend
python -m venv .venv

# Activate on Windows:
.venv\Scripts\activate
# Activate on macOS/Linux:
# source .venv/bin/activate

pip install -e ".[dev]"
python scripts/fetch_model.py
uvicorn app.api.main:app --reload
```

### 2. Frontend
In a separate terminal, navigate to the `frontend/` directory:
```bash
cd frontend
npm install
npm run dev
```

## Status

- [x] Problem statement selected (PS #10)
- [x] PRD & architecture
- [x] Correlation engine core
- [x] Root-cause ranking
- [x] War-room UI
- [x] Evaluation on labeled data (aiops-scn1: Hit@1 92.3%, Hit@3 100%, purity 100% — reproducible via `backend/eval/harness.py`)
- [x] Round 1 submission (July 20)
- [ ] Grand Finale (July 31)
