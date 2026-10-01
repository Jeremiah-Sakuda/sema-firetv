"""AWS client seam.

The pipeline talks to four boto3 clients (s3, transcribe, bedrock-runtime, polly)
through a `Services` container. Live mode builds real boto3 clients; offline mode
builds stub objects that implement the *same method subset with the same
request/response shapes*, so the code exercised by the offline tests is the code
that runs live. Stubs never touch the network:

* StubS3          - a local directory pretending to be a bucket
* StubTranscribe  - replays a recorded Transcribe output JSON
* StubBedrock     - replays recorded Converse responses keyed by request tag
* StubPolly       - synthesizes a sine tone whose length tracks the text length
                    (ffmpeg `sine`), so fit-loop behaviour is realistic offline
"""
from __future__ import annotations

import io
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

TAG_KEY = "sema_tag"


class LiveCallsForbidden(RuntimeError):
    pass


class StubMissing(RuntimeError):
    pass


@dataclass
class Services:
    s3: Any
    transcribe: Any
    bedrock: Any
    polly: Any
    mode: str  # "live" | "stub"
    region: str
    sleep: Callable[[float], None] = time.sleep
    recorder_dir: Path | None = None  # live mode: where raw responses are saved for replay
    notes: list = field(default_factory=list)

    @property
    def live(self) -> bool:
        return self.mode == "live"


def live_services(cfg: dict, recorder_dir: Path | None = None) -> Services:
    """Build real boto3 clients. Only called when the user passes --live."""
    if os.environ.get("SEMA_FORBID_LIVE") == "1":
        raise LiveCallsForbidden("SEMA_FORBID_LIVE=1 is set; refusing to create live AWS clients.")
    import boto3  # imported lazily so offline use never needs credentials
    from botocore.config import Config

    region = cfg["region"]
    session = boto3.Session(region_name=region)
    retry = Config(retries={"max_attempts": int(cfg["bedrock"].get("max_attempts", 4)), "mode": "adaptive"},
                   read_timeout=300)
    return Services(
        s3=session.client("s3"),
        transcribe=session.client("transcribe"),
        bedrock=session.client("bedrock-runtime", config=retry),
        polly=session.client("polly"),
        mode="live",
        region=region,
        recorder_dir=recorder_dir,
    )


def stub_services(cfg: dict, replay_dir: Path | None, stub_root: Path) -> Services:
    s3 = StubS3(stub_root / "s3")
    return Services(
        s3=s3,
        transcribe=StubTranscribe(replay_dir, s3),
        bedrock=StubBedrock(replay_dir),
        polly=StubPolly(),
        mode="stub",
        region=cfg["region"],
        sleep=lambda _s: None,
    )


# --------------------------------------------------------------------------- S3

class _ClientError(Exception):
    """Shape-compatible with botocore.exceptions.ClientError for the fields we read."""

    def __init__(self, code: str, message: str, operation: str):
        super().__init__(f"An error occurred ({code}) when calling the {operation} operation: {message}")
        self.response = {"Error": {"Code": code, "Message": message}}
        self.operation_name = operation


