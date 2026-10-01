"""Stage 3 - observe: Amazon Nova (Bedrock Converse) watches the film and logs
timestamped visual events plus stable character references.

Two input modes:
* video (default): one Converse call with a video block (S3 URI or inline bytes).
  Nova samples video frames itself (roughly 1 fps for short clips), so an action
  shorter than the sampling interval can be missed.
* frames (--frames N): ffmpeg extracts N frames/s, each sent as an image block
  labelled with its exact timestamp, in batches. More tokens, but brief actions
  are far less likely to fall between samples and timestamps are exact.
"""
from __future__ import annotations

import re
from pathlib import Path

from . import media
from .aws import Services
from .llm import ask_json
from .timeline import scene_at
from .workspace import PipelineError, Workspace, now_iso

SYSTEM = (
    "You assist a professional audio describer. You watch films and log what is VISIBLE, with precise times, "
    "so blind and low-vision viewers can follow the story. Reply with JSON only. No prose, no markdown."
)

SCHEMA_HINT = """Return ONLY this JSON object:
{"characters": [{"ref": "woman-red-coat", "description": "appearance only", "firstSeenAt": 0.0}],
 "events": [{"id": "envelope-hidden", "description": "One factual present-tense sentence.",
             "startTime": 1.5, "availableAt": 2.0, "critical": true, "sceneId": "s01",
             "characters": ["woman-red-coat"],
             "details": {"spatial": "...", "appearance": "...", "expression": "...", "setting": "..."}}]}
Rules:
- Times are seconds from the start of the film.
- startTime: when the action begins. availableAt: earliest moment the result is clearly visible (>= startTime).
- critical: true only if a viewer who misses it would lose the plot.
- Describe only what is visible. No guesses about intent. No names unless a name appears on screen.
- Use one stable kebab-case ref per character and reuse it everywhere.
- Include brief actions (under one second) when they matter to the plot.
- Order events by availableAt."""


def _scene_text(scenes: list[dict]) -> str:
    return ", ".join(f"{s['id']} {s['start']:.2f}-{s['end']:.2f}s" for s in scenes)


# ------------------------------------------------------------- validation

_TIME = re.compile(r"^\s*(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)\s*s?\s*$")


def parse_time(value) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    m = _TIME.match(str(value))
    if not m:
        return None
    parts = [p for p in m.groups() if p is not None]
    seconds = 0.0
    for part in parts:
        seconds = seconds * 60 + float(part)
    return seconds


def slug(text: str, limit: int = 40) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    return (s[:limit].rstrip("-") or "event")


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "yes", "1", "critical", "y"}


