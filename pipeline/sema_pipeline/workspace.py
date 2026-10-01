"""Per-asset working directory, state files, stage timings and the usage ledger."""
from __future__ import annotations

import json
import re
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import PIPELINE_DIR

ASSET_ID = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


class PipelineError(RuntimeError):
    """A user-facing failure; the CLI prints it and exits non-zero."""


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def check_asset_id(asset: str) -> str:
    if not ASSET_ID.match(asset or ""):
        raise PipelineError(f"Asset id '{asset}' must match {ASSET_ID.pattern} (it becomes a web path segment).")
    return asset


class Workspace:
    def __init__(self, asset: str, root: Path | None = None):
        self.asset = check_asset_id(asset)
        self.root = Path(root) if root else PIPELINE_DIR / "work"
        self.dir = self.root / asset
        self.dir.mkdir(parents=True, exist_ok=True)

    # -- files -----------------------------------------------------------
    def path(self, *parts: str) -> Path:
        p = self.dir.joinpath(*parts)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def exists(self, name: str) -> bool:
        return (self.dir / name).is_file()

    def read(self, name: str, default=None):
        p = self.dir / name
        if not p.is_file():
            if default is not None:
                return default
            raise PipelineError(f"{p} is missing. Run the earlier stage first (see `python -m sema_pipeline status`).")
        return json.loads(p.read_text())

    def write(self, name: str, data) -> Path:
        p = self.path(name)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        tmp.replace(p)
        return p

    # -- freshness ---------------------------------------------------------
    CHAIN = ("manifest.json", "analysis.json", "observations.json", "script.json", "render.json")

    def stale_inputs(self, upto: str) -> list[str]:
        """Pairs in the stage chain (up to and including `upto`) where a file is older than its upstream."""
        chain = self.CHAIN[: self.CHAIN.index(upto) + 1]
        problems = []
        for upstream, downstream in zip(chain, chain[1:]):
            up, down = self.dir / upstream, self.dir / downstream
            if up.is_file() and down.is_file() and down.stat().st_mtime < up.stat().st_mtime:
                problems.append(f"{downstream} is older than {upstream}")
        return problems

    # -- run log ---------------------------------------------------------
    @property
    def stub_root(self) -> Path:
        return self.root / "_stub"

    @property
    def recorded_dir(self) -> Path:
        return self.dir / "recorded"

    def run_log(self) -> dict:
        return self.read("run.json", default={"asset": self.asset, "stages": {}})

    @contextmanager
    def stage(self, name: str, mode: str):
        log = self.run_log()
        started = time.monotonic()
        entry = {"startedAt": now_iso(), "mode": mode, "status": "running"}
        log["stages"][name] = entry
        self.write("run.json", log)
        try:
            yield entry
        except BaseException as exc:
            entry.update(status="failed", error=str(exc)[:500], seconds=round(time.monotonic() - started, 3),
                         endedAt=now_iso())
            log = self.run_log()
            log["stages"][name] = entry
            self.write("run.json", log)
            raise
        entry.update(status="done", seconds=round(time.monotonic() - started, 3), endedAt=now_iso())
        log = self.run_log()
        log["stages"][name] = entry
        self.write("run.json", log)

    # -- usage ledger ----------------------------------------------------
    def record_usage(self, **entry) -> None:
        entry.setdefault("at", now_iso())
        with open(self.path("usage.jsonl"), "a") as handle:
            handle.write(json.dumps(entry) + "\n")

    def usage(self) -> list[dict]:
        p = self.dir / "usage.jsonl"
        if not p.is_file():
            return []
        # Cumulative on purpose: a rerun of a stage is real spend and stays counted.
        return [json.loads(line) for line in p.read_text().splitlines() if line.strip()]
