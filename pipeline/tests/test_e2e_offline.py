"""Offline end-to-end: CLI -> stub S3/Transcribe/Bedrock/Polly (recorded fixtures) -> review -> package
-> `node tools/validate.js` passes. Uses media/fixture/film.mp4; writes only to temp dirs."""
import io
import json
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from tests.helpers import FIXTURE_MP4, REPLAY, node_validate
from sema_pipeline import cli
from sema_pipeline.config import load_config
from sema_pipeline.review import ReviewIO, run_review
from sema_pipeline.workspace import Workspace

ASSET = "red-envelope-test"


def run_cli(*argv) -> tuple[int, str]:
    out = io.StringIO()
    with redirect_stdout(out), redirect_stderr(out):
        code = cli.main(list(argv))
    return code, out.getvalue()


class OfflineEndToEndTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["SEMA_BUCKET"] = "sema-offline-test"
        cls.tmp = tempfile.TemporaryDirectory(prefix="sema-e2e-")
        cls.root = Path(cls.tmp.name)
        cls.work, cls.web = cls.root / "work", cls.root / "web"
        cls.common = ["--work-root", str(cls.work), "--replay", str(REPLAY), "--asset", ASSET]
        code, cls.run_output = run_cli("run", *cls.common, "--source", str(FIXTURE_MP4),
                                       "--rights", "Original procedural test footage; engineering use only.",
                                       "--title", "The red envelope", "--synopsis", "A short test film.",
                                       "--credits", "Sema test fixture", "--scene-threshold", "0.05")
        assert code == 0, cls.run_output
        cls.ws = Workspace(ASSET, cls.work)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def setUp(self):
        for name in ("review.json", "reviewed.json"):
            (self.ws.dir / name).unlink(missing_ok=True)
        shutil.rmtree(self.web, ignore_errors=True)

    # ------------------------------------------------------------------ stages
    def test_stage_outputs(self):
        manifest = self.ws.read("manifest.json")
        self.assertEqual(manifest["source"]["bytes"], FIXTURE_MP4.stat().st_size)
        self.assertEqual(len(manifest["source"]["sha256"]), 64)
        self.assertEqual(manifest["rights"]["source"], "inline")
        self.assertTrue((self.work / "_stub" / "s3" / "sema-offline-test" / manifest["s3"]["key"]).is_file())

        analysis = self.ws.read("analysis.json")
        self.assertEqual(analysis["dialogue"], [{"start": 0.02, "end": 1.09}, {"start": 7.11, "end": 7.82}])
        self.assertEqual([s["start"] for s in analysis["scenes"]], [0, 9.0])  # ffmpeg cut at the door
        self.assertEqual([(w["start"], w["end"]) for w in analysis["windows"]], [(1.09, 7.11), (7.82, 15.0)])

        obs = self.ws.read("observations.json")
        self.assertEqual([e["id"] for e in obs["events"]], ["desk-room", "envelope-hidden", "door-open"])
        self.assertEqual(obs["model"]["modelId"], "us.amazon.nova-pro-v1:0")
        self.assertEqual(obs["model"]["usage"]["inputTokens"], 4312)

        script = self.ws.read("script.json")
        self.assertEqual([(c["start"], c["end"], c["events"]) for c in script["cues"]],
                         [(2.0, 7.11, ["desk-room", "envelope-hidden"]), (9.0, 15.0, ["door-open"])])
        self.assertEqual(script["cues"][0]["budgets"], {"essential": 4, "standard": 7, "rich": 11})
        # Recovery context is limited to facts visible at that moment (spoiler safety by construction).
        self.assertEqual(script["recoveries"]["envelope-hidden"]["contextEvents"], ["desk-room", "envelope-hidden"])

        render = self.ws.read("render.json")
        rich = render["cues"]["c02"]["rich"]
        self.assertEqual(rich["status"], "fit")
        self.assertEqual(rich["regenerations"], 1)                     # fit loop exercised via Bedrock shorten
        self.assertFalse(rich["attempts"][0]["fits"])
        self.assertEqual(render["summary"]["unresolved"], 0)

        usage = self.ws.usage()
        self.assertTrue(all(r["mode"] == "stub" for r in usage))
        self.assertEqual({r["service"] for r in usage}, {"s3", "transcribe", "bedrock", "polly"})

    def test_bedrock_requests_are_tagged_and_shaped(self):
        # Re-run observe with a fresh stub so we can inspect the exact request shape.
        from sema_pipeline.aws import stub_services
        from sema_pipeline.observe import run_observe
        cfg = load_config(env={})
        services = stub_services(cfg, REPLAY, self.root / "stub-inspect")
        tmp_ws = Workspace("inspect", self.root / "inspect")
        for name in ("manifest.json", "analysis.json"):
            shutil.copy(self.ws.dir / name, tmp_ws.dir / name)
        run_observe(tmp_ws, cfg, services)
        req = services.bedrock.requests[0]
        self.assertEqual(req["tag"], "observe:video")
        self.assertEqual(req["blocks"], ["video", "text"])
        self.assertEqual(req["inferenceConfig"], {"maxTokens": 4096, "temperature": 0.0, "topP": 0.9})

    # ----------------------------------------------------------- review/package
    def test_approve_all_package_passes_player_validator(self):
        code, out = run_cli("review", *self.common, "--reviewer", "Offline Test", "--approve-all")
        self.assertEqual(code, 0, out)
        code, out = run_cli("package", *self.common, "--web-root", str(self.web))
        self.assertEqual(code, 0, out)
        pkg_path = self.web / "media" / ASSET / "package.json"
        result = node_validate(pkg_path)                                # strict, not --fixture
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("valid approved package; 2 cues, 3 events", result.stdout)
        pkg = json.loads(pkg_path.read_text())
        self.assertEqual(pkg["reviewStatus"], "approved")
        self.assertEqual(pkg["approval"]["method"], "approve-all")      # honest about bulk approval
        self.assertIn("No per-item human", pkg["approval"]["note"])
        self.assertEqual(pkg["pipeline"]["mode"], "offline-stub")
        self.assertEqual(pkg["video"], f"media/{ASSET}/film.mp4")
        for cue in pkg["cues"]:
            for v in cue["variants"].values():
                self.assertTrue((self.web / v["audio"]).is_file())
                self.assertLessEqual(v["duration"] + 2 * cue["margin"], cue["end"] - cue["start"])
        for e in pkg["events"]:
            self.assertTrue((self.web / e["recovery"]["audio"]).is_file())
        code, out = run_cli("report", *self.common)
        self.assertEqual(code, 0, out)
        report = self.ws.read("pipeline-report.json")
        self.assertEqual(report["runMode"], "offline-stub")
        self.assertGreater(report["estimatedCost"]["totalUSD"], 0)
        self.assertEqual(report["fit"]["summary"]["fitAfterRegeneration"], 1)
        self.assertIn("ESTIMATE", (self.ws.dir / "pipeline-report.md").read_text())

    def test_interactive_review_edit_rerenders_and_is_recorded(self):
        cfg = load_config(env={})
        from sema_pipeline.aws import stub_services
        services = stub_services(cfg, REPLAY, self.ws.stub_root)
        answers = ["p", "s",                                   # play c01 standard (prints path offline)
                   "e", "r", "In a dim room, the envelope slips into the drawer.", "a",   # edit c01 rich
                   "d",                                        # c02 is critical: drop refused
                   "a",
                   "a", "a", "a"]                              # three recoveries
        log = run_review(self.ws, cfg, services, reviewer="Jordan Reviewer", io=ReviewIO(answers, out=io.StringIO()))
        self.assertTrue(log["completed"], log)
        self.assertEqual(log["method"], "interactive")
        self.assertEqual(len(log["edits"]), 1)
        self.assertEqual(log["edits"][0]["after"], "In a dim room, the envelope slips into the drawer.")
        self.assertTrue(log["edits"][0]["fits"])
        self.assertEqual(log["drops"], [])
        code, out = run_cli("package", *self.common, "--web-root", str(self.web))
        self.assertEqual(code, 0, out)
        pkg = json.loads((self.web / "media" / ASSET / "package.json").read_text())
        self.assertEqual(pkg["cues"][0]["variants"]["rich"]["text"], "In a dim room, the envelope slips into the drawer.")
        self.assertEqual(pkg["approval"]["edits"], 1)
        self.assertEqual(pkg["approval"]["reviewer"], "Jordan Reviewer")

    def test_unplaced_critical_event_blocks_approval_until_resolved(self):
        cfg = load_config(env={})
        from sema_pipeline.review import build_reviewed
        doc = build_reviewed(self.ws, cfg)
        late = {"id": "key-taken", "scene": "s02", "availableAt": 14.2, "critical": True,
                "description": "A hand takes the key.",
                "recovery": dict(doc["events"][0]["recovery"], text="A hand has taken the key.")}
        doc["events"].append(late)
        doc["unplaced"].append("key-taken")
        self.ws.write("reviewed.json", doc)
        log = run_review(self.ws, cfg, None, reviewer="Bot", approve_all=True)
        self.assertFalse(log["completed"])
        self.assertIn("critical event 'key-taken' has no cue", log["blockers"])
        code, out = run_cli("package", *self.common, "--web-root", str(self.web))
        self.assertEqual(code, 1)
        self.assertIn("Review is not complete", out)
        self.assertFalse((self.web / "media" / ASSET / "package.json").exists())
        # Reviewer resolves it explicitly (recorded), then approves everything.
        (self.ws.dir / "review.json").unlink()
        answers = ["n", "Only visible in the closing frames; not plot critical", "a", "a", "a", "a", "a", "a"]
        log = run_review(self.ws, cfg, None, reviewer="Human", io=ReviewIO(answers, out=io.StringIO()))
        self.assertTrue(log["completed"], log)
        self.assertEqual(log["downgrades"][0]["event"], "key-taken")

    def test_draft_package_fails_validation_loudly(self):
        log = run_review(self.ws, load_config(env={}), None, reviewer="Partial",
                         io=ReviewIO(["q"], out=io.StringIO()))
        self.assertFalse(log["completed"])
        code, out = run_cli("package", *self.common, "--draft")
        self.assertEqual(code, 1)
        self.assertIn("PACKAGE VALIDATION FAILED", out)
        self.assertIn("Human approval required for publication", out)

    def test_stale_upstream_blocks_package(self):
        run_cli("review", *self.common, "--reviewer", "Offline Test", "--approve-all")
        script = self.ws.dir / "script.json"
        render = self.ws.dir / "render.json"
        original = script.stat()
        os.utime(script, (render.stat().st_mtime + 10, render.stat().st_mtime + 10))
        try:
            code, out = run_cli("package", *self.common, "--web-root", str(self.web))
            self.assertEqual(code, 1)
            self.assertIn("render.json is older than script.json", out)
        finally:
            os.utime(script, ns=(original.st_atime_ns, original.st_mtime_ns))


if __name__ == "__main__":
    unittest.main()
