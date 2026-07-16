from __future__ import annotations

import asyncio
import csv
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Coroutine

from app.models.schema import ReplayStatus
from app.models.state import state

logger = logging.getLogger(__name__)


class ReplayEngine:
    """
    Streams historical alert datasets at configurable speed multiplier.
    Supports JSONL and CSV formats from data/samples/ and data/raw/.
    """

    DATA_DIR = Path(__file__).parent.parent.parent / "data"

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    async def start(
        self,
        dataset: str,
        speed: float = 1.0,
        scenario: str = "db-cascade",
        pipeline_ingest_fn: Callable | None = None,
    ) -> None:
        """Start replay. Stops any running replay first."""
        if self._task and not self._task.done():
            await self.stop()

        self._stop_event.clear()
        state.replay_status = ReplayStatus(
            running=True, dataset=dataset, scenario=scenario, speed=speed
        )
        self._task = asyncio.create_task(
            self._stream_loop(dataset, speed, pipeline_ingest_fn)
        )

    async def stop(self) -> None:
        """Stop the current replay gracefully."""
        self._stop_event.set()
        if self._task and not self._task.done():
            try:
                await asyncio.wait_for(self._task, timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                self._task.cancel()
        state.replay_status.running = False

    async def reset(self) -> None:
        """Stop replay AND clear all pipeline state."""
        await self.stop()
        state.reset()
        logger.info("ReplayEngine: full state reset")

    # ── Internal stream loop ───────────────────────────────────────────────────

    async def _stream_loop(
        self,
        dataset: str,
        speed: float,
        ingest_fn: Callable | None,
    ) -> None:
        alerts = list(self._load_dataset(dataset))
        if not alerts:
            logger.warning("ReplayEngine: no alerts found for dataset '%s'", dataset)
            state.replay_status.running = False
            return

        total = len(alerts)
        logger.info("ReplayEngine: replaying %d alerts at %.1f× speed", total, speed)

        for i, raw in enumerate(alerts):
            if self._stop_event.is_set():
                break

            # Real-time pacing: wait proportional to inter-alert gap
            if i > 0:
                prev_epoch = alerts[i - 1].get("_ts_epoch", 0.0)
                curr_epoch = raw.get("_ts_epoch", 0.0)
                gap_secs = max(0.0, (curr_epoch - prev_epoch) / speed)
                if gap_secs > 0:
                    try:
                        await asyncio.wait_for(self._stop_event.wait(), timeout=gap_secs)
                        break  # stop event fired mid-wait
                    except asyncio.TimeoutError:
                        pass

            if ingest_fn:
                source = f"replay:{dataset}"
                await ingest_fn(raw, source)

            state.replay_status.progress = round((i + 1) / total, 4)

        state.replay_status.running = False
        logger.info("ReplayEngine: replay complete")

    # ── Dataset loaders ────────────────────────────────────────────────────────

    def _load_dataset(self, dataset: str):
        """Load alerts from data/samples/ or data/raw/. Supports JSONL and CSV."""
        for subdir in ("samples", "raw"):
            for ext, loader in ((".jsonl", self._read_jsonl), (".csv", self._read_csv)):
                path = self.DATA_DIR / subdir / f"{dataset}{ext}"
                if path.exists():
                    logger.info("ReplayEngine: loading %s", path)
                    yield from loader(path)
                    return
        logger.warning("ReplayEngine: dataset '%s' not found in data/", dataset)

    def _read_jsonl(self, path: Path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    obj["_ts_epoch"] = self._to_epoch(
                        obj.get("timestamp") or obj.get("ts")
                    )
                    yield obj
                except json.JSONDecodeError:
                    continue

    def _read_csv(self, path: Path):
        with open(path, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                row["_ts_epoch"] = self._to_epoch(
                    row.get("timestamp") or row.get("ts")
                )
                yield dict(row)

    @staticmethod
    def _to_epoch(value: Any) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            # Try fromisoformat first (handles +00:00 timezone offsets natively)
            try:
                dt = datetime.fromisoformat(value)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.timestamp()
            except ValueError:
                pass
            # Fallback: manual strptime patterns
            for fmt in (
                "%Y-%m-%dT%H:%M:%S.%fZ",
                "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d %H:%M:%S",
            ):
                try:
                    return (
                        datetime.strptime(value, fmt)
                        .replace(tzinfo=timezone.utc)
                        .timestamp()
                    )
                except ValueError:
                    continue
        return 0.0

