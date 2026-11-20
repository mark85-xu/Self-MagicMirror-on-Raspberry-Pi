"""Vector persistence, repeat registration and unknown-identity regression tests."""

import tempfile
import unittest
from pathlib import Path

import numpy as np

from face_recognition.config import EMBEDDING_SIZE
from face_recognition.storage.vector_store import VectorStore, validate_name


def vector(index):
    result = np.zeros(EMBEDDING_SIZE, dtype=np.float32)
    result[index] = 1
    return result


class VectorStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name) / "vectors"

    def test_person_files_survive_reload_and_match(self):
        store = VectorStore(self.directory)
        store.save("alice", [vector(0), vector(1)], ["a.jpg", "b.jpg"])
        store.save("bob", [vector(2)], ["c.jpg"])
        self.assertEqual(
            sorted(path.name for path in self.directory.glob("*.npz")),
            ["alice.npz", "bob.npz"],
        )
        loaded = VectorStore(self.directory)
        self.assertEqual(loaded.match(vector(1), 0.9).name, "alice")
        self.assertEqual(loaded.match(vector(2), 0.9).name, "bob")
        self.assertEqual(loaded.match(vector(3), 0.5).name, "Unknown")

    def test_repeated_source_updates_instead_of_appending(self):
        store = VectorStore(self.directory)
        self.assertEqual(store.save("alice", [vector(0)], ["a.jpg"]), (1, 0))
        self.assertEqual(store.save("alice", [vector(1)], ["a.jpg"]), (0, 1))
        self.assertEqual(store.save("alice", [vector(2)], ["b.jpg"]), (1, 0))
        loaded = VectorStore(self.directory)
        self.assertEqual(len(loaded.features), 2)
        self.assertEqual(loaded.match(vector(0), 0.5).name, "Unknown")
        self.assertEqual(loaded.match(vector(1), 0.5).name, "alice")

    def test_invalid_vectors_preserve_existing_file(self):
        store = VectorStore(self.directory)
        store.save("alice", [vector(0)], ["a.jpg"])
        path = self.directory / "alice.npz"
        original = path.read_bytes()
        for invalid in ([0] * EMBEDDING_SIZE, [float("nan")] * EMBEDDING_SIZE, [1, 0]):
            with self.assertRaises(ValueError):
                store.save("alice", [invalid], ["b.jpg"])
            self.assertEqual(path.read_bytes(), original)

    def test_invalid_names_cannot_create_paths(self):
        for name in ("", "..", "Unknown", "../outside", "a/b", "a\\b"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                validate_name(name)

    def test_empty_gallery_and_invalid_threshold(self):
        store = VectorStore(self.directory)
        self.assertEqual(store.match(vector(0)).name, "Unknown")
        with self.assertRaises(ValueError):
            store.match(vector(0), float("nan"))

    def test_incompatible_model_is_rejected(self):
        store = VectorStore(self.directory)
        store.save("alice", [vector(0)], ["a.jpg"])
        path = self.directory / "alice.npz"
        with np.load(path, allow_pickle=False) as data:
            contents = {key: data[key] for key in data.files}
        contents["model_id"] = np.array("another-model")
        np.savez(path, **contents)
        with self.assertRaisesRegex(ValueError, "Recognition model differs"):
            VectorStore(self.directory)

    def test_truncated_vector_file_has_actionable_error(self):
        store = VectorStore(self.directory)
        store.save("alice", [vector(0)], ["a.jpg"])
        path = self.directory / "alice.npz"
        path.write_bytes(path.read_bytes()[:100])
        with self.assertRaisesRegex(ValueError, "Cannot load vector file"):
            VectorStore(self.directory)
