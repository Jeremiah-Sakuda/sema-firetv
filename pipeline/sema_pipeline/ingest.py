"""Stage 1 - ingest: checksum + rights record + upload the source film to S3."""
from __future__ import annotations

import mimetypes
from pathlib import Path

from . import media
from .aws import Services
from .workspace import PipelineError, Workspace, now_iso


def read_rights(value: str) -> dict:
    """--rights accepts literal text or a path to a text file."""
    if not value or not value.strip():
        raise PipelineError("--rights is required: a rights statement or a path to a rights file.")
    path = Path(value).expanduser()
    if len(value) < 1024 and path.is_file():
        text = path.read_text().strip()
        source = f"file:{path.name}"
    else:
        text, source = value.strip(), "inline"
    if not text:
        raise PipelineError("Rights record is empty.")
    return {"text": text, "source": source, "recordedAt": now_iso()}


def ensure_bucket(services: Services, bucket: str, region: str, *, create: bool, confirm=None) -> str:
    """Return 'exists' | 'created'. Creation only happens with --create-bucket or an interactive yes."""
    try:
        services.s3.head_bucket(Bucket=bucket)
        return "exists"
    except Exception as exc:  # botocore ClientError or the stub's equivalent
        code = str(getattr(exc, "response", {}).get("Error", {}).get("Code", ""))
        if code in {"403", "AccessDenied", "Forbidden"}:
            raise PipelineError(f"Bucket '{bucket}' exists but this identity cannot access it (403). "
                                "Pick another name via SEMA_BUCKET or fix the IAM policy.") from exc
        if code not in {"404", "NoSuchBucket", "NotFound"}:
            raise
    if services.mode == "stub":
        services.s3.create_bucket(Bucket=bucket)
        return "created"
    if not create and not (confirm and confirm(f"S3 bucket '{bucket}' does not exist in {region}. Create it? [y/N] ")):
        raise PipelineError(f"S3 bucket '{bucket}' does not exist. Re-run with --create-bucket, or create it yourself.")
    kwargs: dict = {"Bucket": bucket}
    if region != "us-east-1":
        kwargs["CreateBucketConfiguration"] = {"LocationConstraint": region}
    services.s3.create_bucket(**kwargs)  # new buckets block public access and use SSE-S3 by default
    return "created"


def run_ingest(ws: Workspace, cfg: dict, services: Services, *, source: str, rights: str, title: str,
               synopsis: str = "", credits: str = "", bucket: str | None = None,
               create_bucket: bool = False, confirm=None) -> dict:
    src = Path(source).expanduser().resolve()
    if not src.is_file():
        raise PipelineError(f"Source video not found: {src}")
    rights_record = read_rights(rights)
    bucket = bucket or cfg.get("bucket")
    if not bucket:
        raise PipelineError("No S3 bucket configured. Set SEMA_BUCKET, add \"bucket\" to pipeline/config.json, or pass --bucket.")
    info = media.probe(src)
    warnings = []
    if info.get("videoCodec") != "h264" or "mp4" not in (info.get("format") or ""):
        warnings.append(f"Source is {info.get('format')}/{info.get('videoCodec')}; the Fire TV WebView player is "
                        "only tested with H.264/AAC MP4. Consider transcoding before ingest.")
    if not info.get("audioCodec"):
        warnings.append("Source has no audio track; Transcribe will be skipped and every gap is a window.")
    digest = media.sha256(src)
    size = src.stat().st_size
    bucket_state = ensure_bucket(services, bucket, cfg["region"], create=create_bucket, confirm=confirm)
    key = f"{cfg['s3_prefix']}/{ws.asset}/source/{digest[:12]}{src.suffix.lower()}"
    content_type = mimetypes.guess_type(src.name)[0] or "application/octet-stream"
    services.s3.upload_file(str(src), bucket, key,
                            ExtraArgs={"ContentType": content_type, "Metadata": {"sha256": digest}})
    ws.record_usage(stage="ingest", service="s3", mode=services.mode, bytes=size, requests=1)
    manifest = {
        "asset": ws.asset,
        "title": title,
        "synopsis": synopsis,
        "credits": credits,
        "rights": rights_record,
        "source": {"path": str(src), "filename": src.name, "sha256": digest, "bytes": size, **info},
        "s3": {"bucket": bucket, "key": key, "uri": f"s3://{bucket}/{key}", "region": cfg["region"],
               "bucketState": bucket_state},
        "mode": services.mode,
        "ingestedAt": now_iso(),
        "warnings": warnings,
    }
    ws.write("manifest.json", manifest)
    return manifest
