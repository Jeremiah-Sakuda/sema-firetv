"""Stage 8 - report: timings, service usage, ESTIMATED cost, review effort, fit results."""
from __future__ import annotations

from .config import base_model_id
from .timeline import LEVELS
from .workspace import Workspace, now_iso

STAGES = ("ingest", "analyze", "observe", "script", "render", "review", "package")


def aggregate_usage(rows: list[dict], transcribe_min_seconds: float = 15.0) -> dict:
    out = {"transcribe": {"jobs": 0, "seconds": 0.0, "billedSeconds": 0.0},
           "bedrock": {}, "polly": {}, "s3": {"bytes": 0, "requests": 0}, "modes": sorted({r.get("mode", "?") for r in rows})}
    for r in rows:
        service = r.get("service")
        if service == "transcribe":
            out["transcribe"]["jobs"] += 1
            out["transcribe"]["seconds"] += float(r.get("seconds", 0))
            out["transcribe"]["billedSeconds"] += max(transcribe_min_seconds, float(r.get("seconds", 0)))
        elif service == "bedrock":
            m = out["bedrock"].setdefault(r["model"], {"requests": 0, "inputTokens": 0, "outputTokens": 0})
            m["requests"] += 1
            m["inputTokens"] += int(r.get("inputTokens", 0))
            m["outputTokens"] += int(r.get("outputTokens", 0))
        elif service == "polly":
            p = out["polly"].setdefault(r.get("engine", "neural"), {"requests": 0, "characters": 0})
            p["requests"] += 1
            p["characters"] += int(r.get("characters", 0))
        elif service == "s3":
            out["s3"]["bytes"] += int(r.get("bytes", 0))
            out["s3"]["requests"] += int(r.get("requests", 1))
    out["transcribe"]["seconds"] = round(out["transcribe"]["seconds"], 3)
    return out


def estimate_cost(rows: list[dict], prices: dict) -> dict:
    """List-price estimate. Ignores free tier, credits, taxes, S3 request fees and data transfer."""
    lines, unpriced = [], []
    min_s = float(prices.get("transcribe_min_seconds", 15))
    for r in rows:
        if r.get("service") == "transcribe":
            billed = max(min_s, float(r.get("seconds", 0)))
            lines.append({"service": "transcribe", "item": r.get("job", "job"), "quantity": f"{billed:.1f} s",
                          "usd": billed / 60 * float(prices["transcribe_per_minute"])})
    usage = aggregate_usage(rows)
    for model, u in usage["bedrock"].items():
        if not (u["inputTokens"] or u["outputTokens"]):
            continue
        price = prices["bedrock_per_1k_tokens"].get(base_model_id(model))
        if not price:
            unpriced.append(f"bedrock {model}: {u['inputTokens']} in / {u['outputTokens']} out tokens (no price in table)")
            continue
        lines.append({"service": "bedrock", "item": model,
                      "quantity": f"{u['inputTokens']} in / {u['outputTokens']} out tokens",
                      "usd": u["inputTokens"] / 1000 * price["input"] + u["outputTokens"] / 1000 * price["output"]})
    for engine, p in usage["polly"].items():
        per_m = prices["polly_per_million_chars"].get(engine)
        if per_m is None:
            unpriced.append(f"polly {engine}: {p['characters']} characters")
            continue
        lines.append({"service": "polly", "item": engine, "quantity": f"{p['characters']} characters",
                      "usd": p["characters"] / 1_000_000 * per_m})
    if usage["s3"]["bytes"]:
        gb = usage["s3"]["bytes"] / 1e9
        lines.append({"service": "s3", "item": "storage (1 month)", "quantity": f"{gb:.4f} GB",
                      "usd": gb * float(prices["s3_per_gb_month"])})
    for line in lines:
        line["usd"] = round(line["usd"], 6)
    return {"totalUSD": round(sum(l["usd"] for l in lines), 4), "lines": lines, "unpriced": unpriced,
            "priceTableAsOf": prices.get("asOf"),
            "label": "ESTIMATE at list prices; not a bill. Excludes free tier/credits, tax, S3 requests, data transfer."}


def run_mode(ws: Workspace) -> str:
    modes = {s.get("mode") for name, s in ws.run_log()["stages"].items() if name in {"ingest", "analyze", "observe", "script", "render"}}
    modes.discard(None)
    if modes == {"live"}:
        return "live"
    if modes == {"stub"}:
        return "offline-stub"
    return "mixed" if modes else "unknown"


