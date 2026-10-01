"""Pure timing logic: no I/O, no AWS. Every function here is unit tested.

Times are seconds from the start of the film. Values written to packages are
rounded to milliseconds; event availability is rounded to 10 ms so a cue start
derived from it can satisfy the validator's `availableAt <= cue.start` exactly.
"""
from __future__ import annotations

import math
import re

LEVELS = ("essential", "standard", "rich")
EPS = 1e-6


def r3(x: float) -> float:
    return round(float(x) + 0.0, 3)


def ceil2(x: float) -> float:
    """Round up to 10 ms (never earlier than x)."""
    return math.ceil(round(float(x) * 100, 6)) / 100


# ------------------------------------------------------------------ dialogue

def words_from_transcript(transcript: dict) -> list[dict]:
    """Amazon Transcribe batch output -> [{start, end, text}] for spoken words."""
    words = []
    for item in transcript.get("results", {}).get("items", []):
        if item.get("type") != "pronunciation" or "start_time" not in item or "end_time" not in item:
            continue
        alts = item.get("alternatives") or [{}]
        words.append({"start": float(item["start_time"]), "end": float(item["end_time"]),
                      "text": alts[0].get("content", ""),
                      "confidence": float(alts[0].get("confidence", 0) or 0)})
    return sorted(words, key=lambda w: w["start"])


def merge_dialogue(words: list[dict], merge_gap: float = 0.6, pad: float = 0.1,
                   duration: float | None = None) -> list[dict]:
    """Merge words separated by < merge_gap seconds, then pad each span by `pad`.

    Padded spans that touch or overlap are merged again so the result is ordered
    and disjoint. Spans are clamped to [0, duration].
    """
    spans: list[list[float]] = []
    for w in sorted(words, key=lambda w: w["start"]):
        start, end = float(w["start"]), max(float(w["end"]), float(w["start"]))
        if spans and round(start - spans[-1][1], 6) < merge_gap:  # round: 1.9-1.3 must equal 0.6
            spans[-1][1] = max(spans[-1][1], end)
        else:
            spans.append([start, end])
    padded: list[list[float]] = []
    for start, end in spans:
        start, end = max(0.0, start - pad), end + pad
        if duration is not None:
            end = min(float(duration), end)
        if padded and start <= padded[-1][1]:
            padded[-1][1] = max(padded[-1][1], end)
        else:
            padded.append([start, end])
    return [{"start": r3(s), "end": r3(e)} for s, e in padded if r3(e) > r3(s)]


# -------------------------------------------------------------------- scenes

def scenes_from_boundaries(boundaries: list[float], duration: float, min_scene: float = 1.0) -> list[dict]:
    """Shot-change times -> contiguous scenes covering [0, duration]."""
    duration = r3(duration)
    cuts, last = [], 0.0
    for t in sorted(r3(b) for b in boundaries):
        if t - last >= min_scene - EPS and duration - t >= min_scene - EPS:
            cuts.append(t)
            last = t
    edges = [0] + cuts + [duration]
    return [{"id": f"s{i + 1:02d}", "start": edges[i], "end": edges[i + 1]} for i in range(len(edges) - 1)]


def scene_at(scenes: list[dict], t: float) -> dict:
    for scene in scenes:
        if scene["start"] <= t < scene["end"]:
            return scene
    return scenes[-1] if t >= scenes[-1]["end"] else scenes[0]


# ------------------------------------------------------------------- windows

def subtract_spans(base: list[tuple[float, float]], remove: list[dict | tuple]) -> list[tuple[float, float]]:
    out = list(base)
    for item in remove:
        rs, re_ = (item["start"], item["end"]) if isinstance(item, dict) else item
        nxt = []
        for s, e in out:
            if re_ <= s or rs >= e:
                nxt.append((s, e))
                continue
            if rs > s:
                nxt.append((s, rs))
            if re_ < e:
                nxt.append((re_, e))
        out = nxt
    return [(r3(s), r3(e)) for s, e in out if e - s > EPS]


def non_speech_sounds(silences: list[tuple[float, float]], dialogue: list[dict], duration: float,
                      min_seconds: float = 0.3) -> list[dict]:
    """Audible spans that are not dialogue (music, effects): complement of silence minus speech."""
    audible = subtract_spans([(0.0, float(duration))], list(silences))
    sounds = subtract_spans(audible, dialogue)
    return [{"start": s, "end": e} for s, e in sounds if e - s >= min_seconds]


def overlap_seconds(start: float, end: float, spans: list[dict]) -> float:
    return r3(sum(max(0.0, min(end, s["end"]) - max(start, s["start"])) for s in spans))


def derive_windows(dialogue: list[dict], duration: float, scenes: list[dict] | None = None,
                   min_window: float = 1.5, split_at_scenes: bool = True) -> list[dict]:
    """Narration windows: gaps between padded dialogue spans that are >= min_window.

    A gap that contains a shot change is split there when both halves are still
    >= min_window, so a new scene can be described right after the cut.
    """
    gaps, cursor = [], 0.0
    for d in sorted(dialogue, key=lambda d: d["start"]):
        if d["start"] > cursor:
            gaps.append((cursor, d["start"]))
        cursor = max(cursor, d["end"])
    if duration > cursor:
        gaps.append((cursor, float(duration)))
    pieces = []
    cut_points = [s["start"] for s in (scenes or [])[1:]]
    for start, end in gaps:
        if end - start < min_window - EPS:
            continue
        segments = [(start, end)]
        if split_at_scenes:
            for cut in cut_points:
                updated = []
                for a, z in segments:
                    if a < cut < z and cut - a >= min_window - EPS and z - cut >= min_window - EPS:
                        updated += [(a, cut), (cut, z)]
                    else:
                        updated.append((a, z))
                segments = updated
        pieces += segments
    windows = []
    for i, (a, z) in enumerate(pieces):
        windows.append({"id": f"w{i + 1:02d}", "start": r3(a), "end": r3(z), "seconds": r3(z - a),
                        "scene": scene_at(scenes, a)["id"] if scenes else None})
    return windows