def normalize_observations(obj, duration: float, scenes: list[dict]) -> tuple[list[dict], list[dict], list[str]]:
    """Validate/repair model output. Returns (events, characters, problems)."""
    problems: list[str] = []
    if isinstance(obj, list):
        obj = {"events": obj, "characters": []}
    if not isinstance(obj, dict):
        raise ValueError("expected a JSON object with 'events'")
    raw_events = obj.get("events")
    if not isinstance(raw_events, list):
        raise ValueError("'events' must be a list")
    latest = round(duration - 0.05, 2)
    events, seen = [], set()
    for i, raw in enumerate(raw_events):
        if not isinstance(raw, dict):
            problems.append(f"event #{i}: not an object; dropped")
            continue
        desc = str(raw.get("description") or "").strip()
        if not desc:
            problems.append(f"event #{i}: empty description; dropped")
            continue
        start, avail = parse_time(raw.get("startTime")), parse_time(raw.get("availableAt"))
        if start is None and avail is None:
            problems.append(f"event #{i} '{desc[:40]}': no usable time; dropped")
            continue
        start = avail if start is None else start
        avail = start if avail is None else avail
        if avail < start:
            problems.append(f"event #{i}: availableAt before startTime; set to startTime")
            avail = start
        if start > duration or avail > duration + 0.5:
            problems.append(f"event #{i} '{desc[:40]}': time beyond film end; dropped")
            continue
        start = min(max(0.0, start), latest)
        avail = min(max(start, avail), latest)
        base = slug(raw.get("id") or desc)
        eid, n = base, 2
        while eid in seen:
            eid, n = f"{base}-{n}", n + 1
        seen.add(eid)
        details = raw.get("details") if isinstance(raw.get("details"), dict) else {}
        chars = [slug(c) for c in raw.get("characters") or [] if isinstance(c, str)]
        avail2 = round(avail, 2)
        events.append({
            "id": eid, "description": desc, "startTime": round(start, 2), "availableAt": avail2,
            "critical": _as_bool(raw.get("critical", False)),
            "scene": scene_at(scenes, avail2)["id"], "modelSceneId": raw.get("sceneId"),
            "characters": chars, "details": {k: str(v) for k, v in details.items() if v},
        })
    events.sort(key=lambda e: (e["availableAt"], e["id"]))
    characters, refs = [], set()
    for raw in obj.get("characters") or []:
        if not isinstance(raw, dict) or not raw.get("ref"):
            continue
        ref = slug(raw["ref"])
        if ref in refs:
            continue
        refs.add(ref)
        first = parse_time(raw.get("firstSeenAt"))
        if first is None:
            first = min((e["availableAt"] for e in events if ref in e["characters"]), default=0.0)
        characters.append({"ref": ref, "description": str(raw.get("description") or "").strip(),
                           "firstSeenAt": round(max(0.0, first), 2)})
    for e in events:
        for ref in e["characters"]:
            if ref not in refs:
                refs.add(ref)
                characters.append({"ref": ref, "description": "", "firstSeenAt": e["availableAt"]})
                problems.append(f"character '{ref}' used by {e['id']} was not declared; added")
    if not events:
        raise ValueError("no usable events")
    return events, characters, problems


# --------------------------------------------------------------- requests

def _inference(cfg: dict) -> dict:
    o = cfg["observe"]
    return {"maxTokens": int(o["max_tokens"]), "temperature": float(o["temperature"]), "topP": float(o["top_p"])}


def _video_block(cfg: dict, manifest: dict) -> tuple[dict, str]:
    src = Path(manifest["source"]["path"])
    fmt = src.suffix.lower().lstrip(".")
    fmt = {"3gp": "three_gp", "m4v": "mp4"}.get(fmt, fmt)
    mode = cfg["observe"]["video_source"]
    size_mb = manifest["source"]["bytes"] / 1_000_000
    if mode == "bytes" or (mode == "auto" and size_mb <= float(cfg["observe"]["inline_max_mb"])):
        return {"video": {"format": fmt, "source": {"bytes": src.read_bytes()}}}, "bytes"
    return {"video": {"format": fmt, "source": {"s3Location": {"uri": manifest["s3"]["uri"]}}}}, "s3"


def observe_video(ws, cfg, services, manifest, analysis, model_id) -> tuple[list, list, list, dict]:
    block, how = _video_block(cfg, manifest)
    prompt = (f"This film is {analysis['duration']:.2f} seconds long. Detected shots: {_scene_text(analysis['scenes'])}.\n"
              "Log every plot-relevant visual event and the key setting/appearance details.\n" + SCHEMA_HINT)
    messages = [{"role": "user", "content": [block, {"text": prompt}]}]
    holder = {}

    def validate(value):
        holder["parsed"] = normalize_observations(value, analysis["duration"], analysis["scenes"])
        return value

    _raw, info = ask_json(services, cfg, ws, stage="observe", tag="observe:video", model_id=model_id,
                          messages=messages, system=SYSTEM, inference=_inference(cfg), validate=validate)
    events, characters, problems = holder["parsed"]
    info["videoSource"] = how
    return events, characters, problems, info


