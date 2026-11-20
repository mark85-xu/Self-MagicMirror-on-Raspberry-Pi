"""Batch registration must isolate corrupt inputs and persist valid samples."""

import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from face_recognition.config import EMBEDDING_SIZE
from face_recognition.services.registration import register_faces
from face_recognition.storage.vector_store import VectorStore


class RegistrationTests(unittest.TestCase):
    def test_recursive_batch_skips_bad_photo_and_rerun_updates(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            photos = root / "photos" / "alice" / "nested"
            photos.mkdir(parents=True)
            good, bad = photos / "good.jpg", photos / "bad.jpg"
            good.touch()
            bad.touch()
            feature = np.ones(EMBEDDING_SIZE, dtype=np.float32)
            pipeline = SimpleNamespace(
                extract=lambda image, require_single: [SimpleNamespace(feature=feature)]
            )

            def read(path):
                if path == bad:
                    raise ValueError("Corrupt photo")
                return np.zeros((1, 1, 3))

            store = VectorStore(root / "vectors")
            with patch("face_recognition.services.registration.read_image", side_effect=read):
                with contextlib.redirect_stdout(io.StringIO()):
                    first = register_faces(root / "photos", None, pipeline, store)
                    second = register_faces(root / "photos", None, pipeline, store)
            self.assertEqual((first.added, first.updated, len(first.skipped)), (1, 0, 1))
            self.assertEqual((second.added, second.updated), (0, 1))
            self.assertEqual(len(VectorStore(store.directory).features), 1)

    def test_registration_rejects_multiple_detections_before_embedding(self):
        from face_recognition.services.pipeline import FacePipeline

        pipeline = FacePipeline.__new__(FacePipeline)
        pipeline.detector = SimpleNamespace(detect=lambda image: [object(), object()])
        with self.assertRaisesRegex(ValueError, "got 2"):
            pipeline.extract(np.zeros((10, 10, 3)), require_single=True)