# ---------------------------------------------------------------- cue plan

def plan_cues(windows: list[dict], events: list[dict], *, min_window: float = 1.5,
              max_events: int = 3) -> tuple[list[dict], list[dict]]:
    """Assign events to narration cues inside windows.

    Invariants (the player's validator enforces the first two):
      * every event in a cue has availableAt <= cue.start (no future facts);
      * cues are ordered and non-overlapping, each inside one window;
      * critical events are preferred; an event is described at most once.

    A cue may start after its window starts: if an event only becomes visible
    mid-window, the cue starts at that moment. If a critical event arrives less
    than `min_window` after the cursor, the cue is delayed to include it rather
    than pushing it to a later window. Returns (cues, unplaced_events).
    """
    pending = {e["id"]: e for e in events}
    cues: list[dict] = []

    def available(t: float) -> list[dict]:
        return sorted((e for e in pending.values() if e["availableAt"] <= t),
                      key=lambda e: (e["availableAt"], e["id"]))

    def arrivals(after: float, until: float, critical_only: bool = False) -> list[float]:
        return sorted({e["availableAt"] for e in pending.values()
                       if after < e["availableAt"] <= until + EPS and (e["critical"] or not critical_only)})

    def emit(window: dict, start: float, end: float, chosen: list[dict]) -> None:
        chosen = sorted(chosen, key=lambda e: (e["availableAt"], e["id"]))
        cues.append({"id": f"c{len(cues) + 1:02d}", "window": window["id"], "start": r3(start),
                     "end": r3(end), "seconds": r3(end - start), "events": [e["id"] for e in chosen],
                     "critical": any(e["critical"] for e in chosen)})
        for e in chosen:
            pending.pop(e["id"], None)

    for window in windows:
        cursor, w_end = window["start"], window["end"]
        for _ in range(10_000):  # loop guard; cursor strictly advances
            if not pending or w_end - cursor < min_window - EPS:
                break
            latest = w_end - min_window
            here = available(cursor)
            critical_next = arrivals(cursor, latest, critical_only=True)
            if not any(e["critical"] for e in here):
                if critical_next:
                    t = ceil2(critical_next[0])
                    if here and t - cursor >= min_window - EPS:
                        emit(window, cursor, t, here[:max_events])
                    cursor = r3(t)
                    continue
                if not here:
                    upcoming = arrivals(cursor, latest)
                    if not upcoming:
                        break
                    cursor = r3(ceil2(upcoming[0]))
                    continue
            elif critical_next and critical_next[0] - cursor < min_window - EPS:
                cursor = r3(ceil2(critical_next[0]))
                continue
            chosen = sorted(here, key=lambda e: (not e["critical"], e["availableAt"]))[:max_events]
            splits = [t for t in arrivals(cursor, latest) if t - cursor >= min_window - EPS]
            end = ceil2(splits[0]) if splits else w_end
            emit(window, cursor, end, chosen)
            cursor = r3(end)
    unplaced = sorted(pending.values(), key=lambda e: e["availableAt"])
    return cues, unplaced


# ------------------------------------------------------------------ budgets

def count_words(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'’-]*", text))


def word_budget(window_seconds: float, words_per_second: float = 2.6, safety: float = 0.85,
                cap_seconds: float | None = None) -> int:
    """floor(window_seconds * words_per_second * safety), at least 1 word."""
    seconds = window_seconds if cap_seconds is None else min(window_seconds, cap_seconds)
    return max(1, math.floor(seconds * words_per_second * safety + 1e-9))


def level_budgets(window_seconds: float, *, words_per_second: float = 2.6, safety: float = 0.85,
                  ratios: dict | None = None, cap_seconds: float | None = None) -> dict:
    """Per-level word ceilings. Rich gets the full budget; others a fraction (never < 2 words)."""
    ratios = ratios or {"essential": 0.45, "standard": 0.7, "rich": 1.0}
    total = word_budget(window_seconds, words_per_second, safety, cap_seconds)
    out, floor_words = {}, min(2, total)
    for level in LEVELS:
        out[level] = max(floor_words, math.floor(total * ratios[level] + 1e-9))
    out["standard"] = min(max(out["standard"], out["essential"]), out["rich"])
    return out


def available_speech_seconds(window_seconds: float, margin: float, slack: float = 0.0) -> float:
    return r3(window_seconds - 2 * margin - slack)


def fits(duration: float, window_seconds: float, margin: float, slack: float = 0.0) -> bool:
    """Validator rule (duration + 2*margin <= window) plus pipeline-only slack."""
    return duration + 2 * margin + slack <= window_seconds + 1e-9


def shorten_target_words(text: str, measured: float, available: float, factor: float = 0.9) -> int:
    words = count_words(text)
    if measured <= 0:
        return words
    return max(1, min(words - 1, math.floor(words * (available / measured) * factor)))
