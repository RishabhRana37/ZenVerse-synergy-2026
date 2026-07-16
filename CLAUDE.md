# StormLens - Claude Code Instructions

## Build Commands
- **Backend Setup**: `cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -e ".[dev]" && python scripts/fetch_model.py`
- **Frontend Setup**: `cd frontend && npm install`

## Run Commands
- **Backend Server**: `cd backend && .venv\Scripts\activate && uvicorn app.api.main:app --reload`
- **Frontend Server**: `cd frontend && npm run dev`

## Test Commands
- **Backend Tests**: `cd backend && .venv\Scripts\activate && python -m pytest`

## Formatting and Linting
- **Backend Format/Lint**: `cd backend && .venv\Scripts\activate && ruff check . && ruff format .`

## Code Style & Architecture
- **Backend**: FastAPI, strictly typed, `app/` modules, single `process()` entry points per stage. Uses SQLite.
- **Frontend**: React + Vite, real-time WebSocket connection to backend.
- **Rule**: All models must be strictly defined in `app/models/schema.py`. No external LLM dependencies except where explicitly noted in the summarizer.
