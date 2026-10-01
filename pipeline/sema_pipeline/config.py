"""Configuration: built-in defaults <- config.json <- environment variables <- CLI flags.

Nothing here is secret. AWS credentials are never read by this module; boto3
resolves them itself (env vars, ~/.aws, SSO) only when a command runs with --live.
"""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = PIPELINE_DIR.parent

DEFAULTS: dict = {
    "region": "us-east-1",
    "bucket": None,
    "s3_prefix": "sema",
    "language_code": "en-US",
    "dialogue": {"merge_gap": 0.6, "pad": 0.1},
    "scenes": {"threshold": 0.3, "min_scene_seconds": 1.0},
    "silence": {"noise_db": -35, "min_seconds": 0.5},
    "windows": {"min_seconds": 1.5, "split_at_scenes": True},
    "cues": {
        # Validator minimum is 0.2 s on each side of the narration.
        "margin": 0.2,
        # Extra pipeline-only headroom: the player polls the media clock every
        # ~30 ms, so a cue that fits with zero slack can be judged late at runtime.
        "fit_slack": 0.15,
        "max_events_per_cue": 3,
    },
    "observe": {
        "model_id": "us.amazon.nova-pro-v1:0",
        # auto: inline bytes when the file is <= inline_max_mb, else the S3 URI.
        "video_source": "auto",
        "inline_max_mb": 18,
        "max_tokens": 4096,
        "temperature": 0.0,
        "top_p": 0.9,
        "frames_batch": 10,
        "frame_width": 640,
    },
    "script": {
        "model_id": "us.amazon.nova-pro-v1:0",
        "max_tokens": 1200,
        "temperature": 0.3,
        "top_p": 0.9,
        "words_per_second": 2.6,
        "safety": 0.85,
        "max_budget_seconds": 10.0,
        "level_ratios": {"essential": 0.45, "standard": 0.7, "rich": 1.0},
        "recovery_max_words": 40,
    },
    "render": {
        "voice_id": "Joanna",
        "engine": "neural",
        # Polly MP3 supports 8000/16000/22050/24000 Hz; neural default is 24000.
        "sample_rate": "24000",
        "max_retries": 2,
    },
    "agent": {"model_id": "us.amazon.nova-pro-v1:0", "max_renders": 3},
    "transcribe": {"poll_seconds": 5, "timeout_seconds": 1800},
    "bedrock": {"request_metadata": True, "max_attempts": 4},
    # ESTIMATES ONLY. On-demand list prices, us-east-1, as recalled when this file
    # was written (2026-10). Verify at https://aws.amazon.com/pricing/ before
    # quoting numbers. Free tier and credits are ignored.
    "prices": {
        "asOf": "2026-10-01 (unverified estimate; check aws.amazon.com/pricing)",
        "currency": "USD",
        "transcribe_per_minute": 0.024,
        "transcribe_min_seconds": 15,
        "polly_per_million_chars": {"standard": 4.0, "neural": 16.0, "long-form": 100.0, "generative": 30.0},
        "bedrock_per_1k_tokens": {
            "amazon.nova-pro-v1:0": {"input": 0.0008, "output": 0.0032},
            "amazon.nova-lite-v1:0": {"input": 0.00006, "output": 0.00024},
            "amazon.nova-micro-v1:0": {"input": 0.000035, "output": 0.00014},
        },
        "s3_per_gb_month": 0.023,
    },
}

ENV_OVERRIDES = {
    "SEMA_BUCKET": ("bucket",),
    "SEMA_REGION": ("region",),
    "SEMA_OBSERVE_MODEL": ("observe", "model_id"),
    "SEMA_SCRIPT_MODEL": ("script", "model_id"),
    "SEMA_AGENT_MODEL": ("agent", "model_id"),
    "SEMA_VOICE": ("render", "voice_id"),
    "SEMA_ENGINE": ("render", "engine"),
}


def _merge(base: dict, override: dict) -> dict:
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _merge(base[key], value)
        else:
            base[key] = value
    return base


def _set(cfg: dict, path: tuple, value) -> None:
    node = cfg
    for key in path[:-1]:
        node = node.setdefault(key, {})
    node[path[-1]] = value


def load_config(path: str | os.PathLike | None = None, env: dict | None = None) -> dict:
    """Return the effective configuration. `path` defaults to pipeline/config.json if present."""
    env = os.environ if env is None else env
    cfg = copy.deepcopy(DEFAULTS)
    candidate = Path(path) if path else PIPELINE_DIR / "config.json"
    file_cfg: dict = {}
    if candidate.is_file():
        file_cfg = json.loads(candidate.read_text())
        _merge(cfg, file_cfg)
    elif path:
        raise FileNotFoundError(f"Config file not found: {candidate}")
    # Region precedence: SEMA_REGION > config.json > AWS_REGION/AWS_DEFAULT_REGION > default.
    if "region" not in file_cfg:
        aws_region = env.get("AWS_REGION") or env.get("AWS_DEFAULT_REGION")
        if aws_region:
            cfg["region"] = aws_region
    for name, key_path in ENV_OVERRIDES.items():
        if env.get(name):
            _set(cfg, key_path, env[name])
    return cfg


def base_model_id(model_id: str) -> str:
    """'us.amazon.nova-pro-v1:0' -> 'amazon.nova-pro-v1:0' (strip cross-region profile prefix)."""
    parts = model_id.split(".", 1)
    if len(parts) == 2 and parts[0] in {"us", "eu", "apac", "global", "us-gov", "jp", "au", "ca"}:
        return parts[1]
    return model_id
