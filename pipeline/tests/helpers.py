from __future__ import annotations

import os
import subprocess
from pathlib import Path

os.environ["SEMA_FORBID_LIVE"] = "1"

PIPELINE_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_DIR.parent
FIXTURES = PIPELINE_DIR / "tests" / "fixtures"
REPLAY = FIXTURES / "red-envelope"
FIXTURE_MP4 = PROJECT_ROOT / "media" / "fixture" / "film.mp4"
VALIDATOR = PROJECT_ROOT / "tools" / "validate.js"


def make_tone(path: Path, seconds: float) -> Path:
    """Short local test mp3 (ffmpeg sine) - never macOS `say`."""
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    f"sine=frequency=330:sample_rate=24000:duration={seconds}", "-ac", "1", "-c:a", "libmp3lame",
                    "-b:a", "48k", str(path)], check=True)
    return path


def node_validate(package_path: Path, fixture: bool = False) -> subprocess.CompletedProcess:
    args = ["node", str(VALIDATOR), str(package_path)] + (["--fixture"] if fixture else [])
    return subprocess.run(args, capture_output=True, text=True)
