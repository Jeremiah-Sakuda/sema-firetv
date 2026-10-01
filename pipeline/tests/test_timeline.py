"""Dialogue merging, scenes, window derivation, event->cue assignment, word budgets."""
import json
import unittest

from tests.helpers import REPLAY
from sema_pipeline.timeline import (ceil2, count_words, derive_windows, fits, level_budgets, merge_dialogue,
                                    non_speech_sounds, plan_cues, scenes_from_boundaries, shorten_target_words,
                                    word_budget, words_from_transcript)


def w(start, end, text="x"):
    return {"start": start, "end": end, "text": text}


def ev(eid, at, critical=True):
    return {"id": eid, "availableAt": at, "critical": critical}


class DialogueMergeTests(unittest.TestCase):
    def test_merges_gaps_below_threshold_and_pads(self):
        words = [w(1.0, 1.3), w(1.8, 2.0), w(2.5, 2.9)]  # gaps 0.5, 0.5 < 0.6
        self.assertEqual(merge_dialogue(words), [{"start": 0.9, "end": 3.0}])

    def test_gap_at_threshold_splits(self):
        words = [w(1.0, 1.3), w(1.9, 2.2)]  # gap exactly 0.6 -> not < 0.6 -> separate
        self.assertEqual(merge_dialogue(words, pad=0.0), [{"start": 1.0, "end": 1.3}, {"start": 1.9, "end": 2.2}])

    def test_padding_that_overlaps_is_merged(self):
        # With a small merge gap, gap 0.15 keeps words apart, but 0.1 s padding on both sides overlaps them.
        words = [w(1.0, 1.3), w(1.45, 2.2)]
        self.assertEqual(merge_dialogue(words, merge_gap=0.1, pad=0.1), [{"start": 0.9, "end": 2.3}])
        # With the defaults, separate spans keep >= 0.4 s between them after padding.
        self.assertEqual(merge_dialogue([w(1.0, 1.3), w(1.95, 2.2)]),
                         [{"start": 0.9, "end": 1.4}, {"start": 1.85, "end": 2.3}])

    def test_clamped_to_film(self):
        self.assertEqual(merge_dialogue([w(0.05, 0.5), w(9.7, 9.95)], duration=10.0),
                         [{"start": 0.0, "end": 0.6}, {"start": 9.6, "end": 10.0}])

    def test_unsorted_and_zero_length_words(self):
        words = [w(5.0, 5.0), w(1.0, 1.2)]
        self.assertEqual(merge_dialogue(words), [{"start": 0.9, "end": 1.3}, {"start": 4.9, "end": 5.1}])

    def test_transcribe_items_parsing_skips_punctuation(self):
        transcript = json.loads((REPLAY / "transcribe.json").read_text())
        words = words_from_transcript(transcript)
        self.assertEqual([x["text"] for x in words], ["I'll", "be", "right", "back", "Where", "is", "it"])
        self.assertEqual(merge_dialogue(words, duration=15.0), [{"start": 0.02, "end": 1.09}, {"start": 7.11, "end": 7.82}])


class SceneAndWindowTests(unittest.TestCase):
    def test_scenes_contiguous_and_cover_film(self):
        scenes = scenes_from_boundaries([0.2, 4.0, 4.5, 9.0, 14.6], 15.0, min_scene=1.0)
        self.assertEqual([(s["start"], s["end"]) for s in scenes], [(0, 4.0), (4.0, 9.0), (9.0, 15.0)])
        self.assertEqual(scenes[0]["start"], 0)
        self.assertEqual(scenes[-1]["end"], 15.0)

    def test_no_cuts_single_scene(self):
        self.assertEqual(scenes_from_boundaries([], 12.5), [{"id": "s01", "start": 0, "end": 12.5}])

    def test_windows_are_gaps_of_min_length(self):
        dialogue = [{"start": 1.0, "end": 2.0}, {"start": 3.0, "end": 6.0}, {"start": 7.0, "end": 8.0}]
        windows = derive_windows(dialogue, 12.0, None, min_window=1.5)
        # gaps: 0-1 (1.0, too short), 2-3 (1.0), 6-7 (1.0), 8-12 (4.0)
        self.assertEqual([(x["start"], x["end"]) for x in windows], [(8.0, 12.0)])

    def test_windows_split_at_scene_cut_only_when_both_halves_fit(self):
        scenes = scenes_from_boundaries([5.0, 9.0], 12.0)
        windows = derive_windows([{"start": 0.0, "end": 2.0}], 12.0, scenes, min_window=1.5)
        # gap 2-12; cut at 5 -> 2-5 (3.0) + 5-12; cut at 9 -> 5-9 + 9-12 (3.0)
        self.assertEqual([(x["start"], x["end"], x["scene"]) for x in windows],
                         [(2.0, 5.0, "s01"), (5.0, 9.0, "s02"), (9.0, 12.0, "s03")])
        no_split = derive_windows([{"start": 0.0, "end": 4.0}], 12.0, scenes, min_window=1.5)
        self.assertEqual((no_split[0]["start"], no_split[1]["start"]), (4.0, 9.0))  # 4-5 too short: no cut at 5

    def test_windows_never_overlap_dialogue(self):
        dialogue = [{"start": 0.5, "end": 3.0}, {"start": 6.0, "end": 6.4}]
        for win in derive_windows(dialogue, 10.0, None):
            for d in dialogue:
                self.assertTrue(win["end"] <= d["start"] or win["start"] >= d["end"])

    def test_non_speech_sounds(self):
        sounds = non_speech_sounds([(0.0, 1.0), (4.0, 10.0)], [{"start": 1.0, "end": 2.0}], 10.0)
        self.assertEqual(sounds, [{"start": 2.0, "end": 4.0}])