def build_report(ws: Workspace, cfg: dict) -> dict:
    rows = ws.usage()
    manifest = ws.read("manifest.json", default={})
    analysis = ws.read("analysis.json", default={})
    obs = ws.read("observations.json", default={})
    script = ws.read("script.json", default={})
    render = ws.read("render.json", default={})
    review = ws.read("review.json", default={})
    reviewed = ws.read("reviewed.json", default={})
    issues = ws.read("issues.json", default={"issues": []})["issues"]
    pkg = ws.read("package-result.json", default={})
    stages = ws.run_log()["stages"]
    duration = float(analysis.get("duration") or manifest.get("source", {}).get("duration") or 0)
    minutes = duration / 60 if duration else 0
    fit_rows = []
    for cue in script.get("cues", []):
        for level in LEVELS:
            r = render.get("cues", {}).get(cue["id"], {}).get(level)
            if r:
                fit_rows.append({"cue": cue["id"], "level": level, "window": cue["seconds"], "available": r["available"],
                                 "duration": r["duration"], "headroom": r["headroom"], "status": r["status"],
                                 "regenerations": r["regenerations"], "firstTry": r["firstTry"]})
    review_minutes = float(review.get("reviewMinutes") or 0)
    report = {
        "asset": ws.asset, "title": manifest.get("title"), "generatedAt": now_iso(), "runMode": run_mode(ws),
        "filmSeconds": duration,
        "timings": {name: {"seconds": s.get("seconds"), "status": s.get("status"), "mode": s.get("mode")}
                    for name, s in stages.items()},
        "totalPipelineSeconds": round(sum(s.get("seconds") or 0 for n, s in stages.items() if n != "review"), 3),
        "usage": aggregate_usage(rows),
        "estimatedCost": estimate_cost(rows, cfg["prices"]),
        "models": {"observe": (obs.get("model") or {}).get("modelId"), "script": (script.get("model") or {}).get("modelId"),
                   "agent": (render.get("agent") or {}).get("modelId"), "region": (obs.get("model") or {}).get("region")},
        "voice": render.get("voice"),
        "observations": {"events": len(obs.get("events", [])),
                         "critical": sum(1 for e in obs.get("events", []) if e["critical"]),
                         "characters": len(obs.get("characters", [])), "repairs": len(obs.get("problems", [])),
                         "source": (obs.get("model") or {}).get("videoSource")},
        "cues": len(script.get("cues", [])), "windows": len(analysis.get("windows", [])),
        "fit": {"summary": render.get("summary"), "fitMode": render.get("fitMode"), "rows": fit_rows,
                "agent": render.get("agent")},
        "review": {"reviewer": review.get("reviewer"), "method": review.get("method"),
                   "completed": review.get("completed", False), "reviewMinutes": review_minutes,
                   "reviewMinutesPerFinishedMinute": round(review_minutes / minutes, 2) if minutes else None,
                   "edits": len(review.get("edits", [])), "drops": len(review.get("drops", [])),
                   "downgrades": len(review.get("downgrades", [])), "attachments": len(review.get("attachments", [])),
                   "blockers": review.get("blockers", [])},
        "regenerations": {"fitLoop": (render.get("summary") or {}).get("regenerations", 0),
                          "reviewEdits": len(review.get("edits", [])),
                          "droppedCues": len([c for c in reviewed.get("cues", []) if c.get("dropped")])},
        "issues": issues,
        "package": pkg,
    }
    return report


