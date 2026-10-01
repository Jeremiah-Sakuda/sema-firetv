"""Local ffmpeg/ffprobe helpers. No network, no cost."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"


class MediaError(RuntimeError):
    pass


def _run(args: list[str], capture_stderr: bool = False) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE if capture_stderr else subprocess.DEVNULL)
    except FileNotFoundError as exc:
        raise MediaError(f"{args[0]} not found; install ffmpeg (brew install ffmpeg)") from exc
    except subprocess.CalledProcessError as exc:
        raise MediaError(f"{Path(args[0]).name} failed: {(exc.stderr or '')[-800:]}") from exc


def sha256(path: Path, chunk: int = 1 << 20) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while block := handle.read(chunk):
            digest.update(block)
    return digest.hexdigest()


def probe(path: Path) -> dict:
    out = _run([FFPROBE, "-v", "error", "-show_entries",
                "format=duration,format_name:stream=codec_type,codec_name,width,height,sample_rate",
                "-of", "json", str(path)]).stdout
    data = json.loads(out)
    video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    audio = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), {})
    return {
        "duration": round(float(data["format"]["duration"]), 3),
        "format": data["format"].get("format_name"),
        "videoCodec": video.get("codec_name"),
        "width": video.get("width"),
        "height": video.get("height"),
        "audioCodec": audio.get("codec_name"),
        "audioSampleRate": audio.get("sample_rate"),
    }


def measure_duration(path: Path) -> float:
    """True rendered duration in seconds (ffprobe container duration)."""
    out = _run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(path)]).stdout.strip()
    try:
        value = float(out)
    except ValueError as exc:
        raise MediaError(f"ffprobe returned no duration for {path}") from exc
    if value <= 0:
        raise MediaError(f"Non-positive duration for {path}")
    return round(value, 6)


_PTS = re.compile(r"pts_time:\s*([0-9.]+)")


def parse_showinfo_times(stderr: str) -> list[float]:
    return [float(m.group(1)) for line in stderr.splitlines()
            if "Parsed_showinfo" in line for m in [_PTS.search(line)] if m]


def detect_scene_changes(path: Path, threshold: float) -> list[float]:
    """Shot-change timestamps via select='gt(scene,T)',showinfo."""
    proc = _run([FFMPEG, "-hide_banner", "-nostats", "-i", str(path), "-filter:v",
                 f"select='gt(scene,{threshold})',showinfo", "-an", "-f", "null", "-"], capture_stderr=True)
    return parse_showinfo_times(proc.stderr)


_SIL_START = re.compile(r"silence_start:\s*(-?[0-9.]+)")
_SIL_END = re.compile(r"silence_end:\s*(-?[0-9.]+)")


def parse_silencedetect(stderr: str, duration: float) -> list[tuple[float, float]]:
    spans, start = [], None
    for line in stderr.splitlines():
        if m := _SIL_START.search(line):
            start = max(0.0, float(m.group(1)))
        elif (m := _SIL_END.search(line)) and start is not None:
            spans.append((round(start, 3), round(min(duration, float(m.group(1))), 3)))
            start = None
    if start is not None:
        spans.append((round(start, 3), round(duration, 3)))
    return spans


def detect_silence(path: Path, noise_db: float, min_seconds: float, duration: float) -> list[tuple[float, float]]:
    proc = _run([FFMPEG, "-hide_banner", "-nostats", "-i", str(path), "-af",
                 f"silencedetect=noise={noise_db}dB:d={min_seconds}", "-vn", "-f", "null", "-"],
                capture_stderr=True)
    return parse_silencedetect(proc.stderr, duration)


def has_audio(path: Path) -> bool:
    return bool(probe(path).get("audioCodec"))


def extract_audio_m4a(src: Path, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    _run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-vn", "-ac", "1",
          "-c:a", "aac", "-b:a", "96k", str(dest)])
    return dest


def extract_frames(src: Path, fps: float, outdir: Path, width: int = 640) -> list[tuple[float, Path]]:
    """Sample frames at `fps`; returns [(timestamp_seconds, jpeg_path)]."""
    outdir.mkdir(parents=True, exist_ok=True)
    for old in outdir.glob("frame_*.jpg"):
        old.unlink()
    _run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-vf",
          f"fps={fps},scale={width}:-2", "-q:v", "4", str(outdir / "frame_%05d.jpg")])
    frames = sorted(outdir.glob("frame_*.jpg"))
    return [(round(i / fps, 3), p) for i, p in enumerate(frames)]