class CuePlanningTests(unittest.TestCase):
    def assert_invariants(self, cues, events):
        by_id = {e["id"]: e for e in events}
        end = 0.0
        for c in cues:
            self.assertGreaterEqual(c["start"], end)
            end = c["end"]
            for eid in c["events"]:
                self.assertLessEqual(by_id[eid]["availableAt"], c["start"], f"future fact in {c['id']}")

    def test_no_future_facts_and_cue_starts_when_event_visible(self):
        windows = [{"id": "w1", "start": 1.09, "end": 7.11}, {"id": "w2", "start": 7.82, "end": 15.0}]
        events = [ev("room", 0.5, False), ev("envelope", 2.0), ev("door", 9.0)]
        cues, unplaced = plan_cues(windows, events)
        self.assert_invariants(cues, events)
        self.assertEqual(unplaced, [])
        self.assertEqual([(c["start"], c["end"], c["events"]) for c in cues],
                         [(2.0, 7.11, ["room", "envelope"]), (9.0, 15.0, ["door"])])

    def test_event_not_available_in_window_moves_to_later_window(self):
        windows = [{"id": "w1", "start": 0.0, "end": 3.0}, {"id": "w2", "start": 6.0, "end": 9.0}]
        events = [ev("late", 2.5)]  # 3.0 - 2.5 < 1.5 -> no room in w1
        cues, unplaced = plan_cues(windows, events)
        self.assertEqual([(c["window"], c["start"]) for c in cues], [("w2", 6.0)])

    def test_critical_unplaced_is_reported_not_dropped(self):
        windows = [{"id": "w1", "start": 0.0, "end": 5.0}]
        events = [ev("a", 1.0), ev("too-late", 4.0)]
        cues, unplaced = plan_cues(windows, events)
        self.assertEqual([e["id"] for e in unplaced], ["too-late"])
        self.assert_invariants(cues, events)

    def test_long_window_split_at_next_arrival(self):
        windows = [{"id": "w1", "start": 0.0, "end": 12.0}]
        events = [ev("a", 1.0), ev("b", 5.0), ev("c", 9.0, False)]
        cues, unplaced = plan_cues(windows, events)
        self.assertEqual([(c["start"], c["end"], c["events"]) for c in cues],
                         [(1.0, 5.0, ["a"]), (5.0, 9.0, ["b"]), (9.0, 12.0, ["c"])])
        self.assertEqual(unplaced, [])

    def test_close_critical_arrival_is_merged_not_deferred(self):
        windows = [{"id": "w1", "start": 0.0, "end": 6.0}]
        events = [ev("a", 1.0), ev("b", 1.8)]  # b arrives 0.8 s after a: one cue at 1.8 covering both
        cues, unplaced = plan_cues(windows, events)
        self.assertEqual([(c["start"], c["events"]) for c in cues], [(1.8, ["a", "b"])])

    def test_critical_preferred_when_cue_is_full(self):
        windows = [{"id": "w1", "start": 3.0, "end": 5.0}]
        events = [ev("o1", 0.1, False), ev("o2", 0.2, False), ev("k", 0.3, True)]
        cues, unplaced = plan_cues(windows, events, max_events=1)
        self.assertEqual(cues[0]["events"], ["k"])
        self.assertTrue(cues[0]["critical"])
        self.assertEqual(sorted(e["id"] for e in unplaced), ["o1", "o2"])

    def test_start_rounding_never_precedes_availability(self):
        windows = [{"id": "w1", "start": 0.0, "end": 9.0}]
        events = [ev("a", 2.004)]
        cues, _ = plan_cues(windows, events)
        self.assertGreaterEqual(cues[0]["start"], 2.004)
        self.assertEqual(ceil2(2.004), 2.01)


class BudgetTests(unittest.TestCase):
    def test_word_budget_formula(self):
        self.assertEqual(word_budget(5.11), 11)   # 5.11*2.6*0.85 = 11.29
        self.assertEqual(word_budget(6.0), 13)    # 13.26
        self.assertEqual(word_budget(1.5), 3)     # 3.315
        self.assertEqual(word_budget(10.0, words_per_second=3.0, safety=1.0), 30)
        self.assertEqual(word_budget(0.2), 1)     # never zero

    def test_cap_seconds(self):
        self.assertEqual(word_budget(30.0, cap_seconds=10.0), word_budget(10.0))

    def test_level_budgets_monotone(self):
        b = level_budgets(6.0)
        self.assertEqual(b, {"essential": 5, "standard": 9, "rich": 13})
        tiny = level_budgets(1.5)
        self.assertLessEqual(tiny["essential"], tiny["standard"])
        self.assertLessEqual(tiny["standard"], tiny["rich"])
        self.assertGreaterEqual(tiny["essential"], 2)

    def test_fit_rule_matches_validator_plus_slack(self):
        self.assertTrue(fits(4.6, 5.0, 0.2))            # 4.6 + 0.4 == 5.0 -> validator ok
        self.assertFalse(fits(4.6, 5.0, 0.2, 0.15))     # pipeline slack rejects zero-headroom fits
        self.assertTrue(fits(4.45, 5.0, 0.2, 0.15))

    def test_shorten_target_and_word_count(self):
        self.assertEqual(count_words("The blue door's open - a well-lit hall."), 7)
        self.assertEqual(shorten_target_words("one two three four five six seven eight nine ten", 8.0, 4.0), 4)
        self.assertEqual(shorten_target_words("one two", 9.0, 1.0), 1)


if __name__ == "__main__":
    unittest.main()