def observe_frames(ws, cfg, services, manifest, analysis, model_id, fps: float):
    src = Path(manifest["source"]["path"])
    frames = media.extract_frames(src, fps, ws.dir / "frames", int(cfg["observe"]["frame_width"]))
    if not frames:
        raise PipelineError("ffmpeg extracted no frames")
    batch_size = int(cfg["observe"]["frames_batch"])
    all_events: list[dict] = []
    characters: dict[str, dict] = {}
    problems: list[str] = []
    infos = []
    for b, start in enumerate(range(0, len(frames), batch_size)):
        batch = frames[start:start + batch_size]
        known = "; ".join(f"{c['ref']}: {c['description']}" for c in characters.values()) or "none yet"
        logged = "; ".join(f"{e['id']} @ {e['availableAt']}s" for e in all_events[-12:]) or "none yet"
        content: list[dict] = [{"text": (
            f"Frames {b + 1} of a {analysis['duration']:.2f} s film, sampled at {fps} frames per second. "
            f"Detected shots: {_scene_text(analysis['scenes'])}. Each image is preceded by its exact timestamp.\n"
            f"Characters already identified (reuse these refs): {known}.\n"
            f"Events already logged from earlier frames (do not repeat): {logged}.\n" + SCHEMA_HINT)}]
        for t, path in batch:
            content.append({"text": f"Frame at t={t:.2f}s"})
            content.append({"image": {"format": "jpeg", "source": {"bytes": Path(path).read_bytes()}}})
        holder = {}

        def validate(value, _holder=holder):
            _holder["parsed"] = normalize_observations(value, analysis["duration"], analysis["scenes"])
            return value

        _raw, info = ask_json(services, cfg, ws, stage="observe", tag=f"observe:frames:{b:03d}", model_id=model_id,
                              messages=[{"role": "user", "content": content}], system=SYSTEM,
                              inference=_inference(cfg), validate=validate)
        events, chars, probs = holder["parsed"]
        infos.append(info)
        problems += [f"batch {b}: {p}" for p in probs]
        for c in chars:
            characters.setdefault(c["ref"], c)
        existing = {e["id"] for e in all_events}
        for e in events:
            duplicate = e["id"] in existing or any(
                abs(o["availableAt"] - e["availableAt"]) <= 1.0 and o["description"].lower() == e["description"].lower()
                for o in all_events)
            if duplicate:
                problems.append(f"batch {b}: duplicate event {e['id']} dropped")
                continue
            all_events.append(e)
    all_events.sort(key=lambda e: (e["availableAt"], e["id"]))
    summary = {"modelId": model_id, "videoSource": "frames", "fps": fps, "frameCount": len(frames),
               "batches": len(infos), "requests": sum(i["requests"] for i in infos),
               "repaired": sum(1 for i in infos if i["repaired"]),
               "usage": {"inputTokens": sum((i.get("usage") or {}).get("inputTokens", 0) for i in infos),
                         "outputTokens": sum((i.get("usage") or {}).get("outputTokens", 0) for i in infos)}}
    if not all_events:
        raise PipelineError("Frame batches produced no events")
    return all_events, list(characters.values()), problems, summary


def run_observe(ws: Workspace, cfg: dict, services: Services, *, frames_fps: float | None = None,
                model_id: str | None = None) -> dict:
    manifest = ws.read("manifest.json")
    analysis = ws.read("analysis.json")
    model_id = model_id or cfg["observe"]["model_id"]
    if frames_fps:
        events, characters, problems, info = observe_frames(ws, cfg, services, manifest, analysis, model_id, frames_fps)
    else:
        events, characters, problems, info = observe_video(ws, cfg, services, manifest, analysis, model_id)
    result = {
        "asset": ws.asset, "observedAt": now_iso(), "mode": services.mode,
        "model": {"modelId": model_id, "region": services.region, "inferenceConfig": _inference(cfg), **info},
        "events": events, "characters": characters, "problems": problems,
    }
    ws.write("observations.json", result)
    return result


def summarize(observations: dict) -> str:
    crit = sum(1 for e in observations["events"] if e["critical"])
    return (f"{len(observations['events'])} events ({crit} critical), {len(observations['characters'])} characters, "
            f"{len(observations['problems'])} repairs/notes")
