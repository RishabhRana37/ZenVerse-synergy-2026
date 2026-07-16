# StormLens AI Agent Rules

## Running & Testing the Backend
When you need to interact with the backend code:
- **Directory**: Always `cd backend`
- **Virtual Environment**: Use `.venv`. On Windows: `.venv\Scripts\activate` (or invoke via `python -m`)
- **Tests**: `python -m pytest`
- **Server**: `uvicorn app.api.main:app --reload`
- **Lint/Format**: `ruff check .` and `ruff format .`

## Running the Frontend
When you need to interact with the frontend code:
- **Directory**: Always `cd frontend`
- **Install**: `npm install`
- **Dev Server**: `npm run dev`
