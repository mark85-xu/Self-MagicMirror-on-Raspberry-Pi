"""NCNN exports must retain the five-point pose schema used by face alignment."""

import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import MagicMock, patch

from ultralytics.utils import YAML

from face_recognition.config import ModelConfig
from face_recognition.models.detector import FaceDetector


class DetectorTests(unittest.TestCase):
    def make_export(self, root, shape=(5, 2), task="pose"):
        directory = Path(root) / "face_ncnn_model"
        directory.mkdir()
        for name in ("model.ncnn.param", "model.ncnn.bin"):
            (directory / name).touch()
        YAML.save(directory / "metadata.yaml", {
            "task": task, "kpt_shape": list(shape), "imgsz": [640, 640],
        })
        return directory

    def test_ncnn_directory_uses_metadata_and_pose_task(self):
        with tempfile.TemporaryDirectory() as root:
            directory = self.make_export(root)
            with patch("face_recognition.models.detector.YOLO") as constructor:
                detector = FaceDetector(ModelConfig(detector=directory))
            constructor.assert_called_once_with(str(directory), task="pose")
            self.assertEqual(detector.imgsz, [640, 640])

    def test_wrong_landmark_layout_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            directory = self.make_export(root, shape=(17, 3))
            with self.assertRaisesRegex(ValueError, "kpt_shape"):
                FaceDetector(ModelConfig(detector=directory))

    def test_missing_export_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            directory = self.make_export(root)
            (directory / "model.ncnn.bin").unlink()
            with self.assertRaisesRegex(ValueError, "complete"):
                FaceDetector(ModelConfig(detector=directory))

    def test_ncnn_requires_cpu_and_pt_retains_schema_check(self):
        with tempfile.TemporaryDirectory() as root:
            directory = self.make_export(root)
            config = ModelConfig(detector=directory)
            with self.assertRaisesRegex(ValueError, "cpu"):
                FaceDetector(replace(config, device="0"))
            weights = Path(root) / "face.pt"
            weights.touch()
            model = MagicMock()
            model.model.kpt_shape = [17, 3]
            with patch("face_recognition.models.detector.YOLO", return_value=model):
                with self.assertRaisesRegex(ValueError, "kpt_shape"):
                    FaceDetector(ModelConfig(detector=weights))
