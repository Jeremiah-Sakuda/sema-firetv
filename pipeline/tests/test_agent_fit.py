"""Strands agent fit loop, driven offline by the deterministic stand-in model."""
import tempfile
import unittest
from pathlib import Path

from tests.helpers import make_tone

try:
    import strands  # noqa: F401
    HAVE_STRANDS = True
except ImportError:
    HAVE_STRANDS = False

from sema_pipeline.aws import stub_speech_seconds
from sema_pipeline.config import load_config


@unittest.skipUnless(HAVE_STRANDS, "strands-agents not installed (optional agent mode)")
class AgentFitTests(unittest.TestCase):
    def setUp(self):
        from sema_pipeline.agent_fit import AgentFitRunner, OfflineAgentModel
        from sema_pipeline.aws import Services
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        cfg = load_config(env={})
        services = Services(s3=None, transcribe=None, bedrock=None, polly=None, mode="stub", region="us-east-1")
        self.runner = AgentFitRunner(cfg, services, None, model=OfflineAgentModel())
        self.renders = []

    def tearDown(self):
        self.tmp.cleanup()

    def render(self, text, attempt):
        path = make_tone(self.dir / f"r{len(self.renders)}.mp3", stub_speech_seconds(text))
        self.renders.append(text)
        from sema_pipeline.media import measure_duration
        return {"audio": path, "duration": measure_duration(path)}

    def test_agent_iterates_until_fit_using_all_three_tools(self):
        cue = {"id": "c02"}
        text = "The tall blue door swings wide open onto a warm, bright hallway, while the drawer stays shut."
        out = self.runner.fit(text, cue=cue, level="rich", must_keep=["The blue door opens."], window_seconds=6.0,
                              margin=0.2, slack=0.15, render=self.render)
        self.assertEqual(out["status"], "fit")
        self.assertEqual(out["regenerations"], 1)
        self.assertLessEqual(out["duration"] + 0.4 + 0.15, 6.0)
        calls = out["agent"]["toolCalls"]
        self.assertEqual(calls, ["render_with_polly", "measure_duration", "check_window"] * 2)
        self.assertTrue(out["agent"]["claimMatchesLedger"])

    def test_agent_gives_up_at_render_budget_and_ledger_decides(self):
        cue = {"id": "c09"}
        text = ("An extremely long and detailed description that keeps going and going far beyond what a tiny "
                "window between two lines of dialogue could ever hold.")
        out = self.runner.fit(text, cue=cue, level="rich", must_keep=[], window_seconds=0.9, margin=0.2,
                              slack=0.15, render=self.render)
        self.assertEqual(out["status"], "unresolved")
        self.assertEqual(len(self.renders), self.runner.max_renders)  # budget enforced inside the tool
        self.assertEqual(self.runner.summary()["runs"], 1)


if __name__ == "__main__":
    unittest.main()
