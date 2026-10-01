"""Stage 5 - render: Amazon Polly narration + ffprobe measurement + fit loop.

Deterministic fit loop (default):
    render -> measure -> fits?  -- yes --> done
                          | no
                          v
          Bedrock "shorten to N words, keep critical facts" (max 2 retries)
    still too long after the retries -> status "unresolved" -> reviewer must edit/drop.

`--agent` swaps the loop for a Strands agent with the same budget (see agent_fit.py).
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable

from . import media
from .aws import Services
from .llm import ask_json
from .script import SYSTEM as AD_SYSTEM, set_issues
from .timeline import LEVELS, available_speech_seconds, count_words, fits, r3, shorten_target_words
from .workspace import PipelineError, Workspace, now_iso


class Narrator:
    """Polly text-to-speech + true duration measurement."""

    def __init__(self, services: Services, cfg: dict, ws: Workspace | None, stage: str, usage_sink=None):
        self.services, self.cfg, self.ws, self.stage = services, cfg, ws, stage
        self.usage_sink = usage_sink
        r = cfg["render"]
        self.voice = {"voiceId": r["voice_id"], "engine": r["engine"], "sampleRate": str(r["sample_rate"]),
                      "outputFormat": "mp3"}

    def synthesize(self, text: str, dest: Path) -> dict:
        if not text.strip():
            raise PipelineError("Cannot synthesize empty text")
        response = self.services.polly.synthesize_speech(
            Text=text, TextType="text", VoiceId=self.voice["voiceId"], Engine=self.voice["engine"],
            OutputFormat="mp3", SampleRate=self.voice["sampleRate"])
        dest = Path(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(response["AudioStream"].read())
        characters = int(response.get("RequestCharacters", len(text)))
        row = dict(stage=self.stage, service="polly", mode=self.services.mode, engine=self.voice["engine"],
                   voice=self.voice["voiceId"], characters=characters)
        if self.ws:
            self.ws.record_usage(**row)
        if self.usage_sink is not None:
            self.usage_sink.append(row)
        return {"audio": dest, "duration": media.measure_duration(dest), "characters": characters}


def fit_loop(text: str, *, window_seconds: float, margin: float, slack: float,
             render: Callable[[str, int], dict], shorten: Callable[..., str], max_retries: int = 2) -> dict:
    """Render until the measured narration fits `window_seconds` with guard margins.

    render(text, attempt) -> {"audio": ..., "duration": seconds}
    shorten(text, target_words, attempt, measured, available) -> shorter text
    """
    available = available_speech_seconds(window_seconds, margin, slack)
    attempts, current = [], " ".join(text.split())
    for attempt in range(max_retries + 1):
        out = render(current, attempt)
        ok = fits(out["duration"], window_seconds, margin, slack)
        attempts.append({"attempt": attempt, "text": current, "audio": str(out["audio"]),
                         "duration": out["duration"], "fits": ok})
        if ok:
            break
        if attempt == max_retries:
            break
        target = shorten_target_words(current, out["duration"], available)
        shorter = " ".join((shorten(current, target, attempt + 1, out["duration"], available) or "").split())
        if not shorter or shorter == current:
            attempts[-1]["note"] = "shortener returned no change"
            break
        current = shorter
    final = attempts[-1] if attempts[-1]["fits"] else min(attempts, key=lambda a: a["duration"])
    return {"status": "fit" if final["fits"] else "unresolved", "text": final["text"], "audio": final["audio"],
            "duration": final["duration"], "words": count_words(final["text"]),
            "headroom": r3(available - final["duration"]), "available": available,
            "regenerations": len(attempts) - 1, "attempts": attempts, "firstTry": attempts[0]["fits"]}


def bedrock_shortener(services: Services, cfg: dict, ws: Workspace, cue: dict, level: str, must_keep: list[str]):
    model_id = cfg["script"]["model_id"]

    def shorten(text: str, target: int, attempt: int, measured: float, available: float) -> str:
        prompt = (
            f"This {level} audio-description line takes {measured:.2f} s to speak, but only {available:.2f} s fit "
            f"between dialogue.\nLine: \"{text}\"\n"
            f"Plot-critical facts that must survive: {'; '.join(must_keep) or 'none'}\n"
            f"Rewrite it in at most {target} words. Keep present tense and the same people references. "
            'Do not add facts.\nReply as {"text": "..."}')

        def validate(value):
            out = value.get("text") if isinstance(value, dict) else None
            if not isinstance(out, str) or not out.strip():
                raise ValueError("missing 'text'")
            return out

        value, _info = ask_json(services, cfg, ws, stage="render", tag=f"fit:shorten:{cue['id']}:{level}:{attempt}",
                                model_id=model_id, messages=[{"role": "user", "content": [{"text": prompt}]}],
                                system=AD_SYSTEM, inference={"maxTokens": 300, "temperature": 0.2, "topP": 0.9},
                                validate=validate)
        return value

    return shorten


def _rel(ws: Workspace, path) -> str:
    return str(Path(path).resolve().relative_to(ws.dir.resolve()))


def run_render(ws: Workspace, cfg: dict, services: Services, *, agent: bool = False) -> dict:
    script = ws.read("script.json")
    observations = ws.read("observations.json")
    by_id = {e["id"]: e for e in observations["events"]}
    narrator = Narrator(services, cfg, ws, "render")
    margin_default, slack = float(cfg["cues"]["margin"]), float(cfg["cues"]["fit_slack"])
    max_retries = int(cfg["render"]["max_retries"])
    agent_runner = None
    if agent:
        from .agent_fit import AgentFitRunner  # optional dependency
        agent_runner = AgentFitRunner(cfg, services, ws)

    cue_results, issues = {}, []
    for cue in script["cues"]:
        must_keep = [by_id[i]["description"] for i in cue["events"] if by_id[i]["critical"]]
        cue_results[cue["id"]] = {}
        for level in LEVELS:
            def render(text, attempt, _cue=cue, _level=level):
                out = narrator.synthesize(text, ws.dir / "audio" / f"{_cue['id']}-{_level}-a{attempt}.mp3")
                return {"audio": out["audio"], "duration": out["duration"]}

            kwargs = dict(window_seconds=cue["seconds"], margin=cue.get("margin", margin_default), slack=slack,
                          render=render)
            if agent_runner:
                result = agent_runner.fit(cue["variants"][level]["text"], cue=cue, level=level, must_keep=must_keep,
                                          **kwargs)
            else:
                result = fit_loop(cue["variants"][level]["text"], max_retries=max_retries,
                                  shorten=bedrock_shortener(services, cfg, ws, cue, level, must_keep), **kwargs)
            result["audio"] = _rel(ws, result["audio"])
            for a in result["attempts"]:
                a["audio"] = _rel(ws, a["audio"])
            cue_results[cue["id"]][level] = result
            if result["status"] != "fit":
                issues.append({"type": "unresolved-fit", "severity": "blocking" if cue["critical"] else "warning",
                               "cue": cue["id"], "level": level,
                               "message": f"{cue['id']}/{level}: {result['duration']:.2f} s of speech for "
                                          f"{result['available']:.2f} s available after {result['regenerations']} "
                                          "regeneration(s). Edit or drop in review."})

    recoveries = {}
    for event_id, rec in script["recoveries"].items():
        out = narrator.synthesize(rec["text"], ws.dir / "audio" / f"recover-{event_id}.mp3")
        recoveries[event_id] = {"text": rec["text"], "audio": _rel(ws, out["audio"]), "duration": out["duration"]}

    set_issues(ws, "render", issues)
    flat = [r for c in cue_results.values() for r in c.values()]
    summary = {
        "variants": len(flat),
        "fitFirstTry": sum(1 for r in flat if r["firstTry"]),
        "fitAfterRegeneration": sum(1 for r in flat if r["status"] == "fit" and not r["firstTry"]),
        "unresolved": sum(1 for r in flat if r["status"] != "fit"),
        "regenerations": sum(r["regenerations"] for r in flat),
        "minHeadroom": min((r["headroom"] for r in flat), default=None),
        "recoveries": len(recoveries),
    }
    result = {"asset": ws.asset, "renderedAt": now_iso(), "mode": services.mode,
              "fitMode": "strands-agent" if agent else "deterministic",
              "voice": narrator.voice, "slack": slack, "maxRetries": max_retries,
              "cues": cue_results, "recoveries": recoveries, "summary": summary}
    if agent_runner:
        result["agent"] = agent_runner.summary()
    ws.write("render.json", result)
    return result
