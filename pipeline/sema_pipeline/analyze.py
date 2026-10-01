"""Stage 2 - analyze: Transcribe dialogue timing + local ffmpeg scenes/silence -> narration windows."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from . import media
from .aws import Services
from .timeline import (derive_windows, merge_dialogue, non_speech_sounds, overlap_seconds,
                       scenes_from_boundaries, words_from_transcript)
from .workspace import PipelineError, Workspace, now_iso

TRANSCRIBE_FORMATS = {"amr", "flac", "m4a", "mp3", "mp4", "ogg", "webm", "wav"}


def run_transcribe(ws: Workspace, cfg: dict, services: Services, manifest: dict) -> tuple[dict, dict]:
    """Start a Transcribe batch job on the S3 object, poll it, return (transcript_json, job_info)."""
    src = Path(manifest["source"]["path"])
    bucket, key = manifest["s3"]["bucket"], manifest["s3"]["key"]
    fmt = src.suffix.lower().lstrip(".")
    if fmt not in TRANSCRIBE_FORMATS:
        audio = media.extract_audio_m4a(src, ws.path("transcribe-audio.m4a"))
        key = f"{cfg['s3_prefix']}/{ws.asset}/source/transcribe-audio.m4a"
        services.s3.upload_file(str(audio), bucket, key, ExtraArgs={"ContentType": "audio/mp4"})
        ws.record_usage(stage="analyze", service="s3", mode=services.mode, bytes=audio.stat().st_size, requests=1)
        fmt = "m4a"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    job = f"sema-{ws.asset}-{stamp}"
    out_key = f"{cfg['s3_prefix']}/{ws.asset}/transcribe/{job}.json"
    request = {"TranscriptionJobName": job, "MediaFormat": fmt, "Media": {"MediaFileUri": f"s3://{bucket}/{key}"},
               "OutputBucketName": bucket, "OutputKey": out_key}
    if cfg.get("language_code", "en-US") == "auto":
        request["IdentifyLanguage"] = True
    else:
        request["LanguageCode"] = cfg.get("language_code", "en-US")
    services.transcribe.start_transcription_job(**request)
    deadline = time.monotonic() + float(cfg["transcribe"]["timeout_seconds"])
    while True:
        status = services.transcribe.get_transcription_job(TranscriptionJobName=job)["TranscriptionJob"]
        state = status["TranscriptionJobStatus"]
        if state == "COMPLETED":
            break
        if state == "FAILED":
            raise PipelineError(f"Transcribe job {job} failed: {status.get('FailureReason')}")
        if time.monotonic() > deadline:
            raise PipelineError(f"Transcribe job {job} did not finish within {cfg['transcribe']['timeout_seconds']} s")
        services.sleep(float(cfg["transcribe"]["poll_seconds"]))
    body = services.s3.get_object(Bucket=bucket, Key=out_key)["Body"].read()
    transcript = json.loads(body)
    seconds = float(manifest["source"]["duration"])
    ws.record_usage(stage="analyze", service="transcribe", mode=services.mode, seconds=seconds, job=job)
    if services.live and services.recorder_dir:
        rec = services.recorder_dir / "transcribe.json"
        rec.parent.mkdir(parents=True, exist_ok=True)
        rec.write_text(json.dumps(transcript, indent=2))
    return transcript, {"job": job, "mediaFormat": fmt, "languageCode": request.get("LanguageCode", "auto"),
                        "outputKey": out_key, "status": state}


def run_analyze(ws: Workspace, cfg: dict, services: Services, *, scene_threshold: float | None = None) -> dict:
    manifest = ws.read("manifest.json")
    src = Path(manifest["source"]["path"])
    duration = float(manifest["source"]["duration"])
    if not src.is_file():
        raise PipelineError(f"Source moved or deleted: {src}")
    # (a) dialogue from Amazon Transcribe word timestamps
    if manifest["source"].get("audioCodec"):
        transcript, job = run_transcribe(ws, cfg, services, manifest)
        ws.write("transcript.json", transcript)
    else:
        transcript, job = {"results": {"items": []}}, {"skipped": "no audio track"}
    words = words_from_transcript(transcript)
    dcfg = cfg["dialogue"]
    dialogue = merge_dialogue(words, dcfg["merge_gap"], dcfg["pad"], duration)
    # (b) local ffmpeg: shot changes and non-speech sound
    threshold = cfg["scenes"]["threshold"] if scene_threshold is None else scene_threshold
    cuts = media.detect_scene_changes(src, threshold)
    scenes = scenes_from_boundaries(cuts, duration, cfg["scenes"]["min_scene_seconds"])
    silences = (media.detect_silence(src, cfg["silence"]["noise_db"], cfg["silence"]["min_seconds"], duration)
                if manifest["source"].get("audioCodec") else [(0.0, duration)])
    sounds = non_speech_sounds(silences, dialogue, duration)
    # (c) candidate narration windows
    windows = derive_windows(dialogue, duration, scenes, cfg["windows"]["min_seconds"],
                             cfg["windows"]["split_at_scenes"])
    for w in windows:
        w["soundOverlap"] = overlap_seconds(w["start"], w["end"], sounds)
    analysis = {
        "asset": ws.asset, "duration": duration, "analyzedAt": now_iso(), "mode": services.mode,
        "transcribe": job, "wordCount": len(words),
        "dialogue": dialogue, "scenes": scenes, "sceneCuts": [round(c, 3) for c in cuts],
        "sceneThreshold": threshold, "silences": [{"start": s, "end": e} for s, e in silences],
        "sounds": sounds, "windows": windows,
        "params": {"mergeGap": dcfg["merge_gap"], "pad": dcfg["pad"], "minWindow": cfg["windows"]["min_seconds"]},
    }
    ws.write("analysis.json", analysis)
    return analysis
