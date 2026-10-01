"""Stage 6 - review: a human approves, edits or drops every cue and recovery.

Approval is blocked while any critical event lacks a cue or any kept variant
does not fit its window. Edits are re-rendered and re-measured immediately.
Progress is saved after every decision; re-running resumes where you stopped.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from .aws import Services
from .render import Narrator
from .timeline import LEVELS, available_speech_seconds, count_words, fits
from .workspace import PipelineError, Workspace, now_iso


class ReviewIO:
    """Terminal I/O; tests inject scripted answers."""

    def __init__(self, answers: list[str] | None = None, out=None):
        self.answers = list(answers) if answers is not None else None
        self.out = out or sys.stdout

    def say(self, text: str = "") -> None:
        print(text, file=self.out)

    def ask(self, prompt: str) -> str:
        if self.answers is not None:
            if not self.answers:
                raise PipelineError("Scripted review ran out of answers")
            answer = self.answers.pop(0)
            self.say(f"{prompt}{answer}")
            return answer
        try:
            return input(prompt)
        except EOFError:
            return "q"

    def edit(self, label: str, current: str) -> str:
        editor = os.environ.get("EDITOR")
        if self.answers is None and editor and sys.stdin.isatty():
            with tempfile.NamedTemporaryFile("w+", suffix=".txt", delete=False) as handle:
                handle.write(current + "\n")
                name = handle.name
            try:
                subprocess.run([*editor.split(), name], check=False)
                return " ".join(Path(name).read_text().split())
            finally:
                os.unlink(name)
        self.say(f"  current {label}: {current}")
        new = self.ask("  new text (blank keeps current): ").strip()
        return new or current

    def play(self, path: Path) -> None:
        player = shutil.which("afplay")
        if player and self.answers is None:
            subprocess.run([player, str(path)], check=False)
        else:
            self.say(f"  (audio: {path})")


def _ts(t: float) -> str:
    return f"{int(t // 60):02d}:{t % 60:05.2f}"


def build_reviewed(ws: Workspace, cfg: dict) -> dict:
    """Merge script + render + observations into the editable review document."""
    script, render, obs = ws.read("script.json"), ws.read("render.json"), ws.read("observations.json")
    issues = ws.read("issues.json", default={"issues": []})["issues"]
    cues = []
    for cue in script["cues"]:
        variants = {}
        for level in LEVELS:
            r = render["cues"][cue["id"]][level]
            variants[level] = {"text": r["text"], "audio": r["audio"], "duration": r["duration"],
                               "status": r["status"], "regenerations": r["regenerations"]}
        cues.append({k: cue[k] for k in ("id", "start", "end", "seconds", "margin", "events", "critical")}
                    | {"variants": variants, "dropped": False})
    events = []
    for e in obs["events"]:
        rec = render["recoveries"][e["id"]]
        events.append({"id": e["id"], "scene": e["scene"], "availableAt": e["availableAt"], "critical": e["critical"],
                       "description": e["description"], "recovery": dict(rec)})
    unplaced = [i["event"] for i in issues if i["type"] == "critical-unplaced"]
    return {"asset": ws.asset, "slack": render["slack"], "renderedAt": render["renderedAt"], "cues": cues,
            "events": events, "unplaced": unplaced}


def blockers(doc: dict, slack: float) -> list[str]:
    out = []
    covered = {eid for c in doc["cues"] if not c["dropped"] for eid in c["events"]}
    for e in doc["events"]:
        if e["critical"] and e["id"] not in covered:
            out.append(f"critical event '{e['id']}' has no cue")
    for c in doc["cues"]:
        if c["dropped"]:
            continue
        for level, v in c["variants"].items():
            if not fits(v["duration"], c["seconds"], c["margin"], slack):
                out.append(f"{c['id']}/{level} does not fit ({v['duration']:.2f} s, window {c['seconds']:.2f} s)")
    return out


class ReviewSession:
    def __init__(self, ws: Workspace, cfg: dict, services: Services | None, reviewer: str, io: ReviewIO):
        self.ws, self.cfg, self.services, self.io = ws, cfg, services, io
        fresh_log = {"asset": ws.asset, "reviewer": reviewer, "method": "interactive", "sessions": [],
                     "decisions": {}, "edits": [], "drops": [], "attachments": [], "downgrades": [],
                     "completed": False}
        rendered_at = ws.read("render.json")["renderedAt"]
        self.doc = ws.read("reviewed.json") if ws.exists("reviewed.json") else None
        self.log = ws.read("review.json") if ws.exists("review.json") else fresh_log
        if self.doc is None or self.doc.get("renderedAt") != rendered_at:
            if self.doc is not None:
                io.say("Render output changed since the last review session; starting the review over.")
            self.doc, self.log = build_reviewed(ws, cfg), fresh_log
        if self.log.get("reviewer") != reviewer:
            self.log.setdefault("otherReviewers", []).append(self.log.get("reviewer"))
            self.log["reviewer"] = reviewer
        self.slack = float(self.doc.get("slack", cfg["cues"]["fit_slack"]))
        self.started = time.monotonic()
        self.session = {"startedAt": now_iso()}
        self.narrator = Narrator(services, cfg, ws, "review") if services else None

    # ---------------------------------------------------------------- utils
    def save(self) -> None:
        self.session["endedAt"] = now_iso()
        self.session["seconds"] = round(time.monotonic() - self.started, 1)
        sessions = [s for s in self.log["sessions"] if s.get("startedAt") != self.session["startedAt"]]
        self.log["sessions"] = sessions + [self.session]
        self.log["reviewMinutes"] = round(sum(s["seconds"] for s in self.log["sessions"]) / 60, 2)
        self.ws.write("reviewed.json", self.doc)
        self.ws.write("review.json", self.log)

    def _rerender(self, label: str, text: str) -> dict:
        if not self.narrator:
            raise PipelineError("Editing needs a TTS client; run review with the same --live/offline mode as render.")
        dest = self.ws.dir / "audio" / f"{label}-edit{len(self.log['edits']) + 1}.mp3"
        out = self.narrator.synthesize(text, dest)
        return {"text": text, "audio": str(dest.relative_to(self.ws.dir)), "duration": out["duration"]}

    def _event(self, eid: str) -> dict:
        return next(e for e in self.doc["events"] if e["id"] == eid)

    def show_cue(self, c: dict) -> None:
        avail = available_speech_seconds(c["seconds"], c["margin"], self.slack)
        self.io.say("")
        self.io.say(f"== Cue {c['id']}  [{_ts(c['start'])} -> {_ts(c['end'])}]  window {c['seconds']:.2f} s "
                    f"(speech must be <= {avail:.2f} s)")
        for eid in c["events"]:
            e = self._event(eid)
            self.io.say(f"   event {eid} {'[CRITICAL]' if e['critical'] else '[optional]'} @ {e['availableAt']:.2f}s: "
                        f"{e['description']}")
        for level in LEVELS:
            v = c["variants"][level]
            ok = fits(v["duration"], c["seconds"], c["margin"], self.slack)
            mark = f"fits (+{avail - v['duration']:.2f} s)" if ok else f"DOES NOT FIT (-{v['duration'] - avail:.2f} s)"
            self.io.say(f"   {level:<9} {v['duration']:5.2f} s  {mark:<22} \"{v['text']}\"")

    # ------------------------------------------------------------ blockers
    def resolve_unplaced(self) -> bool:
        for eid in list(self.doc["unplaced"]):
            e = self._event(eid)
            if not e["critical"] or any(eid in c["events"] for c in self.doc["cues"] if not c["dropped"]):
                self.doc["unplaced"].remove(eid)
                continue
            eligible = [c for c in self.doc["cues"] if not c["dropped"] and c["start"] >= e["availableAt"]]
            self.io.say("")
            self.io.say(f"!! Critical event '{eid}' @ {e['availableAt']:.2f}s has no narration cue: {e['description']}")
            self.io.say("   Eligible cues (start after it is visible): " +
                        (", ".join(f"{c['id']}@{c['start']:.2f}s" for c in eligible) or "none"))
            choice = self.io.ask("   [c]attach to cue  [n]ot critical (downgrade)  [q]uit: ").strip().lower()
            if choice == "c" and eligible:
                target = self.io.ask("   cue id: ").strip()
                cue = next((c for c in eligible if c["id"] == target), None)
                if not cue:
                    self.io.say("   not an eligible cue")
                    return False
                cue["events"].append(eid)
                cue["critical"] = True
                self.log["attachments"].append({"event": eid, "cue": cue["id"], "at": now_iso()})
                self.log["decisions"].pop(f"cue:{cue['id']}", None)
                self.io.say(f"   attached; edit {cue['id']} so its text covers the event.")
                self.doc["unplaced"].remove(eid)
            elif choice == "n":
                reason = self.io.ask("   reason (recorded): ").strip() or "reviewer judgment"
                e["critical"] = False
                self.log["downgrades"].append({"event": eid, "reason": reason, "at": now_iso()})
                self.doc["unplaced"].remove(eid)
            else:
                return False
            self.save()
        return True

    # ----------------------------------------------------------------- cues
    def review_cue(self, c: dict) -> str:
        while True:
            self.show_cue(c)
            critical = any(self._event(eid)["critical"] for eid in c["events"])
            choice = self.io.ask("   [a]pprove  [e]dit  " + ("" if critical else "[d]rop  ") +
                                 "[p]lay  [q]uit: ").strip().lower()
            if choice == "a":
                bad = [lvl for lvl, v in c["variants"].items()
                       if not fits(v["duration"], c["seconds"], c["margin"], self.slack)]
                if bad:
                    self.io.say(f"   cannot approve: {', '.join(bad)} do not fit. Edit them" +
                                (" or drop the cue." if not critical else "."))
                    continue
                return "approved"
            if choice == "d":
                if critical:
                    self.io.say("   critical cues cannot be dropped")
                    continue
                reason = self.io.ask("   drop reason (recorded): ").strip() or "reviewer judgment"
                c["dropped"] = True
                self.log["drops"].append({"cue": c["id"], "events": c["events"], "reason": reason, "at": now_iso()})
                return "dropped"
            if choice == "e":
                level = {"e": "essential", "s": "standard", "r": "rich"}.get(
                    self.io.ask("   level [e]ssential [s]tandard [r]ich: ").strip().lower())
                if not level:
                    continue
                before = c["variants"][level]
                text = self.io.edit(level, before["text"])
                if text == before["text"]:
                    continue
                new = self._rerender(f"{c['id']}-{level}", text)
                ok = fits(new["duration"], c["seconds"], c["margin"], self.slack)
                c["variants"][level] = {**new, "status": "fit" if ok else "unresolved",
                                        "regenerations": before.get("regenerations", 0), "edited": True}
                self.log["edits"].append({"item": f"cue:{c['id']}", "level": level, "before": before["text"],
                                          "after": text, "duration": new["duration"], "fits": ok, "at": now_iso()})
                self.save()
                continue
            if choice == "p":
                level = {"e": "essential", "s": "standard", "r": "rich"}.get(
                    self.io.ask("   play [e]ssential [s]tandard [r]ich: ").strip().lower(), "standard")
                self.io.play(self.ws.dir / c["variants"][level]["audio"])
                continue
            if choice == "q":
                return "quit"

    def review_recovery(self, e: dict) -> str:
        while True:
            r = e["recovery"]
            self.io.say("")
            self.io.say(f"== Recovery for {e['id']} {'[CRITICAL]' if e['critical'] else '[optional]'} "
                        f"(available {_ts(e['availableAt'])}, plays while paused)  {r['duration']:.2f} s")
            self.io.say(f"   \"{r['text']}\"  ({count_words(r['text'])} words)")
            self.io.say("   Spoiler check: it may only use facts visible by this moment.")
            choice = self.io.ask("   [a]pprove  [e]dit  [p]lay  [q]uit: ").strip().lower()
            if choice == "a":
                return "approved"
            if choice == "e":
                text = self.io.edit("recovery", r["text"])
                if text != r["text"]:
                    new = self._rerender(f"recover-{e['id']}", text)
                    self.log["edits"].append({"item": f"recovery:{e['id']}", "before": r["text"], "after": text,
                                              "duration": new["duration"], "fits": True, "at": now_iso()})
                    e["recovery"] = new
                    self.save()
            elif choice == "p":
                self.io.play(self.ws.dir / r["audio"])
            elif choice == "q":
                return "quit"

    # ------------------------------------------------------------------ run
    def run(self) -> dict:
        self.log["method"] = "interactive"
        try:
            if not self.resolve_unplaced():
                return self.finish(stopped=True)
            for c in self.doc["cues"]:
                key = f"cue:{c['id']}"
                if self.log["decisions"].get(key) in {"approved", "dropped"}:
                    continue
                decision = self.review_cue(c)
                if decision == "quit":
                    return self.finish(stopped=True)
                self.log["decisions"][key] = decision
                self.save()
            for e in self.doc["events"]:
                key = f"recovery:{e['id']}"
                if self.log["decisions"].get(key) == "approved":
                    continue
                decision = self.review_recovery(e)
                if decision == "quit":
                    return self.finish(stopped=True)
                self.log["decisions"][key] = decision
                self.save()
        except KeyboardInterrupt:
            return self.finish(stopped=True)
        return self.finish(stopped=False)

    def approve_all(self) -> dict:
        self.log["method"] = "approve-all"
        self.log["note"] = ("Non-interactive bulk approval (--approve-all). No per-item human listening or "
                            "editing was recorded; use only for scripted tests or after an out-of-band review.")
        for c in self.doc["cues"]:
            self.log["decisions"][f"cue:{c['id']}"] = "approved"
        for e in self.doc["events"]:
            self.log["decisions"][f"recovery:{e['id']}"] = "approved"
        return self.finish(stopped=False)

    def finish(self, stopped: bool) -> dict:
        found = blockers(self.doc, self.slack)
        pending = [f"cue:{c['id']}" for c in self.doc["cues"] if f"cue:{c['id']}" not in self.log["decisions"]]
        pending += [f"recovery:{e['id']}" for e in self.doc["events"]
                    if f"recovery:{e['id']}" not in self.log["decisions"]]
        self.log["blockers"] = found
        self.log["pending"] = pending
        self.log["completed"] = not stopped and not found and not pending
        if self.log["completed"]:
            self.log["approvedAt"] = now_iso()
        self.save()
        return self.log


def run_review(ws: Workspace, cfg: dict, services: Services | None, *, reviewer: str, approve_all: bool = False,
               io: ReviewIO | None = None, restart: bool = False) -> dict:
    if not reviewer or not reviewer.strip():
        raise PipelineError("--reviewer NAME is required (it is recorded in the package approval).")
    if restart:
        for name in ("reviewed.json", "review.json"):
            if ws.exists(name):
                (ws.dir / name).unlink()
    session = ReviewSession(ws, cfg, services, reviewer.strip(), io or ReviewIO())
    log = session.approve_all() if approve_all else session.run()
    return log


def approval_record(review: dict) -> dict:
    """The compact `approval` object embedded in the package."""
    return {"reviewer": review["reviewer"], "approvedAt": review.get("approvedAt"),
            "reviewMinutes": review.get("reviewMinutes", 0.0), "edits": len(review.get("edits", [])),
            "drops": len(review.get("drops", [])), "method": review.get("method"),
            "downgradedCriticalEvents": len(review.get("downgrades", [])),
            **({"note": review["note"]} if review.get("note") else {})}
