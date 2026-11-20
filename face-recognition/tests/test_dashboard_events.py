"""Dashboard transport must not expose face embeddings or partial preview files."""

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from face_recognition.domain import Match
from face_recognition.services.events import DashboardEvents


class DashboardEventTests(unittest.TestCase):
    def test_event_is_flushed_json_and_preview_is_a_single_jpeg(self):
        with tempfile.TemporaryDirectory() as directory:
            preview = Path(directory) / "preview.jpg"
            events = DashboardEvents(preview)
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                events.emit(0, np.zeros((480, 640, 3), dtype=np.uint8), [Match("huangqichao", 0.95)])
                events.emit(1, np.zeros((480, 640, 3), dtype=np.uint8), [])
            first, second = map(json.loads, output.getvalue().splitlines())
            self.assertEqual(first["faces"], [{"name": "huangqichao", "score": 0.95}])
            self.assertTrue(first["previewUpdated"])
            self.assertFalse(second["previewUpdated"])
            self.assertEqual(list(Path(directory).iterdir()), [preview])
            self.assertTrue(preview.read_bytes().startswith(b"\xff\xd8"))
            self.assertNotIn("feature", output.getvalue())
