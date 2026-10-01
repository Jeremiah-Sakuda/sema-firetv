"""UI prompt set: render every player prompt with the same Polly voice as the
narration and write media/prompts/prompts.json = {id: {text, audio, duration}}."""
from __future__ import annotations

import json
import re
from pathlib import Path

from .aws import Services
from .config import PIPELINE_DIR
from .render import Narrator
from .report import estimate_cost
from .workspace import PipelineError, now_iso

REQUIRED = ("welcome", "choose_level", "paused", "interrupted", "recovery_complete", "no_moment", "film_ended",
            "seek_paused", "buffering", "level_off", "level_essential", "level_standard", "level_rich",
            "text_on", "text_off", "returning", "error_video", "error_audio", "help")
PROMPT_ID = re.compile(r"^[a-z0-9_]{1,48}$")
DEFAULT_FILE = PIPELINE_DIR / "prompts.json"


def load_prompts(path: Path = DEFAULT_FILE) -> dict[str, str]:
    data = json.loads(Path(path).read_text())
    if not isinstance(data, dict):
        raise PipelineError(f"{path} must map prompt id -> text")
    bad = [k for k, v in data.items() if not PROMPT_ID.match(k) or not isinstance(v, str) or not v.strip()]
    if bad:
        raise PipelineError(f"Invalid prompt entries in {path}: {bad}")
    missing = [k for k in REQUIRED if k not in data]
    if missing:
        raise PipelineError(f"{path} is missing required prompts: {missing}")
    return {k: " ".join(v.split()) for k, v in data.items()}


def run_prompts(cfg: dict, services: Services, *, web_root: Path, prompts_file: Path = DEFAULT_FILE,
                report_dir: Path | None = None) -> dict:
    texts = load_prompts(prompts_file)
    out_dir = Path(web_root) / "media" / "prompts"
    rows: list[dict] = []
    narrator = Narrator(services, cfg, None, "prompts", usage_sink=rows)
    result = {}
    for pid, text in texts.items():
        out = narrator.synthesize(text, out_dir / f"{pid}.mp3")
        result[pid] = {"text": text, "audio": f"media/prompts/{pid}.mp3", "duration": out["duration"]}
    (out_dir / "prompts.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    meta = {"generatedAt": now_iso(), "mode": services.mode, "voice": narrator.voice, "count": len(result),
            "characters": sum(r["characters"] for r in rows), "output": str(out_dir / "prompts.json"),
            "estimatedCost": estimate_cost(rows, cfg["prices"])}
    if report_dir:
        report_dir.mkdir(parents=True, exist_ok=True)
        (report_dir / "prompts-report.json").write_text(json.dumps(meta, indent=2) + "\n")
    return {"prompts": result, "meta": meta}
