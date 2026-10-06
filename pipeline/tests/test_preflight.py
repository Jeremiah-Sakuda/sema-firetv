import unittest
import os
from unittest.mock import patch

from sema_pipeline.config import load_config
from sema_pipeline.preflight import check_readiness


class Session:
    def __init__(self, **kwargs):
        self.calls = []
    def get_credentials(self):
        return object()
    def client(self, name, **kwargs):
        self.calls.append(name)
        return self
    def get_caller_identity(self):
        return {"Account": "secret-account", "Arn": "secret-arn"}


class PreflightTests(unittest.TestCase):
    def test_local_check_does_not_create_service_clients(self):
        session = Session()
        cfg = load_config(env={"SEMA_BUCKET": "sema-pilot"})
        with patch("shutil.which", return_value="tool"):
            result = check_readiness(cfg, session_factory=lambda **kw: session)
        self.assertTrue(result["ready"])
        self.assertEqual(session.calls, [])

    def test_live_only_calls_sts_and_does_not_report_identity(self):
        session = Session()
        cfg = load_config(env={"SEMA_BUCKET": "sema-pilot"})
        with patch("shutil.which", return_value="tool"), patch.dict(os.environ, {"SEMA_FORBID_LIVE": "0"}):
            result = check_readiness(cfg, live=True, session_factory=lambda **kw: session)
        self.assertTrue(result["ready"])
        self.assertEqual(session.calls, ["sts"])
        self.assertNotIn("secret-", str(result))

    def test_missing_profile_is_a_reported_blocker_without_secret_output(self):
        def unavailable(**kwargs):
            raise RuntimeError("sensitive error contents")
        with patch("shutil.which", return_value="tool"):
            result = check_readiness(load_config(env={}), profile="sema", session_factory=unavailable)
        self.assertFalse(result["ready"])
        self.assertNotIn("sensitive", str(result))
        self.assertEqual(result["checks"][-1]["check"], "credentials")

    def test_forbid_live_blocks_authentication_before_creating_a_session(self):
        def forbidden(**kwargs):
            self.fail("must not construct live clients")
        with patch("shutil.which", return_value="tool"), patch.dict(os.environ, {"SEMA_FORBID_LIVE": "1"}):
            result = check_readiness(load_config(env={}), live=True, session_factory=forbidden)
        self.assertFalse(result["ready"])
        self.assertIn("SEMA_FORBID_LIVE", result["checks"][-1]["detail"])
