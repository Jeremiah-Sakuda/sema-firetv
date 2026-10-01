"""Stage 7 - package: write media/<asset>/package.json + media files, then run the
player's own validator (node tools/validate.js) and fail loudly on any error."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from .config import PIPELINE_DIR, PROJECT_ROOT
from .report import aggregate_usage, estimate_cost, run_mode
from .review import approval_record
from .timeline import LEVELS
from .workspace import PipelineError, Workspace, now_iso

RESERVED_IDS = {"prompts"}


def default_web_root(ws: Workspace) -> Path:
    """Live runs publish into the player's web root; anything else goes to pipeline/out."""
    return PROJECT_ROOT if run_mode(ws) == "live" else PIPELINE_DIR / "out"


def validate_with_node(package_path: Path, validator: Path | None = None, fixture: bool = False) -> tuple[bool, str]:
    validator = validator or PROJECT_ROOT / "tools" / "validate.js"
    node = shutil.which("node") or "/opt/homebrew/bin/node"
    args = [node, str(validator), str(package_path)] + (["--fixture"] if fixture else [])
    proc = subprocess.run(args, capture_output=True, text=True)
    return proc.returncode == 0, (proc.stdout + proc.stderr).strip()


def _copy(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)


def run_package(ws: Workspace, cfg: dict, *, web_root: Path | None = None, version: str | None = None,
                validator: Path | None = None, draft: bool = False) -> dict:
    if ws.asset in RESERVED_IDS:
        raise PipelineError(f"Asset id '{ws.asset}' is reserved")
    manifest, analysis = ws.read("manifest.json"), ws.read("analysis.json")
    obs, script, render = ws.read("observations.json"), ws.read("script.json"), ws.read("render.json")
    review = ws.read("review.json", default={"completed": False})
    if not ws.exists("reviewed.json"):
        raise PipelineError("No review yet. Run `review` (interactive) before packaging.")
    doc = ws.read("reviewed.json")
    if doc.get("renderedAt") != render.get("renderedAt"):
        raise PipelineError("render.json changed after the review; run `review` again before packaging.")
    approved = bool(review.get("completed"))
    if not approved and not draft:
        raise PipelineError("Review is not complete; refusing to publish. Pending: "
                            f"{review.get('pending', [])[:5]} Blockers: {review.get('blockers', [])}. "
                            "Finish `review`, or pass --draft to write an unpublishable draft for inspection.")

    web_root = Path(web_root) if web_root else default_web_root(ws)
    if draft:
        asset_dir, rel_prefix = ws.dir / "draft" / "media" / ws.asset, f"media/{ws.asset}"
    else:
        asset_dir, rel_prefix = web_root / "media" / ws.asset, f"media/{ws.asset}"
    asset_dir.mkdir(parents=True, exist_ok=True)

    src_video = Path(manifest["source"]["path"])
    video_name = f"film{src_video.suffix.lower()}"
    _copy(src_video, asset_dir / video_name)

    cues = []
    for c in doc["cues"]:
        if c["dropped"]:
            continue
        variants = {}
        for level in LEVELS:
            v = c["variants"][level]
            name = f"audio/{c['id']}-{level}.mp3"
            _copy(ws.dir / v["audio"], asset_dir / name)
            variants[level] = {"text": v["text"], "audio": f"{rel_prefix}/{name}", "duration": v["duration"]}
        cues.append({"id": c["id"], "events": c["events"], "start": c["start"], "end": c["end"],
                     "margin": c["margin"], "variants": variants})
    events = []
    for e in doc["events"]:
        name = f"audio/recover-{e['id']}.mp3"
        _copy(ws.dir / e["recovery"]["audio"], asset_dir / name)
        events.append({"id": e["id"], "scene": e["scene"], "availableAt": e["availableAt"], "critical": e["critical"],
                       "recovery": {"text": e["recovery"]["text"], "audio": f"{rel_prefix}/{name}",
                                    "duration": e["recovery"]["duration"]}})

    rows = ws.usage()
    stages = ws.run_log()["stages"]
    package = {
        "id": ws.asset,
        "version": version or f"1.0.0+{now_iso()[:10].replace('-', '')}",
        "title": manifest["title"],
        "synopsis": manifest.get("synopsis", ""),
        "duration": analysis["duration"],
        "video": f"{rel_prefix}/{video_name}",
        "reviewStatus": "approved" if approved else "draft",
        "rights": manifest["rights"]["text"],
        "credits": manifest.get("credits", ""),
        "scenes": analysis["scenes"],
        "dialogue": analysis["dialogue"],
        "events": events,
        "cues": cues,
        "approval": approval_record(review) if approved else None,
        "pipeline": {
            "mode": run_mode(ws),
            "models": {"observe": obs["model"]["modelId"], "script": script["model"]["modelId"],
                       **({"fitAgent": render["agent"]["modelId"]} if render.get("agent") else {})},
            "observeInput": obs["model"].get("videoSource"),
            "region": obs["model"].get("region"),
            "voice": render["voice"],
            "fitMode": render["fitMode"],
            "fitSlackSeconds": render["slack"],
            "timings": {name: s.get("seconds") for name, s in stages.items()
                        if s.get("status") == "done" and name not in {"package", "report"}},
            "usage": aggregate_usage(rows),
            "estimatedCostUSD": estimate_cost(rows, cfg["prices"])["totalUSD"],
            "estimatedCostNote": "List-price estimate; see pipeline-report.md",
            "sourceSha256": manifest["source"]["sha256"],
            "generatedAt": now_iso(),
        },
    }
    if package["approval"] is None:
        del package["approval"]

    target = (ws.dir / "package.draft.json") if draft else (asset_dir / "package.json")
    previous = json.loads(target.read_text()) if target.is_file() else None
    target.write_text(json.dumps(package, indent=2, ensure_ascii=False) + "\n")
    if previous and isinstance(previous.get("pipeline"), dict):
        # Remove audio this pipeline wrote for an older package that is no longer referenced.
        keep = {v["audio"] for c in cues for v in c["variants"].values()} | {e["recovery"]["audio"] for e in events}
        old = {v["audio"] for c in previous.get("cues", []) for v in c["variants"].values()}
        old |= {e["recovery"]["audio"] for e in previous.get("events", [])}
        for stale in old - keep:
            if stale.startswith(f"{rel_prefix}/audio/"):
                (asset_dir / stale[len(rel_prefix) + 1:]).unlink(missing_ok=True)

    ok, output = validate_with_node(target, validator)
    result = {"path": str(target), "webRoot": str(web_root), "valid": ok, "validator": output.splitlines()[-1] if ok else "FAILED",
              "validatorOutput": output, "reviewStatus": package["reviewStatus"], "packagedAt": now_iso(),
              "cues": len(cues), "events": len(events)}
    ws.write("package-result.json", result)
    if not ok:
        raise PipelineError(f"PACKAGE VALIDATION FAILED for {target}:\n{output}")
    return result