def _md(report: dict) -> str:
    L = []
    banner = {"live": "", "offline-stub": "> **OFFLINE STUB RUN.** No AWS calls were made. Service usage comes from "
              "recorded fixture responses and a sine-tone TTS stand-in; the cost line shows what these usage numbers "
              "would cost at list prices.\n"}.get(report["runMode"], f"> Run mode: **{report['runMode']}**.\n")
    L += [f"# Sema pipeline report: {report['title'] or report['asset']}", "",
          f"Asset `{report['asset']}` - {report['filmSeconds']:.1f} s film - generated {report['generatedAt']}", ""]
    if banner:
        L += [banner]
    L += ["## Stage timings", "", "| Stage | Seconds | Mode | Status |", "|---|---:|---|---|"]
    for name in STAGES:
        t = report["timings"].get(name)
        if t:
            L.append(f"| {name} | {t['seconds'] if t['seconds'] is not None else '-'} | {t['mode']} | {t['status']} |")
    L += ["", f"Automated pipeline time (excluding human review): **{report['totalPipelineSeconds']} s**", ""]
    u = report["usage"]
    L += ["## Service usage", "", f"- Amazon S3: {u['s3']['requests']} upload(s), {u['s3']['bytes']:,} bytes",
          f"- Amazon Transcribe: {u['transcribe']['jobs']} job(s), {u['transcribe']['seconds']} s of media"]
    for model, m in u["bedrock"].items():
        L.append(f"- Amazon Bedrock `{model}`: {m['requests']} request(s), {m['inputTokens']:,} input / "
                 f"{m['outputTokens']:,} output tokens")
    for engine, p in u["polly"].items():
        L.append(f"- Amazon Polly ({engine}): {p['requests']} request(s), {p['characters']:,} characters")
    c = report["estimatedCost"]
    L += ["", "## Estimated cost (ESTIMATE, not a bill)", "", f"_{c['label']} Price table: {c['priceTableAsOf']}._", "",
          "| Service | Item | Quantity | USD |", "|---|---|---|---:|"]
    for line in c["lines"]:
        L.append(f"| {line['service']} | {line['item']} | {line['quantity']} | {line['usd']:.4f} |")
    L.append(f"| **total** | | | **{c['totalUSD']:.4f}** |")
    for item in c["unpriced"]:
        L.append(f"\nUnpriced: {item}")
    r = report["review"]
    L += ["", "## Human review", "",
          f"- Reviewer: {r['reviewer']} (method: {r['method']}; completed: {r['completed']})",
          f"- Review time: {r['reviewMinutes']} min; **{r['reviewMinutesPerFinishedMinute']} review minutes per "
          "finished video minute**",
          f"- Edits: {r['edits']}; dropped cues: {r['drops']}; critical events downgraded: {r['downgrades']}; "
          f"attached: {r['attachments']}"]
    if r["method"] == "approve-all":
        L += ["- NOTE: approved with --approve-all. The review time above is NOT a human review measurement "
              "and must not be quoted as one."]
    if r["blockers"]:
        L += ["- Blockers: " + "; ".join(r["blockers"])]
    f = report["fit"]
    s = f["summary"] or {}
    L += ["", "## Fit results", "",
          f"Fit mode: {f['fitMode']}. {s.get('variants', 0)} variants: {s.get('fitFirstTry', 0)} fit first try, "
          f"{s.get('fitAfterRegeneration', 0)} after regeneration, {s.get('unresolved', 0)} unresolved; "
          f"{s.get('regenerations', 0)} regenerations; minimum headroom {s.get('minHeadroom')} s.", "",
          "| Cue | Level | Window s | Speech budget s | Rendered s | Headroom s | Regens | Status |",
          "|---|---|---:|---:|---:|---:|---:|---|"]
    for row in f["rows"]:
        L.append(f"| {row['cue']} | {row['level']} | {row['window']:.2f} | {row['available']:.2f} | "
                 f"{row['duration']:.2f} | {row['headroom']:.2f} | {row['regenerations']} | {row['status']} |")
    if f.get("agent"):
        a = f["agent"]
        L += ["", f"Agent ({a['modelId']}): {a['runs']} runs, {a['toolCalls']} tool calls, "
              f"{a['claimMismatches']} claim/ledger mismatches."]
    o = report["observations"]
    L += ["", "## Observation and planning", "",
          f"- Model input: {o['source']}; {o['events']} events ({o['critical']} critical), {o['characters']} "
          f"characters, {o['repairs']} output repairs/notes",
          f"- {report['windows']} narration windows -> {report['cues']} cues",
          f"- Models: observe `{report['models']['observe']}`, script `{report['models']['script']}`, region "
          f"`{report['models']['region']}`"]
    if report["issues"]:
        L += ["", "## Issues flagged for the reviewer", ""]
        for i in report["issues"]:
            L.append(f"- [{i['severity']}] {i['type']}: {i['message']}")
    if report["package"]:
        p = report["package"]
        L += ["", "## Package", "", f"- `{p.get('path')}`: {p.get('validator')}"]
    L += ["", "## Caveats", "",
          "- Costs are estimates from a parameterized price table (`prices` in config); verify current pricing.",
          "- Model video sampling can miss brief actions; human review is mandatory before publication.", ""]
    return "\n".join(L)


def run_report(ws: Workspace, cfg: dict) -> tuple[dict, str]:
    report = build_report(ws, cfg)
    ws.write("pipeline-report.json", report)
    md = _md(report)
    ws.path("pipeline-report.md").write_text(md)
    return report, md
