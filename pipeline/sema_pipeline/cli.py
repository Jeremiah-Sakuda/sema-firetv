"""python -m sema_pipeline <command> ...

Every command is OFFLINE by default (stub AWS clients, no network, no cost).
Pass --live to use real AWS; live commands ask for confirmation unless --yes.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .aws import LiveCallsForbidden, Services, StubMissing, live_services, stub_services
from .config import PIPELINE_DIR, PROJECT_ROOT, load_config
from .workspace import PipelineError, Workspace

STAGE_FILES = [("ingest", "manifest.json"), ("analyze", "analysis.json"), ("observe", "observations.json"),
               ("script", "script.json"), ("render", "render.json"), ("review", "review.json"),
               ("package", "package-result.json"), ("report", "pipeline-report.json")]


STAGE_INPUT = {"observe": "analysis.json", "script": "observations.json", "render": "script.json",
               "review": "render.json", "package": "render.json"}


def _err(msg: str) -> None:
    print(msg, file=sys.stderr)


def require_fresh(ws: Workspace, command: str) -> None:
    """Refuse to build on outputs that are older than something upstream of them."""
    if command in STAGE_INPUT and ws.exists(STAGE_INPUT[command]):
        stale = ws.stale_inputs(STAGE_INPUT[command])
        if stale:
            raise PipelineError(f"Stale inputs for '{command}': {'; '.join(stale)}. Re-run the stale stage(s) in "
                                "order (analyze -> observe -> script -> render) first.")


def make_services(args, cfg: dict, ws: Workspace | None, stub_root: Path) -> Services:
    if args.live:
        if not args.yes:
            if not sys.stdin.isatty():
                raise PipelineError("--live needs confirmation; pass --yes in non-interactive shells.")
            answer = input(f"LIVE MODE: '{args.command}' will call AWS in {cfg['region']} and may incur charges. "
                           "Continue? [y/N] ")
            if answer.strip().lower() not in {"y", "yes"}:
                raise PipelineError("Cancelled; no AWS calls were made.")
        _err(f"[sema] LIVE: real AWS clients, region {cfg['region']}")
        return live_services(cfg, recorder_dir=ws.recorded_dir if ws else None)
    if ws is not None:
        from .report import run_mode
        if run_mode(ws) in {"live", "mixed"}:
            _err("[sema] WARNING: earlier stages of this asset ran LIVE but this command is OFFLINE (stub clients). "
                 "Its outputs (e.g. sine-tone audio) will mark the run 'mixed', and package will not publish to "
                 "media/ by default. Add --live to stay consistent.")
    replay = Path(args.replay) if getattr(args, "replay", None) else None
    if replay is None and ws and ws.recorded_dir.is_dir():
        replay = ws.recorded_dir
    _err("[sema] OFFLINE: stub AWS clients, no network calls"
         + (f"; replaying recorded responses from {replay}" if replay else ""))
    return stub_services(cfg, replay, stub_root)


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--config", help="JSON config file (default: pipeline/config.json if present)")
    common.add_argument("--work-root", help="Working directory root (default: pipeline/work)")
    common.add_argument("--live", action="store_true", help="Use real AWS services (costs money)")
    common.add_argument("--yes", action="store_true", help="Skip the --live confirmation prompt")
    common.add_argument("--replay", help="Offline: directory with recorded responses (transcribe.json, bedrock/*.json)")

    parser = argparse.ArgumentParser(prog="python -m sema_pipeline", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    def add(name, help_text):
        p = sub.add_parser(name, parents=[common], help=help_text)
        if name != "prompts":
            p.add_argument("--asset", required=True, help="Asset id ([a-zA-Z0-9_-]); becomes media/<asset>/")
        return p

    def ingest_args(p):
        p.add_argument("--source", required=True, help="Path to the authorized source film (MP4 recommended)")
        p.add_argument("--rights", required=True, help="Rights statement text, or a path to a rights file")
        p.add_argument("--title", required=True)
        p.add_argument("--synopsis", default="", help="Spoiler-free synopsis shown in the catalog")
        p.add_argument("--credits", default="", help="Attribution string (e.g. CC-BY credit)")
        p.add_argument("--bucket", help="S3 bucket (default: SEMA_BUCKET / config)")
        p.add_argument("--create-bucket", action="store_true", help="Live: create the bucket if missing")

    ingest_args(add("ingest", "Upload source to S3, checksum, record rights"))
    p = add("analyze", "Transcribe dialogue + ffmpeg scenes/silence -> narration windows")
    p.add_argument("--scene-threshold", type=float, help="ffmpeg scene score threshold (default 0.3)")
    p = add("observe", "Bedrock Nova: timestamped visual events")
    p.add_argument("--frames", type=float, metavar="FPS", help="Fallback: send ffmpeg frames at FPS instead of video")
    p.add_argument("--model", help="Override observe model id / inference profile")
    p = add("script", "Bedrock: Essential/Standard/Rich cues + spoiler-safe recoveries")
    p.add_argument("--model", help="Override script model id / inference profile")
    p = add("render", "Polly + ffprobe fit loop")
    p.add_argument("--agent", action="store_true", help="Use the Strands agent fit loop (optional dependency)")
    p = add("review", "Human review (interactive) or --approve-all for scripted tests")
    p.add_argument("--reviewer", required=True, help="Reviewer name recorded in the approval")
    p.add_argument("--approve-all", action="store_true", help="Non-interactive approval, recorded as such")
    p.add_argument("--restart", action="store_true", help="Discard saved review progress")
    p = add("package", "Write media/<asset>/package.json and validate with node tools/validate.js")
    p.add_argument("--web-root", help="Player web root (default: project root for live runs, pipeline/out otherwise)")
    p.add_argument("--version", dest="pkg_version", help="Package version string")
    p.add_argument("--draft", action="store_true", help="Write an unpublishable draft to work/ for inspection")
    add("report", "Write work/<asset>/pipeline-report.{json,md}")
    add("status", "Show stage status for an asset")
    p = add("run", "ingest -> analyze -> observe -> script -> render (stops before human review)")
    ingest_args(p)
    p.add_argument("--scene-threshold", type=float)
    p.add_argument("--frames", type=float, metavar="FPS")
    p.add_argument("--agent", action="store_true")
    p = add("prompts", "Render the UI prompt set to media/prompts/")
    p.add_argument("--web-root", help="Output web root (default: project root with --live, pipeline/out otherwise)")
    p.add_argument("--prompts-file", default=str(PIPELINE_DIR / "prompts.json"))
    return parser


def _print_json(obj) -> None:
    print(json.dumps(obj, indent=2, default=str))


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        cfg = load_config(args.config)
        work_root = Path(args.work_root) if args.work_root else PIPELINE_DIR / "work"
        if args.command == "prompts":
            from .prompts import run_prompts
            services = make_services(args, cfg, None, work_root / "_stub")
            web_root = Path(args.web_root) if args.web_root else (PROJECT_ROOT if args.live else PIPELINE_DIR / "out")
            out = run_prompts(cfg, services, web_root=web_root, prompts_file=Path(args.prompts_file),
                              report_dir=work_root / "_prompts")
            print(f"Rendered {out['meta']['count']} prompts ({out['meta']['characters']} characters) -> "
                  f"{out['meta']['output']}")
            return 0

        ws = Workspace(args.asset, work_root)
        require_fresh(ws, args.command)
        if args.command == "status":
            return _status(ws)
        if args.command == "report":
            from .report import run_report
            with ws.stage("report", "local"):
                _report, md = run_report(ws, cfg)
            print(md)
            print(f"Wrote {ws.dir / 'pipeline-report.md'}")
            return 0
        if args.command == "package":
            from .package import run_package
            with ws.stage("package", "local"):
                result = run_package(ws, cfg, web_root=Path(args.web_root) if args.web_root else None,
                                     version=args.pkg_version, draft=args.draft)
            print(f"PACKAGE OK: {result['path']}\n  {result['validator']}")
            return 0
        if args.command == "review":
            from .report import run_mode
            from .review import ReviewIO, run_review
            services = None
            if args.live or run_mode(ws) == "offline-stub":
                services = make_services(args, cfg, ws, ws.stub_root)
            with ws.stage("review", services.mode if services else "local") as entry:
                log = run_review(ws, cfg, services, reviewer=args.reviewer, approve_all=args.approve_all,
                                 io=ReviewIO(), restart=args.restart)
                entry["completed"] = log["completed"]
            if log["completed"]:
                print(f"REVIEW COMPLETE ({log['method']}): {len(log['edits'])} edits, {len(log['drops'])} drops, "
                      f"{log['reviewMinutes']} min. Next: package.")
                return 0
            _err("REVIEW NOT COMPLETE. Blockers: " + ("; ".join(log["blockers"]) or "none") +
                 f". Pending items: {len(log['pending'])}. Re-run review to continue.")
            return 1

        services = make_services(args, cfg, ws, ws.stub_root)
        stages = {"ingest": _ingest, "analyze": _analyze, "observe": _observe, "script": _script, "render": _render}
        if args.command in stages:
            stages[args.command](ws, cfg, services, args)
            return 0
        if args.command == "run":
            for name in ("ingest", "analyze", "observe", "script", "render"):
                stages[name](ws, cfg, services, args)
            print(f"\nAutomated stages done. Next (human): python -m sema_pipeline review --asset {ws.asset} "
                  "--reviewer \"Your Name\"" + (" --live" if args.live else ""))
            return 0
        raise PipelineError(f"Unknown command {args.command}")
    except (PipelineError, LiveCallsForbidden, StubMissing) as exc:
        _err(f"\nERROR: {exc}")
        return 1


def _ingest(ws, cfg, services, args):
    from .ingest import run_ingest
    confirm = (lambda q: input(q).strip().lower() in {"y", "yes"}) if sys.stdin.isatty() else None
    with ws.stage("ingest", services.mode):
        m = run_ingest(ws, cfg, services, source=args.source, rights=args.rights, title=args.title,
                       synopsis=args.synopsis, credits=args.credits, bucket=args.bucket,
                       create_bucket=args.create_bucket, confirm=confirm)
    print(f"ingest: {m['source']['filename']} ({m['source']['bytes']:,} bytes, {m['source']['duration']} s, "
          f"sha256 {m['source']['sha256'][:12]}...) -> {m['s3']['uri']}")
    for w in m["warnings"]:
        print(f"  warning: {w}")


def _analyze(ws, cfg, services, args):
    from .analyze import run_analyze
    with ws.stage("analyze", services.mode):
        a = run_analyze(ws, cfg, services, scene_threshold=args.scene_threshold)
    print(f"analyze: {a['wordCount']} words -> {len(a['dialogue'])} dialogue spans; {len(a['scenes'])} scenes; "
          f"{len(a['windows'])} narration windows ({sum(w['seconds'] for w in a['windows']):.1f} s)")


def _observe(ws, cfg, services, args):
    from .observe import run_observe, summarize
    with ws.stage("observe", services.mode):
        o = run_observe(ws, cfg, services, frames_fps=args.frames, model_id=getattr(args, "model", None))
    print(f"observe ({o['model']['modelId']}, {o['model'].get('videoSource')}): {summarize(o)}")


def _script(ws, cfg, services, args):
    from .script import run_script
    with ws.stage("script", services.mode):
        s = run_script(ws, cfg, services, model_id=getattr(args, "model", None))
    print(f"script: {len(s['cues'])} cues, {len(s['recoveries'])} recoveries, unplaced events: {s['unplaced'] or 'none'}")
    issues = ws.read("issues.json", default={"issues": []})["issues"]
    for i in issues:
        if i["severity"] == "blocking":
            print(f"  BLOCKING: {i['message']}")


def _render(ws, cfg, services, args):
    from .render import run_render
    with ws.stage("render", services.mode):
        r = run_render(ws, cfg, services, agent=args.agent)
    s = r["summary"]
    print(f"render ({r['fitMode']}): {s['variants']} variants; {s['fitFirstTry']} fit first try, "
          f"{s['fitAfterRegeneration']} after regeneration, {s['unresolved']} unresolved; {s['recoveries']} recoveries")


def _status(ws: Workspace) -> int:
    log = ws.run_log()["stages"]
    for name, filename in STAGE_FILES:
        s = log.get(name, {})
        present = "yes" if ws.exists(filename) else "no"
        print(f"{name:<8} {s.get('status', '-'):<8} {str(s.get('mode', '-')):<6} {str(s.get('seconds', '-')):>8}s  "
              f"{filename}: {present}")
    issues = ws.read("issues.json", default={"issues": []})["issues"]
    for i in issues:
        print(f"  [{i['severity']}] {i['message']}")
    return 0
