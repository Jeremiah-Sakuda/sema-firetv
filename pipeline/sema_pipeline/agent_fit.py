"""Optional agent mode for the fit loop (`render --agent`), built on Strands Agents.

The agent gets three tools and a render budget:
    render_with_polly(text)          -> audio_path      (Amazon Polly)
    measure_duration(audio_path)     -> seconds         (ffprobe)
    check_window(duration_seconds)   -> fits/overflow   (validator rule + slack)
It rewrites the line itself between attempts and stops when a render fits or the
budget is spent.

Guardrails: the outcome is decided from the tool ledger (our own measurements),
never from the agent's final claim; measure_duration only accepts paths that
render_with_polly produced; the render budget is enforced inside the tool.

Offline, `OfflineAgentModel` stands in for the LLM: a deterministic policy that
drives the same tools (it shortens by truncation, not by rewriting). It exists so
the Strands wiring is exercised in tests without Bedrock.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

from . import media
from .aws import Services
from .llm import extract_json
from .timeline import available_speech_seconds, count_words, fits, r3
from .workspace import PipelineError, Workspace

SYSTEM = """You are the timing editor in an audio-description pipeline for blind and low-vision viewers.
A narration line must fit inside a silent window between dialogue lines.
Tools: render_with_polly(text) renders speech and returns audio_path; measure_duration(audio_path) returns the
true length in seconds; check_window(duration_seconds) says whether that length fits.
Procedure: render the current text, measure it, check it. If it does not fit, rewrite the line shorter yourself
(keep every plot-critical fact, present tense, add nothing new) and try again. Never skip measuring.
When a render fits, or the render budget is spent, reply with ONLY this JSON:
{"status": "fit" or "gave_up", "text": "<final text>", "audio_path": "<audio_path of the final render>"}"""


def _require_strands():
    try:
        import strands  # noqa: F401
    except ImportError as exc:
        raise PipelineError("Agent mode needs Strands Agents: .venv/bin/pip install -r requirements-agent.txt "
                            "(the default deterministic fit loop does not).") from exc


def make_model(cfg: dict, services: Services):
    _require_strands()
    if services.live:
        from strands.models import BedrockModel
        return BedrockModel(model_id=cfg["agent"]["model_id"], region_name=services.region,
                            temperature=0.2, max_tokens=800)
    return OfflineAgentModel()


class AgentFitRunner:
    def __init__(self, cfg: dict, services: Services, ws: Workspace | None, model: Any = None):
        _require_strands()
        self.cfg, self.services, self.ws = cfg, services, ws
        self.model = model if model is not None else make_model(cfg, services)
        self.model_id = cfg["agent"]["model_id"] if services.live else "offline-agent-policy"
        self.max_renders = int(cfg["agent"]["max_renders"])
        self.runs: list[dict] = []

    def fit(self, text: str, *, cue: dict, level: str, must_keep: list[str], window_seconds: float,
            margin: float, slack: float, render) -> dict:
        from strands import Agent, tool

        available = available_speech_seconds(window_seconds, margin, slack)
        ledger: dict = {"renders": [], "calls": []}

        @tool
        def render_with_polly(text: str) -> dict:
            """Render narration text to speech with Amazon Polly.

            Args:
                text: The narration line to speak.
            """
            ledger["calls"].append("render_with_polly")
            if len(ledger["renders"]) >= self.max_renders:
                return {"error": "render budget exhausted; stop and reply with status gave_up"}
            out = render(" ".join(text.split()), len(ledger["renders"]))
            ledger["renders"].append({"text": " ".join(text.split()), "audio": str(out["audio"]),
                                      "duration": out["duration"]})
            return {"audio_path": str(out["audio"]), "characters": len(text),
                    "renders_left": self.max_renders - len(ledger["renders"])}

        @tool
        def measure_duration(audio_path: str) -> dict:
            """Measure the true duration of a rendered audio file in seconds.

            Args:
                audio_path: A path returned by render_with_polly.
            """
            ledger["calls"].append("measure_duration")
            known = {r["audio"] for r in ledger["renders"]}
            if audio_path not in known:
                return {"error": "unknown audio_path; use a path returned by render_with_polly"}
            return {"seconds": media.measure_duration(Path(audio_path))}

        @tool
        def check_window(duration_seconds: float) -> dict:
            """Check whether narration of this duration fits the cue window, including guard margins.

            Args:
                duration_seconds: Measured narration length in seconds.
            """
            ledger["calls"].append("check_window")
            ok = fits(float(duration_seconds), window_seconds, margin, slack)
            return {"fits": ok, "available_seconds": available,
                    "overflow_seconds": r3(max(0.0, float(duration_seconds) - available))}

        agent = Agent(model=self.model, tools=[render_with_polly, measure_duration, check_window],
                      system_prompt=SYSTEM, callback_handler=None)
        prompt = (f"Cue {cue['id']}, level {level}. Window {window_seconds:.2f} s; speech must be at most "
                  f"{available:.2f} s. Render budget: {self.max_renders}.\n"
                  f"Plot-critical facts to keep: {'; '.join(must_keep) or 'none'}\n"
                  f"Text: \"{' '.join(text.split())}\"")
        result = agent(prompt)
        reply = str(result)
        usage = dict(result.metrics.accumulated_usage) if getattr(result, "metrics", None) else {}
        if self.ws:
            self.ws.record_usage(stage="render", service="bedrock", model=self.model_id, mode=self.services.mode,
                                 tag=f"agent:{cue['id']}:{level}", inputTokens=int(usage.get("inputTokens", 0)),
                                 outputTokens=int(usage.get("outputTokens", 0)))
        try:
            claim = extract_json(reply)
        except ValueError:
            claim = {"status": "unparseable", "raw": reply[:300]}

        # Ground truth: our own measurements in the ledger decide the outcome.
        attempts = [{"attempt": i, "text": r["text"], "audio": r["audio"], "duration": r["duration"],
                     "fits": fits(r["duration"], window_seconds, margin, slack)} for i, r in enumerate(ledger["renders"])]
        if not attempts:
            raise PipelineError(f"Agent produced no render for {cue['id']}/{level}")
        fitting = [a for a in attempts if a["fits"]]
        final = fitting[-1] if fitting else min(attempts, key=lambda a: a["duration"])
        run = {"cue": cue["id"], "level": level, "renders": len(attempts), "toolCalls": ledger["calls"],
               "claimedStatus": claim.get("status") if isinstance(claim, dict) else None,
               "claimMatchesLedger": (isinstance(claim, dict) and claim.get("status") == ("fit" if fitting else "gave_up")),
               "usage": usage}
        self.runs.append(run)
        return {"status": "fit" if final["fits"] else "unresolved", "text": final["text"], "audio": final["audio"],
                "duration": final["duration"], "words": count_words(final["text"]),
                "headroom": r3(available - final["duration"]), "available": available,
                "regenerations": len(attempts) - 1, "attempts": attempts, "firstTry": attempts[0]["fits"],
                "agent": run}

    def summary(self) -> dict:
        return {"modelId": self.model_id, "runs": len(self.runs),
                "toolCalls": sum(len(r["toolCalls"]) for r in self.runs),
                "claimMismatches": sum(1 for r in self.runs if not r["claimMatchesLedger"]),
                "inputTokens": sum(int(r["usage"].get("inputTokens", 0)) for r in self.runs),
                "outputTokens": sum(int(r["usage"].get("outputTokens", 0)) for r in self.runs)}


# ---------------------------------------------------------------- offline model

def _offline_model_base():
    _require_strands()
    from strands.models.model import Model
    return Model


class _OfflinePolicy:
    """Deterministic stand-in for the LLM: render -> measure -> check -> truncate -> ..."""

    @staticmethod
    def _tool_trace(messages: list) -> list[tuple[str, dict, Any]]:
        uses, trace = {}, []
        for message in messages:
            for block in message.get("content", []):
                if "toolUse" in block:
                    uses[block["toolUse"]["toolUseId"]] = block["toolUse"]
                elif "toolResult" in block:
                    res = block["toolResult"]
                    use = uses.get(res["toolUseId"], {})
                    text = "".join(c.get("text", "") for c in res.get("content", []))
                    try:
                        payload = json.loads(text)
                    except ValueError:
                        payload = {"raw": text}
                    trace.append((use.get("name"), use.get("input") or {}, payload))
        return trace

    @staticmethod
    def _shorten(text: str, duration: float, available: float) -> str:
        words = text.rstrip(".").split()
        keep = max(1, min(len(words) - 1, math.floor(len(words) * available / max(duration, 1e-6) * 0.9)))
        return " ".join(words[:keep]).rstrip(",;:") + "."

    def decide(self, messages: list) -> tuple[str, Any]:
        first_user = next(m for m in messages if m["role"] == "user")
        prompt = "".join(b.get("text", "") for b in first_user["content"])
        text = re.search(r'Text: "(.*)"\s*$', prompt, re.S).group(1)
        trace = self._tool_trace(messages)
        renders = [(inp, out) for name, inp, out in trace if name == "render_with_polly"]
        if not trace:
            return "tool", ("render_with_polly", {"text": text})
        name, inp, out = trace[-1]
        if name == "render_with_polly":
            if "error" in out:
                last = renders[-2] if len(renders) > 1 else None
                return "final", {"status": "gave_up", "text": last[0]["text"] if last else text,
                                 "audio_path": last[1].get("audio_path") if last else None}
            return "tool", ("measure_duration", {"audio_path": out["audio_path"]})
        if name == "measure_duration":
            return "tool", ("check_window", {"duration_seconds": out["seconds"]})
        if name == "check_window":
            last_text, last_out = renders[-1]
            if out.get("fits"):
                return "final", {"status": "fit", "text": last_text["text"], "audio_path": last_out["audio_path"]}
            measured = inp["duration_seconds"]
            return "tool", ("render_with_polly", {"text": self._shorten(last_text["text"], measured,
                                                                        out["available_seconds"])})
        return "final", {"status": "gave_up", "text": text, "audio_path": None}


def OfflineAgentModel():  # noqa: N802 - factory that returns a strands Model instance
    Model = _offline_model_base()

    class _OfflineAgentModel(Model):
        def __init__(self):
            self.config = {"model_id": "offline-agent-policy"}
            self.policy = _OfflinePolicy()
            self.calls = 0

        def update_config(self, **model_config):
            self.config.update(model_config)

        def get_config(self):
            return self.config

        def structured_output(self, output_model, prompt, system_prompt=None, **kwargs):
            raise NotImplementedError("offline agent model has no structured output")

        async def stream(self, messages, tool_specs=None, system_prompt=None, **kwargs):
            self.calls += 1
            kind, payload = self.policy.decide(messages)
            yield {"messageStart": {"role": "assistant"}}
            if kind == "tool":
                name, args = payload
                yield {"contentBlockStart": {"start": {"toolUse": {"toolUseId": f"offline-{self.calls}", "name": name}}}}
                yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(args)}}}}
                yield {"contentBlockStop": {}}
                yield {"messageStop": {"stopReason": "tool_use"}}
            else:
                yield {"contentBlockStart": {"start": {}}}
                yield {"contentBlockDelta": {"delta": {"text": json.dumps(payload)}}}
                yield {"contentBlockStop": {}}
                yield {"messageStop": {"stopReason": "end_turn"}}
            yield {"metadata": {"usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                                "metrics": {"latencyMs": 0}}}

    return _OfflineAgentModel()
