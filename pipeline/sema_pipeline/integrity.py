"""Bind review decisions to the actual source, scripts, timing and spoken bytes.

Fingerprints detect accidental changes; they are not signatures or an accuracy
assessment. A human still checks facts and listens to the finished artifacts.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .workspace import PipelineError, Workspace


def text_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str:
    try:
        with path.open("rb") as handle:
            digest = hashlib.file_digest(handle, "sha256")
        return digest.hexdigest()
    except OSError as exc:
        raise PipelineError(f"Review artifact missing or unreadable: {path.name}") from exc


def document_sha256(doc: dict) -> str:
    return text_sha256(json.dumps(doc, sort_keys=True, ensure_ascii=False, separators=(",", ":")))


def artifact_fingerprints(ws: Workspace, doc: dict) -> dict:
    items = {}
    for cue in doc["cues"]:
        if cue["dropped"]:
            continue
        for level, variant in cue["variants"].items():
            items[f"cue:{cue['id']}:{level}"] = {
                "textSha256": text_sha256(variant["text"]), "duration": variant["duration"],
                "audioSha256": file_sha256(ws.dir / variant["audio"])}
    for event in doc["events"]:
        recovery = event["recovery"]
        items[f"recovery:{event['id']}"] = {
            "textSha256": text_sha256(recovery["text"]), "duration": recovery["duration"],
            "audioSha256": file_sha256(ws.dir / recovery["audio"])}
    return items


def review_fingerprint(ws: Workspace, doc: dict) -> dict:
    manifest = ws.read("manifest.json")
    source_hash = file_sha256(Path(manifest["source"]["path"]))
    if source_hash != manifest["source"]["sha256"]:
        raise PipelineError("Source changed since ingest; ingest and review again.")
    return {"schemaVersion": 1, "sourceSha256": source_hash,
            "inputs": {name: file_sha256(ws.dir / name) for name in ws.CHAIN},
            "reviewedDocumentSha256": document_sha256(doc),
            "artifacts": artifact_fingerprints(ws, doc)}


def playback_contract(analysis: dict, doc: dict) -> dict:
    return {"duration": analysis["duration"], "scenes": analysis["scenes"],
            "dialogue": analysis["dialogue"],
            "events": [{k: e[k] for k in ("id", "scene", "availableAt", "critical")} for e in doc["events"]],
            "cues": [{k: c[k] for k in ("id", "events", "start", "end", "margin")}
                     for c in doc["cues"] if not c["dropped"]]}


def verify_review(ws: Workspace, doc: dict, review: dict) -> None:
    expected = review.get("integrity")
    if not expected or expected != review_fingerprint(ws, doc):
        raise PipelineError("Approved artifacts changed or lack review fingerprints; run interactive review again.")
    if review.get("playback") != playback_contract(ws.read("analysis.json"), doc):
        raise PipelineError("Approved playback facts or timing changed; review again.")
