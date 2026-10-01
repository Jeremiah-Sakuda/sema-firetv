"""UI prompt set generation (stub Polly -> real mp3 files -> measured durations)."""
import json
import re
import tempfile
import unittest
from pathlib import Path

from tests.helpers import PIPELINE_DIR
from sema_pipeline.aws import stub_services
from sema_pipeline.config import load_config
from sema_pipeline.prompts import REQUIRED, load_prompts, run_prompts
from sema_pipeline.workspace import PipelineError

SAFE = re.compile(r"^(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_.-]+$")


class PromptSetTests(unittest.TestCase):
    def test_prompt_file_has_required_ids_and_brief_texts(self):
        prompts = load_prompts(PIPELINE_DIR / "prompts.json")
        for pid in REQUIRED:
            self.assertIn(pid, prompts)
        for pid, text in prompts.items():
            # Help and the one-time onboarding introduction are deliberately long-form.
            limit = {"help": 40, "onboarding": 70}.get(pid, 26)
            self.assertLessEqual(len(text.split()), limit, f"{pid} is not brief")

    def test_render_prompt_set(self):
        cfg = load_config(env={})
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            services = stub_services(cfg, None, root / "stub")
            out = run_prompts(cfg, services, web_root=root / "web", report_dir=root / "report")
            manifest = json.loads((root / "web" / "media" / "prompts" / "prompts.json").read_text())
            self.assertEqual(set(manifest), set(load_prompts()))
            for pid, entry in manifest.items():
                self.assertEqual(set(entry), {"text", "audio", "duration"})
                self.assertTrue(SAFE.match(entry["audio"]))
                self.assertEqual(entry["audio"], f"media/prompts/{pid}.mp3")
                self.assertTrue((root / "web" / entry["audio"]).is_file())
                self.assertGreater(entry["duration"], 0)
            # Same voice/engine as narration, recorded in the side report (not in the flat mapping).
            meta = json.loads((root / "report" / "prompts-report.json").read_text())
            self.assertEqual(meta["voice"]["voiceId"], "Joanna")
            self.assertEqual(meta["characters"], sum(len(t) for t in load_prompts().values()))
            self.assertEqual(len(services.polly.requests), len(manifest))
            self.assertEqual(out["meta"]["mode"], "stub")

    def test_missing_required_prompt_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "p.json"
            bad.write_text(json.dumps({"welcome": "Hi."}))
            with self.assertRaises(PipelineError):
                load_prompts(bad)
            bad.write_text(json.dumps({**load_prompts(), "Bad Id": "x"}))
            with self.assertRaises(PipelineError):
                load_prompts(bad)


if __name__ == "__main__":
    unittest.main()
