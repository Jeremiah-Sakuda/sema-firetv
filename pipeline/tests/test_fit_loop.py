"""Deterministic fit loop with a fake renderer (no ffmpeg, no AWS)."""
import unittest

from sema_pipeline.render import fit_loop

SECONDS_PER_CHAR = 1 / 15


class FakeRenderer:
    """Duration proportional to text length, like a TTS voice."""

    def __init__(self):
        self.calls = []

    def __call__(self, text, attempt):
        self.calls.append((attempt, text))
        return {"audio": f"/fake/{attempt}.mp3", "duration": round(0.25 + len(text) * SECONDS_PER_CHAR, 3)}


class FakeShortener:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def __call__(self, text, target_words, attempt, measured, available):
        self.calls.append({"attempt": attempt, "target": target_words, "measured": measured, "available": available})
        return self.replies.pop(0) if self.replies else text


class FitLoopTests(unittest.TestCase):
    def test_fits_first_try_no_regeneration(self):
        render, shorten = FakeRenderer(), FakeShortener([])
        out = fit_loop("The door opens.", window_seconds=3.0, margin=0.2, slack=0.15, render=render, shorten=shorten)
        self.assertEqual(out["status"], "fit")
        self.assertTrue(out["firstTry"])
        self.assertEqual(out["regenerations"], 0)
        self.assertEqual(shorten.calls, [])
        self.assertAlmostEqual(out["available"], 2.45)  # 3.0 - 2*0.2 - 0.15
        self.assertGreaterEqual(out["headroom"], 0)

    def test_shortens_then_fits_and_measures_again(self):
        long = "The tall blue door swings wide open onto a warm, bright hallway beyond the desk."
        render = FakeRenderer()
        shorten = FakeShortener(["The blue door swings open onto a hallway.", "unused"])
        out = fit_loop(long, window_seconds=4.0, margin=0.2, slack=0.15, render=render, shorten=shorten)
        self.assertEqual(out["status"], "fit")
        self.assertEqual(out["regenerations"], 1)
        self.assertEqual(out["text"], "The blue door swings open onto a hallway.")
        self.assertEqual(len(render.calls), 2)                     # re-rendered and re-measured
        self.assertLess(shorten.calls[0]["target"], len(long.split()))
        self.assertAlmostEqual(shorten.calls[0]["available"], 3.45)
        self.assertEqual(out["audio"], "/fake/1.mp3")

    def test_unresolved_after_two_retries(self):
        render = FakeRenderer()
        shorten = FakeShortener(["Still far too long for this very short window, sadly.",
                                 "Also too long for the window, even now."])
        out = fit_loop("A very long description that cannot possibly fit.", window_seconds=1.6, margin=0.2,
                       slack=0.15, render=render, shorten=shorten, max_retries=2)
        self.assertEqual(out["status"], "unresolved")
        self.assertEqual(len(render.calls), 3)                     # 1 render + 2 retries
        self.assertEqual(len(shorten.calls), 2)
        self.assertLess(out["headroom"], 0)
        self.assertEqual(out["duration"], min(a["duration"] for a in out["attempts"]))  # shortest kept for review

    def test_shortener_without_progress_stops_early(self):
        render = FakeRenderer()
        out = fit_loop("Too long to fit in a tiny window here.", window_seconds=1.0, margin=0.2, slack=0.15,
                       render=render, shorten=lambda *a: "Too long to fit in a tiny window here.")
        self.assertEqual(out["status"], "unresolved")
        self.assertEqual(len(render.calls), 1)
        self.assertEqual(out["attempts"][-1]["note"], "shortener returned no change")

    def test_slack_is_enforced_beyond_validator_margin(self):
        # 15 chars -> 1.25 s; window 1.65 = 1.25 + 2*0.2 exactly: validator-ok, but no slack -> regenerate
        render = FakeRenderer()
        out = fit_loop("abcdefghijklmno", window_seconds=1.65, margin=0.2, slack=0.15, render=render,
                       shorten=FakeShortener(["abcdefghij"]))
        self.assertEqual(out["regenerations"], 1)
        self.assertEqual(out["status"], "fit")


if __name__ == "__main__":
    unittest.main()
