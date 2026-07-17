from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.api import rest
from app.api.ws import broadcast, ws_endpoint
from app.ingest.replay_engine import ReplayEngine
from app.models.db import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────────
    from pipeline import pipeline

    init_db()
    pipeline.configure_scenario("db-cascade")  # default scenario
    pipeline.set_broadcast(broadcast)

    replay_engine = ReplayEngine()
    rest.init_router(pipeline, replay_engine, pipeline.topology)

    # Background tasks
    asyncio.create_task(pipeline.tick())
    asyncio.create_task(pipeline.ws_flush_loop())

    logger.info("StormLens backend started — http://localhost:8000")
    yield
    # ── Shutdown ───────────────────────────────────────────────────────────────
    from app.models.state import state

    if state.replay_status.running:
        await replay_engine.stop()
    logger.info("StormLens backend stopped")


app = FastAPI(
    title="StormLens API",
    description="Alert correlation + deduplication engine — ZenVerse Synergy 2026",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rest.router, prefix="/api")


@app.websocket("/ws/stream")
async def websocket_route(websocket: WebSocket):
    await ws_endpoint(websocket)
