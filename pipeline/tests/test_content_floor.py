import unittest
from sema_pipeline.script import validate_required_terms
from sema_pipeline.timeline import plan_cues

class ContentFloorTests(unittest.TestCase):
    def test_time_jump_cannot_shorten_to_text(self):
        groups = [['forty', '40'], ['years'], ['later']]
        validate_required_terms('Forty years later.', groups)
        with self.assertRaises(ValueError): validate_required_terms('Text.', groups)
        with self.assertRaises(ValueError): validate_required_terms('Forty years.', groups)

    def test_matches_whole_concepts_and_synonyms(self):
        validate_required_terms('The dragon has a bloody wing.', [['dragon'], ['injured', 'bloody']])
        with self.assertRaises(ValueError): validate_required_terms('Dragonfly.', [['dragon']])

    def test_optional_arrival_does_not_cramp_a_critical_reveal(self):
        windows = [{'id':'w1', 'start':45.22, 'end':49.92, 'scene':'new'}]
        events = [{'id':'bridge','availableAt':25,'critical':False,'scene':'old'},
                  {'id':'jump','availableAt':44,'critical':True,'scene':'new'},
                  {'id':'figures','availableAt':47,'critical':False,'scene':'new'}]
        cues, unplaced = plan_cues(windows, events)
        self.assertEqual(cues[0]['events'], ['jump'])
        self.assertEqual((cues[0]['start'],cues[0]['end']), (45.22,49.92))
        self.assertIn('bridge', [e['id'] for e in unplaced])
