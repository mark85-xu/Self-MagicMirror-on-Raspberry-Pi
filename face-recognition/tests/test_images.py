"""Single-image, recursive and per-person input discovery tests."""

import tempfile
import unittest
from pathlib import Path

from face_recognition.utils.images import collect_images, registration_groups


class ImageInputTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def touch(self, relative):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
        return path

    def test_single_image_and_recursive_folder(self):
        first = self.touch("one.JPG")
        second = self.touch("nested/deep/two.png")
        self.touch("nested/notes.txt")
        self.assertEqual(collect_images(first), [first])
        self.assertEqual(set(collect_images(self.root)), {first, second})

    def test_person_names_come_from_first_level_folders(self):
        alice = self.touch("alice/nested/a.jpg")
        bob = self.touch("bob/b.webp")
        (self.root / "empty").mkdir()
        self.assertEqual(registration_groups(self.root), {"alice": [alice], "bob": [bob]})
        named = registration_groups(self.root, "one_person")
        self.assertEqual(set(named["one_person"]), {alice, bob})

    def test_ambiguous_names_and_empty_inputs_fail(self):
        with self.assertRaises(ValueError):
            collect_images(self.root)
        photo = self.touch("photo.jpg")
        with self.assertRaisesRegex(ValueError, "requires --name"):
            registration_groups(photo)
        with self.assertRaisesRegex(ValueError, "root require --name"):
            registration_groups(self.root)

    def test_nested_output_is_not_scanned(self):
        original = self.touch("nested/photo.jpg")
        self.touch("results/nested/photo.jpg.recognized.jpg")
        self.assertEqual(collect_images(self.root, self.root / "results"), [original])
        with self.assertRaises(ValueError):
            collect_images(self.root, self.root)
