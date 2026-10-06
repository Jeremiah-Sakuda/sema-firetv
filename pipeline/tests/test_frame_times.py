import tempfile
import unittest
from pathlib import Path
from sema_pipeline import media

class SourceFrameTimeTests(unittest.TestCase):
    def test_reports_source_pts_instead_of_a_nominal_sample_clock(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source.mp4'
            media._run([media.FFMPEG, '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
                        '-i', 'testsrc=size=64x48:rate=3:duration=3', '-c:v', 'mpeg4', str(source)])
            frames = media.extract_frames(source, 2, root / 'frames', 64)
            self.assertEqual(len(frames), 5)
            self.assertAlmostEqual(frames[1][0], 2/3, places=5)
            self.assertNotEqual(frames[1][0], .5)
            self.assertTrue(all(path.is_file() for _,path in frames))
