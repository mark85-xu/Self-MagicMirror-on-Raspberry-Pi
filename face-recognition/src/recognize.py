"""Recognize a photo, a recursive image folder, or a camera/video stream."""

import argparse
from pathlib import Path

import cv2

from face_recognition.cli import add_model_arguments, configure_runtime, model_config
from face_recognition.services.pipeline import FacePipeline
from face_recognition.services.recognition import recognize_images, recognize_video
from face_recognition.services.events import DashboardEvents
from face_recognition.storage.vector_store import VectorStore
from face_recognition.utils.display import configure_display
from face_recognition.utils.images import IMAGE_SUFFIXES, collect_images


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_model_arguments(parser)
    inputs = parser.add_mutually_exclusive_group()
    inputs.add_argument("--input", type=Path, help="Photo or recursive image folder")
    inputs.add_argument(
        "--source", help="USB index, picamera2[:index] for CSI, or video path (default: 0)"
    )
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--output", type=Path, help="Directory for annotated image results")
    display = parser.add_mutually_exclusive_group()
    display.add_argument("--show", action="store_true", dest="show")
    display.add_argument("--no-show", action="store_false", dest="show")
    parser.set_defaults(show=None)
    parser.add_argument("--max-frames", type=int, default=0)
    parser.add_argument("--json-events", action="store_true", help="Flush dashboard JSON events to stdout")
    parser.add_argument("--preview-file", type=Path, help="Latest annotated JPEG, replaced atomically")
    args = parser.parse_args()
    config = model_config(args, parser)
    configure_runtime(args)
    if not -1 <= args.threshold <= 1 or args.max_frames < 0:
        parser.error("Require -1 <= --threshold <= 1 and --max-frames >= 0")
    # Accept old --source image paths as well as the explicit --input interface.
    if args.source and Path(args.source).suffix.lower() in IMAGE_SUFFIXES:
        args.input = Path(args.source)
    configure_display()
    if args.preview_file and not args.json_events:
        parser.error("--preview-file requires --json-events")
    events = DashboardEvents(args.preview_file) if args.json_events else None
    try:
        if args.input:
            collect_images(args.input, exclude=args.output)
        elif args.output:
            raise ValueError("--output is for photo/folder input, not camera/video")
        store = VectorStore(args.vectors_dir)
        if store.features is None:
            raise ValueError("No registered vectors; run src/register.py first")
        pipeline = FacePipeline(config)
        if args.input:
            processed, errors = recognize_images(
                args.input, pipeline, store, args.threshold,
                args.output, show=args.show is True, events=events,
            )
            return 0 if processed and not errors else 1
        frames = recognize_video(
            args.source or "0", pipeline, store, args.threshold,
            show=args.show is not False, max_frames=args.max_frames, events=events,
        )
        return 0 if frames else 1
    except (ValueError, OSError, cv2.error) as error:
        parser.exit(1, f"Error: {error}\n")
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
