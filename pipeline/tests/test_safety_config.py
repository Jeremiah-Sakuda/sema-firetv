"""No live AWS in tests, config precedence, cost estimate math, stub client contracts."""
import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from sema_pipeline import cli
from sema_pipeline.aws import LiveCallsForbidden, StubBedrock, StubMissing, StubS3, live_services
from sema_pipeline.config import base_model_id, load_config
from sema_pipeline.report import estimate_cost


class SafetyTests(unittest.TestCase):
    def test_live_clients_refused_in_tests(self):
        with self.assertRaises(LiveCallsForbidden):
            live_services(load_config(env={}))

    def test_live_flag_needs_confirmation_when_not_a_tty(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(cli.sys, "stdin", io.StringIO()), \
                mock.patch.object(cli, "live_services", side_effect=AssertionError("must not build clients")), \
                contextlib.redirect_stderr(io.StringIO()) as err:
            code = cli.main(["analyze", "--live", "--asset", "x", "--work-root", tmp])
        self.assertEqual(code, 1)  # refused before any client is built
        self.assertIn("pass --yes", err.getvalue())

    def test_live_with_yes_still_blocked_by_forbid_switch(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stderr(io.StringIO()) as err:
            code = cli.main(["analyze", "--live", "--yes", "--asset", "x", "--work-root", tmp])
        self.assertEqual(code, 1)
        self.assertIn("SEMA_FORBID_LIVE", err.getvalue())

    def test_stub_bedrock_requires_recording(self):
        with self.assertRaises(StubMissing):
            StubBedrock(None).converse(modelId="m", messages=[], requestMetadata={"sema_tag": "observe:video"})

    def test_stub_s3_404_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(Exception) as ctx:
                StubS3(Path(tmp)).head_bucket(Bucket="nope")
            self.assertEqual(ctx.exception.response["Error"]["Code"], "404")


class ConfigTests(unittest.TestCase):
    def test_env_overrides(self):
        cfg = load_config(env={"SEMA_BUCKET": "b", "AWS_REGION": "us-west-2", "SEMA_OBSERVE_MODEL": "us.amazon.nova-lite-v1:0"})
        self.assertEqual((cfg["bucket"], cfg["region"], cfg["observe"]["model_id"]), ("b", "us-west-2", "us.amazon.nova-lite-v1:0"))
        self.assertEqual(load_config(env={"SEMA_REGION": "eu-west-1", "AWS_REGION": "us-west-2"})["region"], "eu-west-1")
        self.assertEqual(load_config(env={})["observe"]["model_id"], "us.amazon.nova-pro-v1:0")

    def test_example_config_matches_defaults(self):
        from sema_pipeline.config import DEFAULTS, PIPELINE_DIR
        example = PIPELINE_DIR / "config.example.json"
        cfg = load_config(example, env={})
        self.assertEqual({k: v for k, v in cfg.items() if k not in {"_comment", "bucket"}},
                         {k: v for k, v in DEFAULTS.items() if k != "bucket"})

    def test_base_model_id(self):
        self.assertEqual(base_model_id("us.amazon.nova-pro-v1:0"), "amazon.nova-pro-v1:0")
        self.assertEqual(base_model_id("amazon.nova-lite-v1:0"), "amazon.nova-lite-v1:0")


class CostTests(unittest.TestCase):
    def test_estimate(self):
        prices = load_config(env={})["prices"]
        rows = [{"service": "transcribe", "seconds": 10.0, "job": "j"},                       # 15 s minimum
                {"service": "bedrock", "model": "us.amazon.nova-pro-v1:0", "inputTokens": 10_000, "outputTokens": 1_000},
                {"service": "bedrock", "model": "mystery-model", "inputTokens": 5, "outputTokens": 5},
                {"service": "polly", "engine": "neural", "characters": 1_000_000}]
        est = estimate_cost(rows, prices)
        by = {l["service"]: l["usd"] for l in est["lines"]}
        self.assertAlmostEqual(by["transcribe"], 15 / 60 * 0.024)
        self.assertAlmostEqual(by["bedrock"], 10 * 0.0008 + 1 * 0.0032)
        self.assertAlmostEqual(by["polly"], 16.0)
        self.assertEqual(len(est["unpriced"]), 1)   # unknown models are flagged, never silently $0
        self.assertIn("ESTIMATE", est["label"])


if __name__ == "__main__":
    unittest.main()
