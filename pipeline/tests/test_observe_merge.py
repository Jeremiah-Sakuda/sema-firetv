import unittest

from sema_pipeline.observe import merge_batch_events


def ev(eid, at, description):
    return {"id": eid, "availableAt": at, "description": description, "critical": False}


class MergeBatchEventsTests(unittest.TestCase):
    def test_new_moment_reusing_an_id_is_kept_under_a_fresh_id(self):
        events = [ev("woman-walks", 6.0, "A woman walks through an alley.")]
        problems = merge_batch_events(events, [ev("woman-walks", 24.0, "She holds a spiky fruit.")], 2)
        self.assertEqual([e["id"] for e in events], ["woman-walks", "woman-walks-2"])
        self.assertIn("kept as woman-walks-2", problems[0])

    def test_repeat_of_a_known_moment_is_dropped(self):
        events = [ev("lid", 15.0, "She lifts a lid.")]
        problems = merge_batch_events(events, [ev("lid-again", 15.5, "She lifts a lid.")], 1)
        self.assertEqual([e["id"] for e in events], ["lid"])
        self.assertIn("dropped", problems[0])


if __name__ == "__main__":
    unittest.main()
