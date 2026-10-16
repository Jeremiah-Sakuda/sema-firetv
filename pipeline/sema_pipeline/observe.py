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

SCHEMA_HINT = """Analyze the supplied visual media, then return a JSON object with two arrays: characters and events.
Each character object must have: ref (a stable kebab-case identifier based on visible appearance),
description (visible appearance), firstSeenAt (number of seconds).
Each event object must have: id (unique kebab-case identifier for the actual action),
description (a factual present-tense sentence describing the visible action or setting),
startTime (number), availableAt (number), critical (boolean), sceneId (shot identifier),
characters (array of character refs), details (object with optional spatial, appearance, expression, setting strings).
Rules:
- Describe the supplied images/video, not these field instructions. Never invent sample people or actions.
- Times are seconds from the start of the film. For timestamped images, use the supplied image times.
- startTime is when the action is first observed; availableAt is the earliest supplied time its result is clearly visible.
- availableAt must be >= startTime. Do not guess what happens between images or after the last supplied image.
- critical is true only for a story-changing action or reveal that a viewer must know to understand later events.
  Establishing scenery, ordinary conversation gestures, and appearance details are usually not critical.
- Describe only what is visible. No guesses about intent, relationships, diagnoses, or offscreen events.
- No names unless a name appears on screen. Reuse one stable ref per character throughout the film.
- Include brief actions when visible and relevant. Do not repeat an unchanged pose or setting on every image.
- Empty events is allowed for a batch with no new meaningful visual information.
- Order events by availableAt. Use actual observations, never placeholder text."""


def merge_batch_events(all_events: list[dict], events: list[dict], batch: int) -> list[str]:
    """Add one frame batch's events. A repeat of a known moment (same description
    within a second) is dropped; a new moment that reuses an earlier ID is kept
    under a fresh ID rather than silently lost."""
    problems = []
    existing = {e["id"] for e in all_events}
    for e in events:
        if any(abs(o["availableAt"] - e["availableAt"]) <= 1.0 and o["description"].lower() == e["description"].lower()
               for o in all_events):
            problems.append(f"batch {batch}: duplicate event {e['id']} dropped")
            continue
        if e["id"] in existing:
            n = 2
            while f"{e['id']}-{n}" in existing:
                n += 1
            problems.append(f"batch {batch}: event ID {e['id']} reused for a new moment; kept as {e['id']}-{n}")
            e = {**e, "id": f"{e['id']}-{n}"}
        all_events.append(e)
        existing.add(e["id"])
    return problems


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


def normalize_observations(obj, duration: float, scenes: list[dict], *, allow_empty: bool = False) -> tuple[list[dict], list[dict], list[str]]:
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
        if desc.casefold().rstrip(".") in {"one factual present-tense sentence", "appearance only", "..."}:
            raise ValueError("schema placeholder echoed instead of a visible observation")
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
            **({"requiredTerms": raw["requiredTerms"]} if raw.get("requiredTerms") else {}),
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
    if not events and not (allow_empty and not raw_events):
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
    ws.write("frame-times.json", {"basis": "Selected source-frame PTS", "requestedFPS": fps,
                                  "frames": [{"time": t, "file": str(path.relative_to(ws.dir))}
                                             for t, path in frames]})
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
            f"Batch {b + 1} of a {analysis['duration']:.2f} s film, sampled at {fps} frames per second. "
            f"Detected shots: {_scene_text(analysis['scenes'])}. Each image is preceded by its exact timestamp.\n"
            f"Characters already identified (reuse these refs): {known}.\n"
            f"Events already logged from earlier frames (do not repeat): {logged}.\n"
            f"All event times must be within {batch[0][0]:.2f}-{batch[-1][0]:.2f}s, the supplied batch.\n" + SCHEMA_HINT)}]
        for t, path in batch:
            content.append({"text": f"Frame at t={t:.2f}s"})
            content.append({"image": {"format": "jpeg", "source": {"bytes": Path(path).read_bytes()}}})
        holder = {}

        def validate(value, _holder=holder, _batch=batch):
            parsed = normalize_observations(value, analysis["duration"], analysis["scenes"], allow_empty=True)
            for event in parsed[0]:
                if event["startTime"] < _batch[0][0] - 0.05 or event["availableAt"] > _batch[-1][0] + 0.05:
                    raise ValueError("event time outside the supplied image batch; use only supplied timestamps")
            _holder["parsed"] = parsed
            return value

        _raw, info = ask_json(services, cfg, ws, stage="observe", tag=f"observe:frames:{b:03d}", model_id=model_id,
                              messages=[{"role": "user", "content": content}], system=SYSTEM,
                              inference=_inference(cfg), validate=validate)
        events, chars, probs = holder["parsed"]
        infos.append(info)
        problems += [f"batch {b}: {p}" for p in probs]
        for c in chars:
            characters.setdefault(c["ref"], c)
        problems += merge_batch_events(all_events, events, b)
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