class StubS3:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.calls: list = []

    def _path(self, bucket: str, key: str) -> Path:
        if ".." in key.split("/"):
            raise ValueError("unsafe key")
        return self.root / bucket / key

    def head_bucket(self, Bucket: str, **_):
        self.calls.append(("head_bucket", Bucket))
        if not (self.root / Bucket).is_dir():
            raise _ClientError("404", "Not Found", "HeadBucket")
        return {}

    def create_bucket(self, Bucket: str, **_):
        self.calls.append(("create_bucket", Bucket))
        (self.root / Bucket).mkdir(parents=True, exist_ok=True)
        return {"Location": f"/{Bucket}"}

    def upload_file(self, Filename: str, Bucket: str, Key: str, ExtraArgs: dict | None = None, **_):
        self.calls.append(("upload_file", Bucket, Key))
        dest = self._path(Bucket, Key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(Filename, dest)

    def put_object(self, Bucket: str, Key: str, Body: bytes, **_):
        self.calls.append(("put_object", Bucket, Key))
        dest = self._path(Bucket, Key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(Body if isinstance(Body, bytes) else Body.read())
        return {}

    def get_object(self, Bucket: str, Key: str, **_):
        self.calls.append(("get_object", Bucket, Key))
        path = self._path(Bucket, Key)
        if not path.is_file():
            raise _ClientError("NoSuchKey", f"{Key} not found", "GetObject")
        return {"Body": io.BytesIO(path.read_bytes()), "ContentLength": path.stat().st_size}


# ------------------------------------------------------------------ Transcribe

class StubTranscribe:
    def __init__(self, replay_dir: Path | None, s3: StubS3):
        self.replay_dir = Path(replay_dir) if replay_dir else None
        self.s3 = s3
        self.jobs: dict = {}

    def start_transcription_job(self, **kw):
        for required in ("TranscriptionJobName", "Media"):
            if required not in kw:
                raise ValueError(f"StartTranscriptionJob missing {required}")
        if not re.fullmatch(r"[0-9a-zA-Z._-]{1,200}", kw["TranscriptionJobName"]):
            raise ValueError("Invalid TranscriptionJobName")
        source = self.replay_dir / "transcribe.json" if self.replay_dir else None
        if not source or not source.is_file():
            raise StubMissing(f"No recorded Transcribe output at {source}. Record one with --live or pass --replay.")
        bucket, key = kw.get("OutputBucketName"), kw.get("OutputKey")
        if bucket and key:
            self.s3.put_object(Bucket=bucket, Key=key, Body=source.read_bytes())
        job = {"TranscriptionJobName": kw["TranscriptionJobName"], "TranscriptionJobStatus": "COMPLETED",
               "LanguageCode": kw.get("LanguageCode", "en-US"), "MediaFormat": kw.get("MediaFormat"),
               "Media": kw["Media"],
               "Transcript": {"TranscriptFileUri": f"https://s3.stub.amazonaws.com/{bucket}/{key}"}}
        self.jobs[kw["TranscriptionJobName"]] = job
        return {"TranscriptionJob": {**job, "TranscriptionJobStatus": "IN_PROGRESS"}}

    def get_transcription_job(self, TranscriptionJobName: str):
        return {"TranscriptionJob": self.jobs[TranscriptionJobName]}


# --------------------------------------------------------------------- Bedrock

def tag_to_filename(tag: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]", "__", tag) + ".json"


class StubBedrock:
    """Replays recorded Converse responses. The tag travels in requestMetadata."""

    def __init__(self, replay_dir: Path | None):
        self.replay_dir = Path(replay_dir) if replay_dir else None
        self.requests: list = []

    def converse(self, **request):
        if "modelId" not in request or "messages" not in request:
            raise ValueError("Converse requires modelId and messages")
        tag = (request.get("requestMetadata") or {}).get(TAG_KEY)
        if not tag:
            raise StubMissing("Stub Bedrock needs requestMetadata.sema_tag to find a recorded response")
        self.requests.append({"tag": tag, "modelId": request["modelId"],
                              "inferenceConfig": request.get("inferenceConfig"),
                              "blocks": [list(b.keys())[0] for m in request["messages"] for b in m["content"]]})
        path = self.replay_dir / "bedrock" / tag_to_filename(tag) if self.replay_dir else None
        if not path or not path.is_file():
            raise StubMissing(f"No recorded Bedrock response for tag '{tag}' (looked for {path}). "
                              "Record one with --live, or add a fixture.")
        return json.loads(path.read_text())


# ----------------------------------------------------------------------- Polly

STUB_CHARS_PER_SECOND = 15.0  # ~2.7 words/s, close to Polly neural Joanna
STUB_LEAD_SECONDS = 0.25


def stub_speech_seconds(text: str) -> float:
    plain = re.sub(r"<[^>]+>", "", text)
    return round(STUB_LEAD_SECONDS + len(plain) / STUB_CHARS_PER_SECOND, 3)


class StubPolly:
    def __init__(self, ffmpeg: str = "ffmpeg"):
        self.ffmpeg = ffmpeg
        self.requests: list = []

    def synthesize_speech(self, **kw):
        for required in ("OutputFormat", "Text", "VoiceId"):
            if required not in kw:
                raise ValueError(f"SynthesizeSpeech missing {required}")
        if kw["OutputFormat"] != "mp3":
            raise ValueError("Stub only renders mp3")
        self.requests.append({k: kw[k] for k in ("Text", "VoiceId", "Engine", "SampleRate") if k in kw})
        seconds = stub_speech_seconds(kw["Text"])
        rate = kw.get("SampleRate", "24000")
        with tempfile.TemporaryDirectory(prefix="sema-stub-polly-") as tmp:
            out = Path(tmp) / "tone.mp3"
            subprocess.run([self.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                            "-i", f"sine=frequency=440:sample_rate={rate}:duration={seconds}",
                            "-ac", "1", "-c:a", "libmp3lame", "-b:a", "48k", str(out)], check=True)
            data = out.read_bytes()
        return {"AudioStream": io.BytesIO(data), "ContentType": "audio/mpeg",
                "RequestCharacters": len(kw["Text"])}
