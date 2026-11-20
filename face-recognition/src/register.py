"""Register a photo or recursively register a directory of face photos."""

import argparse
from pathlib import Path

import cv2

from face_recognition.cli import add_model_arguments, configure_runtime, model_config
from face_recognition.services.pipeline import FacePipeline
from face_recognition.services.registration import register_faces
from face_recognition.storage.vector_store import VectorStore
from face_recognition.utils.images import registration_groups


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_model_arguments(parser)
    parser.add_argument("--input", required=True, type=Path, help="Photo or recursive folder")
    parser.add_argument("--name", help="Identity; omit to use first-level person folder names")
    args = parser.parse_args()
    config = model_config(args, parser)
    configure_runtime(args)
    try:
        registration_groups(args.input, args.name)
        store = VectorStore(args.vectors_dir)
        report = register_faces(args.input, args.name, FacePipeline(config), store)
        return 0 if report.added + report.updated else 1
    except (ValueError, OSError, cv2.error) as error:
        parser.exit(1, f"Error: {error}\n")
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
