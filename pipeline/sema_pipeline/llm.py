"""Bedrock Converse wrapper: request tagging, usage ledger, response recording,
and tolerant JSON extraction with one model-assisted repair round-trip."""
from __future__ import annotations

import json
import re
import time

from .aws import TAG_KEY, Services, tag_to_filename
from .workspace import PipelineError, Workspace

_META_OK = re.compile(r"[^a-zA-Z0-9\s:_@$#=/+,.-]")


def _meta(value: str) -> str:
    return _META_OK.sub("-", value)[:256] or "-"


def converse(services: Services, cfg: dict, ws: Workspace, *, stage: str, tag: str, model_id: str,
             messages: list, system: str | None = None, inference: dict | None = None) -> tuple[str, dict]:
    request: dict = {"modelId": model_id, "messages": messages}
    if inference:
        request["inferenceConfig"] = inference
    if system:
        request["system"] = [{"text": system}]
    if services.mode == "stub" or cfg["bedrock"].get("request_metadata", True):
        # Tags show up in Bedrock model-invocation logs; the stub uses them to find recordings.
        request["requestMetadata"] = {TAG_KEY: _meta(tag), "sema_asset": _meta(ws.asset), "sema_stage": _meta(stage)}
    started = time.monotonic()
    response = services.bedrock.converse(**request)
    wall_ms = round((time.monotonic() - started) * 1000)
    usage = response.get("usage") or {}
    ws.record_usage(stage=stage, service="bedrock", model=model_id, tag=tag, mode=services.mode,
                    inputTokens=int(usage.get("inputTokens", 0)), outputTokens=int(usage.get("outputTokens", 0)),
                    latencyMs=(response.get("metrics") or {}).get("latencyMs"), wallMs=wall_ms,
                    stopReason=response.get("stopReason"))
    if services.live and services.recorder_dir:
        out = services.recorder_dir / "bedrock" / tag_to_filename(tag)
        out.parent.mkdir(parents=True, exist_ok=True)
        clean = {k: v for k, v in response.items() if k != "ResponseMetadata"}
        out.write_text(json.dumps(clean, indent=2, default=str))
    content = ((response.get("output") or {}).get("message") or {}).get("content") or []
    text = "".join(block.get("text", "") for block in content if isinstance(block, dict))
    return text, response


# ------------------------------------------------------------------ JSON

def _close_truncated(text: str) -> str:
    """Best-effort close of JSON cut off by max_tokens: close the open string and brackets."""
    stack, in_str, escape = [], False, False
    for ch in text:
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]" and stack:
            stack.pop()
    out = text + ('"' if in_str else "")
    out = re.sub(r",\s*$", "", out.rstrip())
    out = re.sub(r",\s*\"[^\"]*\"\s*:?\s*$", "", out)  # dangling key
    return out + "".join(reversed(stack))


def extract_json(text: str):
    """Parse the first JSON value in a model reply; tolerate fences, prose, trailing commas,
    smart quotes and truncation. Raises ValueError if nothing usable is found."""
    body = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)(?:```|$)", body, re.S)
    if fence:
        body = fence.group(1).strip()
    starts = [i for i in (body.find("{"), body.find("[")) if i >= 0]
    if not starts:
        raise ValueError("no JSON object or array in model reply")
    body = body[min(starts):]
    decoder = json.JSONDecoder()
    attempts = [body]
    fixed = body.replace("“", '"').replace("”", '"')
    fixed = re.sub(r",\s*([}\]])", r"\1", fixed)
    attempts += [fixed, _close_truncated(fixed)]
    last_error: Exception | None = None
    for candidate in attempts:
        try:
            value, _end = decoder.raw_decode(candidate)
            return value
        except json.JSONDecodeError as exc:
            last_error = exc
    raise ValueError(f"invalid JSON: {last_error}")


def ask_json(services: Services, cfg: dict, ws: Workspace, *, stage: str, tag: str, model_id: str,
             messages: list, system: str, inference: dict, validate=None):
    """Converse -> JSON. On parse/validation failure, ask the model once to fix its reply.

    `validate(obj)` may raise ValueError with a reason; the reason is fed back.
    Returns (value, info) where info records the model, usage and whether a repair happened.
    """
    info = {"modelId": model_id, "tag": tag, "repaired": False, "requests": 0}
    text, response = converse(services, cfg, ws, stage=stage, tag=tag, model_id=model_id,
                              messages=messages, system=system, inference=inference)
    info["requests"] += 1
    info["stopReason"] = response.get("stopReason")
    info["usage"] = response.get("usage")
    try:
        value = extract_json(text)
        return (validate(value) if validate else value), info
    except ValueError as first_error:
        info["repaired"] = True
        follow_up = messages + [
            {"role": "assistant", "content": [{"text": text or "(empty)"}]},
            {"role": "user", "content": [{"text": f"Your reply could not be used: {first_error}. "
                                                  "Reply again with ONLY the corrected JSON, no prose."}]},
        ]
        text2, response2 = converse(services, cfg, ws, stage=stage, tag=f"{tag}:repair", model_id=model_id,
                                    messages=follow_up, system=system, inference=inference)
        info["requests"] += 1
        info["repairUsage"] = response2.get("usage")
        try:
            value = extract_json(text2)
            return (validate(value) if validate else value), info
        except ValueError as second_error:
            raise PipelineError(f"{tag}: model reply was not usable JSON after one repair: {second_error}") from None
