"""Readiness checks. Local mode never invokes AWS; --live uses STS only.

Authentication proves an identity exists, not permission to invoke every service.
No credentials, account IDs or identity ARNs are written to the report.
"""
from __future__ import annotations

import os
import shutil


def check_readiness(cfg: dict, *, profile: str | None = None, live: bool = False,
                    session_factory=None) -> dict:
    checks = []
    def add(name, ok, detail):
        checks.append({"check": name, "ok": bool(ok), "detail": detail})

    for tool in ("ffmpeg", "ffprobe", "node"):
        add(tool, shutil.which(tool), "available" if shutil.which(tool) else "install before processing films")
    bucket = cfg.get("bucket")
    add("bucket", bucket and bucket != "your-sema-bucket-name", "configured" if bucket and bucket != "your-sema-bucket-name" else "set SEMA_BUCKET or --bucket")
    if live and os.environ.get("SEMA_FORBID_LIVE") == "1":
        add("authentication", False, "SEMA_FORBID_LIVE=1; no AWS calls permitted")
        return {"ready": False, "mode": "sts-only", "checks": checks}
    # This is a desktop pipeline; do not probe EC2 metadata on a developer Mac.
    os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
    if session_factory is None:
        import boto3
        session_factory = boto3.Session
    try:
        session = session_factory(profile_name=profile, region_name=cfg["region"])
        credentials = session.get_credentials()
        add("credentials", credentials is not None, "configured; authentication not yet tested" if credentials else "sign in to AWS; do not put access keys in the repository")
        if live and credentials:
            from botocore.config import Config
            session.client("sts", config=Config(connect_timeout=10, read_timeout=10, retries={"max_attempts": 1})).get_caller_identity()
            add("authentication", True, "STS succeeded; model and service permissions remain to be exercised")
    except Exception as exc:
        code = getattr(exc, "response", {}).get("Error", {}).get("Code") or type(exc).__name__
        add("authentication" if live else "credentials", False, f"{code}; configure or renew the AWS sign-in")
    return {"ready": all(c["ok"] for c in checks), "mode": "sts-only" if live else "local",
            "profile": profile or "default credential chain", "region": cfg["region"],
            "models": {key: cfg[key]["model_id"] for key in ("observe", "script")},
            "checks": checks}
