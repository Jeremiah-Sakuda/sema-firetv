#!/usr/bin/env python3
"""Run both authorized excerpts through AWS, stopping before human approval.

Default is a command preview. --live executes the real services. Run once;
individual stages can resume a partial run using pipeline/README.md.
"""
import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from sema_pipeline.config import load_config
from sema_pipeline.preflight import check_readiness

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="sema")
    parser.add_argument("--bucket", help="Private S3 bucket (or set SEMA_BUCKET)")
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--create-bucket", action="store_true")
    parser.add_argument("--frames", type=float, default=2, help="Source-PTS frame sampling rate; default 2")
    parser.add_argument("--script-model", default="us.amazon.nova-2-lite-v1:0", help="Writer/shortener used in the revised pilot")
    args = parser.parse_args()
    cfg = load_config()
    if args.bucket:
        cfg["bucket"] = args.bucket
    films = [
        ("sintel-dragon", "sintel-dragon.mp4", "Sintel — The Rooftop", "An encounter on a rooftop.", "© copyright Blender Foundation | durian.blender.org | CC BY 3.0"),
        ("tears-of-steel", "tears-of-steel-opening.mp4", "Tears of Steel — The Bridge", "Two people meet on a bridge.", "(CC) Blender Foundation | mango.blender.org | CC BY 3.0"),
    ]
    commands = [[sys.executable, "-m", "sema_pipeline", "prompts", "--live", "--yes"]]
    for asset, source, title, synopsis, credits in films:
        if not (ROOT / "content/sources" / source).is_file():
            print(f"Missing content/sources/{source}; run npm run content:fetch", file=sys.stderr)
            return 1
        command = [sys.executable, "-m", "sema_pipeline", "run", "--live", "--yes", "--frames", str(args.frames), "--asset", asset,
                   "--source", str(ROOT / "content/sources" / source), "--rights", str(ROOT / "content/rights" / f"{asset}.txt"),
                   "--title", title, "--synopsis", synopsis, "--credits", credits]
        if args.create_bucket:
            command.append("--create-bucket")
        commands.append(command)
    if not args.live:
        print("PREVIEW ONLY; no AWS calls. Working directory: pipeline/")
        print(f"Writer/shortener: {args.script_model}. Drafts still require editorial and human review.")
        for command in commands:
            print(shlex.join(command))
        print("Use --live to execute after configuring the AWS profile and bucket.")
        return 0
    readiness = check_readiness(cfg, profile=args.profile, live=True)
    print(json.dumps(readiness, indent=2), flush=True)
    if not readiness["ready"]:
        return 1
    env = {**os.environ, "AWS_PROFILE": args.profile, "SEMA_REGION": cfg["region"], "SEMA_BUCKET": cfg["bucket"], "SEMA_SCRIPT_MODEL": args.script_model}
    for command in commands:
        result = subprocess.run(command, cwd=ROOT / "pipeline", env=env)
        if result.returncode:
            print("Stopped at the first failure. Resume the affected stage; do not rerun successful paid stages.", file=sys.stderr)
            return result.returncode
    print("AWS drafts and guidance generated. A human must review both films before packaging:")
    for asset, *_ in films:
        print(f'python -m sema_pipeline review --live --asset {asset} --reviewer "YOUR NAME"')
    print("After approval: package and report each asset, then npm run webm, posters, bundle, release:check and vega:sync.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
