"""Stage 4 - script: plan cues, then write Essential/Standard/Rich variants and
one spoiler-safe recovery per event with a Bedrock text model.

Spoiler safety is enforced by *information hiding*, not by instruction alone:
the text model only ever receives events (and characters) that are already
visible at the cue start (for variants) or at the event's availableAt (for
recoveries). It never sees the video or later observations, so it cannot leak
a future fact it was never given.
"""
from __future__ import annotations

from .aws import Services
from .llm import ask_json
from .timeline import LEVELS, count_words, level_budgets, plan_cues
from .workspace import Workspace, now_iso

SYSTEM = (
    "You write audio description (AD) for blind and low-vision viewers. Style: present tense, third person, "
    "plain concrete words, describe what is seen rather than what it means, no camera jargon, never mention "
    "sound or dialogue. Refer to people only by the references given; never invent names. Use ONLY the facts "
    "provided; never add events, objects or outcomes that are not listed. Reply with JSON only."
)


def _fact_line(e: dict) -> str:
    details = "; ".join(f"{k}: {v}" for k, v in (e.get("details") or {}).items())
    tag = "[critical]" if e["critical"] else "[optional]"
    chars = f" (people: {', '.join(e['characters'])})" if e.get("characters") else ""
    return f"- {tag} {e['id']} at {e['availableAt']:.2f}s: {e['description']}{chars}" + (f" Details - {details}." if details else "")


def _characters(characters: list[dict], t: float) -> str:
    known = [c for c in characters if c["firstSeenAt"] <= t]
    return "\n".join(f"- {c['ref']}: {c['description'] or 'no description'}" for c in known) or "- none"


def set_issues(ws: Workspace, stage: str, issues: list[dict]) -> list[dict]:
    """Replace this stage's issues in issues.json, keep the others."""
    current = ws.read("issues.json", default={"issues": []})["issues"]
    merged = [i for i in current if i.get("stage") != stage] + [{**i, "stage": stage} for i in issues]
    ws.write("issues.json", {"updatedAt": now_iso(), "issues": merged})
    return merged


def cue_prompt(cue: dict, cue_events: list[dict], context: list[dict], characters: list[dict]) -> str:
    b = cue["budgets"]
    earlier = "\n".join(f"- {e['id']}: {e['description']}" for e in context) or "- none"
    return (
        f"Narration window: {cue['seconds']:.1f} s with no dialogue, at {cue['start']:.2f}-{cue['end']:.2f} s.\n"
        f"Facts to describe now (all already visible on screen):\n" + "\n".join(_fact_line(e) for e in cue_events) +
        f"\nAlready described earlier (context only; do not repeat):\n{earlier}\n"
        f"People known so far:\n{_characters(characters, cue['start'])}\n\n"
        "Write three versions of ONE narration line. A listener hears only one version, so each must stand alone.\n"
        f"- essential: only the [critical] facts, at most {b['essential']} words. If nothing is critical, the "
        "shortest useful phrase.\n"
        f"- standard: essential plus where things are and what people do, at most {b['standard']} words.\n"
        f"- rich: standard plus appearance, expression and setting, at most {b['rich']} words.\n"
        'Reply as {"essential": "...", "standard": "...", "rich": "..."}'
    )


def recovery_prompt(event: dict, known: list[dict], characters: list[dict], max_words: int) -> str:
    return (
        f"A viewer paused at {event['availableAt']:.2f} s and asked \"What did I miss?\" about one moment.\n"
        "Everything visible so far (nothing after this exists yet):\n" + "\n".join(_fact_line(e) for e in known) +
        f"\nPeople known so far:\n{_characters(characters, event['availableAt'])}\n\n"
        f"Explain the moment '{event['id']}' and the situation it leaves, in 1-3 short sentences, at most "
        f"{max_words} words. You may include appearance and setting details. Do not speculate about what "
        'happens next.\nReply as {"recovery": "..."}'
    )


