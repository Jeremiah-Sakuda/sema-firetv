"""Model-output JSON extraction/repair and observation validation."""
import unittest

from sema_pipeline.llm import extract_json
from sema_pipeline.observe import normalize_observations, parse_time
from sema_pipeline.timeline import scenes_from_boundaries

SCENES = scenes_from_boundaries([9.0], 15.0)


class ExtractJsonTests(unittest.TestCase):
    def test_fenced_with_prose(self):
        self.assertEqual(extract_json('Sure! Here it is:\n```json\n{"a": 1}\n```\nThanks'), {"a": 1})

    def test_trailing_commas_and_smart_quotes(self):
        self.assertEqual(extract_json('{“a”: [1, 2,], }'), {"a": [1, 2]})

    def test_truncated_by_max_tokens(self):
        value = extract_json('{"events": [{"id": "a", "description": "door op')
        self.assertEqual(value["events"][0]["id"], "a")

    def test_trailing_text_after_object(self):
        self.assertEqual(extract_json('{"x": true} and more text {"y": 2}'), {"x": True})

    def test_no_json_raises(self):
        with self.assertRaises(ValueError):
            extract_json("I cannot help with that.")


class NormalizeObservationsTests(unittest.TestCase):
    def test_repairs_times_ids_flags_and_scenes(self):
        raw = {"characters": [{"ref": "Woman in Red", "description": "red coat"}],
               "events": [
                   {"id": "Door Opens!", "description": "The door opens.", "startTime": "0:09.2",
                    "availableAt": "9.0s", "critical": "yes", "sceneId": "s1", "characters": ["woman-in-red"]},
                   {"description": "Envelope hidden.", "startTime": 2.0, "critical": True},
                   {"description": "Envelope hidden.", "startTime": 2.5, "availableAt": 2.6, "critical": False},
                   {"description": "", "startTime": 1.0},
                   {"description": "After the end.", "startTime": 40},
                   "not-an-object"]}
        events, characters, problems = normalize_observations(raw, 15.0, SCENES)
        self.assertEqual([e["id"] for e in events], ["envelope-hidden", "envelope-hidden-2", "door-opens"])
        door = events[-1]
        self.assertEqual((door["startTime"], door["availableAt"]), (9.2, 9.2))  # availableAt < start -> repaired
        self.assertTrue(door["critical"])
        self.assertEqual(door["scene"], "s02")       # recomputed from our detected scenes
        self.assertEqual(door["modelSceneId"], "s1")
        self.assertEqual(events[0]["availableAt"], 2.0)  # missing availableAt -> startTime
        self.assertEqual(characters[0]["ref"], "woman-in-red")
        self.assertEqual(characters[0]["firstSeenAt"], 9.2)
        self.assertEqual(len(problems), 4)

    def test_bare_list_and_clamping(self):
        events, _c, _p = normalize_observations([{"description": "Lights fade.", "startTime": 14.99,
                                                  "availableAt": 15.2, "critical": False}], 15.0, SCENES)
        self.assertLess(events[0]["availableAt"], 15.0)  # validator: availableAt < scene.end

    def test_empty_raises_for_repair_roundtrip(self):
        with self.assertRaises(ValueError):
            normalize_observations({"events": []}, 15.0, SCENES)
        with self.assertRaises(ValueError):
            normalize_observations({"evts": []}, 15.0, SCENES)

    def test_parse_time(self):
        self.assertEqual(parse_time("01:02.5"), 62.5)
        self.assertEqual(parse_time("1:00:01"), 3601.0)
        self.assertIsNone(parse_time("soon"))
        self.assertIsNone(parse_time(True))


if __name__ == "__main__":
    unittest.main()
