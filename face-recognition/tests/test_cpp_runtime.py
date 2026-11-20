"""Native runtime integration checks; skipped where the ARM binary is not built."""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
BINARY = Path(os.environ.get("FACE_CPP_BINARY", ROOT / "build/cpp/face_recognizer"))
PHOTO = ROOT / "faces/huangqichao/h-1.jpg"


@unittest.skipUnless(BINARY.is_file() and PHOTO.is_file(), "Native binary/reference photo unavailable")
class CppRuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="face-cpp-test-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.workspace = Path(cls.temporary.name)
        cls.reference_report = cls.workspace / "reference.json"
        result = cls.run_cpp("--input", PHOTO, "--report", cls.reference_report)
        if result.returncode:
            raise AssertionError(result.stderr)
        cls.reference = json.loads(cls.reference_report.read_text())["images"][0]["faces"][0]
        cls.feature = np.array(cls.reference["feature"], dtype=np.float32)
        if cls.reference["name"] != "huangqichao" or cls.reference["score"] < 0.9:
            raise AssertionError("Reference face did not match its original gallery")

    @classmethod
    def run_cpp(cls, *arguments, env=None):
        return subprocess.run(
            [str(BINARY), "--root", str(ROOT), "--no-show", *map(str, arguments)],
            capture_output=True, text=True, timeout=30, env=env,
        )

    def save_person(self, directory, name, features, model="sface-2021dec"):
        directory.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            directory / f"{name}.npz", name=np.array(name), model_id=np.array(model),
            features=np.asarray(features), sources=np.array([str(PHOTO)]),
        )

    def test_landmarks_and_embeddings_agree_with_python(self):
        import cv2
        from face_recognition.config import ModelConfig
        from face_recognition.services.pipeline import FacePipeline

        cv2.setNumThreads(4)
        pipeline = FacePipeline(ModelConfig(detector=ROOT / "models/yolo26n-face_ncnn_model"))
        image = cv2.imread(str(PHOTO))
        face = pipeline.extract(image, require_single=True)[0]
        self.assertGreater(float(self.feature @ face.feature), 0.97)
        error = np.max(np.abs(face.detection.landmarks - self.reference["landmarks"]))
        self.assertLess(error, max(image.shape[:2]) / 640 * 1.5)

    def test_compressed_unicode_gallery(self):
        directory = self.workspace / "unicode"
        self.save_person(directory, "测试人员", [self.feature])
        report = self.workspace / "unicode.json"
        result = self.run_cpp("--input", PHOTO, "--vectors-dir", directory, "--report", report)
        self.assertEqual(result.returncode, 0, result.stderr)
        face = json.loads(report.read_text())["images"][0]["faces"][0]
        self.assertEqual(face["name"], "测试人员")
        self.assertGreater(face["score"], 0.999)

    def test_unmatched_vector_is_unknown(self):
        other = np.zeros(128, dtype=np.float32)
        other[int(np.argmin(np.abs(self.feature)))] = 1
        other -= float(other @ self.feature) * self.feature
        other /= np.linalg.norm(other)
        directory = self.workspace / "unmatched"
        self.save_person(directory, "someone_else", [other])
        report = self.workspace / "unmatched.json"
        result = self.run_cpp("--input", PHOTO, "--vectors-dir", directory, "--report", report)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(report.read_text())["images"][0]["faces"][0]["name"], "Unknown")

    def test_model_dtype_and_truncated_archives_are_rejected(self):
        for label, feature, model in (
            ("model", self.feature, "different-model"),
            ("dtype", self.feature.astype(np.float64), "sface-2021dec"),
            ("zero", np.zeros(128, dtype=np.float32), "sface-2021dec"),
        ):
            with self.subTest(label=label):
                directory = self.workspace / label
                self.save_person(directory, "test", [feature], model)
                result = self.run_cpp("--input", PHOTO, "--vectors-dir", directory)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn("Error:", result.stderr)
        directory = self.workspace / "truncated"
        self.save_person(directory, "test", [self.feature])
        path = directory / "test.npz"
        path.write_bytes(path.read_bytes()[:100])
        result = self.run_cpp("--input", PHOTO, "--vectors-dir", directory)
        self.assertEqual(result.returncode, 1, result.stderr)

    def test_recursive_input_skips_corrupt_files_and_output(self):
        directory = self.workspace / "photos"
        (directory / "nested").mkdir(parents=True)
        shutil.copy(PHOTO, directory / "one.JPG")
        shutil.copy(PHOTO, directory / "nested/two.jpg")
        (directory / "bad.jpg").write_bytes(b"not an image")
        output = directory / "results"
        report = self.workspace / "batch.json"
        for _ in range(2):
            result = self.run_cpp("--input", directory, "--output", output, "--report", report)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertIn("processed=2, skipped=1", result.stdout)
            self.assertEqual(len(json.loads(report.read_text())["images"]), 3)
            self.assertEqual(len(list(output.rglob("*.recognized.jpg"))), 2)

    def test_invalid_options_and_headless_display(self):
        for arguments in (("--threads", "0"), ("--threshold", "nan"), ("--threshold", "2")):
            self.assertEqual(self.run_cpp(*arguments).returncode, 1)
        env = os.environ.copy()
        env.pop("DISPLAY", None)
        result = self.run_cpp("--show", "--source", "csi", env=env)
        self.assertEqual(result.returncode, 1)
        self.assertIn("DISPLAY is not set", result.stderr)