def _validate_variants(value):
    if not isinstance(value, dict):
        raise ValueError("expected an object with essential, standard and rich")
    out = {}
    for level in LEVELS:
        text = value.get(level)
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"missing or empty '{level}'")
        out[level] = " ".join(text.split())
    return out


def _validate_recovery(value):
    text = value.get("recovery") if isinstance(value, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise ValueError("missing or empty 'recovery'")
    return " ".join(text.split())


def _inference(cfg: dict) -> dict:
    s = cfg["script"]
    return {"maxTokens": int(s["max_tokens"]), "temperature": float(s["temperature"]), "topP": float(s["top_p"])}


def run_script(ws: Workspace, cfg: dict, services: Services, *, model_id: str | None = None) -> dict:
    analysis = ws.read("analysis.json")
    observations = ws.read("observations.json")
    events = observations["events"]
    characters = observations["characters"]
    by_id = {e["id"]: e for e in events}
    model_id = model_id or cfg["script"]["model_id"]
    scfg, ccfg = cfg["script"], cfg["cues"]

    cues, unplaced = plan_cues(analysis["windows"], events, min_window=cfg["windows"]["min_seconds"],
                               max_events=int(ccfg["max_events_per_cue"]))
    issues = []
    for e in unplaced:
        issues.append({
            "type": "critical-unplaced" if e["critical"] else "optional-unplaced",
            "severity": "blocking" if e["critical"] else "info",
            "event": e["id"], "availableAt": e["availableAt"],
            "message": (f"No narration window of >= {cfg['windows']['min_seconds']} s starts after "
                        f"{e['availableAt']:.2f} s for '{e['description']}'.") +
                       (" Reviewer must attach it to a cue or downgrade it." if e["critical"] else
                        " It stays available through 'What did I miss?' recovery."),
        })

    described: list[str] = []
    requests = 0
    for cue in cues:
        cue["margin"] = float(ccfg["margin"])
        cue["budgets"] = level_budgets(cue["seconds"], words_per_second=scfg["words_per_second"],
                                       safety=scfg["safety"], ratios=scfg["level_ratios"],
                                       cap_seconds=scfg.get("max_budget_seconds"))
        cue_events = [by_id[i] for i in cue["events"]]
        context = [by_id[i] for i in described if by_id[i]["availableAt"] <= cue["start"]][-4:]
        variants, info = ask_json(services, cfg, ws, stage="script", tag=f"script:cue:{cue['id']}",
                                  model_id=model_id,
                                  messages=[{"role": "user", "content": [{"text": cue_prompt(cue, cue_events, context, characters)}]}],
                                  system=SYSTEM, inference=_inference(cfg), validate=_validate_variants)
        requests += info["requests"]
        cue["variants"] = {lvl: {"text": variants[lvl], "words": count_words(variants[lvl])} for lvl in LEVELS}
        cue["overBudget"] = [lvl for lvl in LEVELS if cue["variants"][lvl]["words"] > cue["budgets"][lvl]]
        described += cue["events"]

    recoveries = {}
    for e in events:
        known = [o for o in events if o["availableAt"] <= e["availableAt"]]
        text, info = ask_json(services, cfg, ws, stage="script", tag=f"script:recovery:{e['id']}", model_id=model_id,
                              messages=[{"role": "user", "content": [{"text": recovery_prompt(e, known, characters, int(scfg['recovery_max_words']))}]}],
                              system=SYSTEM, inference=_inference(cfg), validate=_validate_recovery)
        requests += info["requests"]
        recoveries[e["id"]] = {"text": text, "words": count_words(text),
                               "contextEvents": [o["id"] for o in known]}

    set_issues(ws, "script", issues)
    script = {"asset": ws.asset, "scriptedAt": now_iso(), "mode": services.mode,
              "model": {"modelId": model_id, "region": services.region, "inferenceConfig": _inference(cfg)},
              "requests": requests, "cues": cues, "recoveries": recoveries,
              "unplaced": [e["id"] for e in unplaced]}
    ws.write("script.json", script)
    return script
