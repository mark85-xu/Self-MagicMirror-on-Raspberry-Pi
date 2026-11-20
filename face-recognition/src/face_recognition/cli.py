"""Shared command-line model/storage options and argument validation."""

from pathlib import Path

from .config import ModelConfig, VECTOR_DIRECTORY


def add_model_arguments(parser):
    defaults = ModelConfig()
    parser.add_argument("--detector", type=Path, default=defaults.detector)
    parser.add_argument("--recognizer", type=Path, default=defaults.recognizer)
    parser.add_argument("--vectors-dir", type=Path, default=VECTOR_DIRECTORY)
    parser.add_argument("--device", default="cpu", help="YOLO: cpu or 0 for CUDA")
    parser.add_argument("--conf", type=float, default=defaults.confidence)
    parser.add_argument("--min-face-size", type=int, default=defaults.min_face_size)
    parser.add_argument(
        "--opencv-threads", type=int, help="OpenCV worker threads (includes SFace)"
    )


def model_config(args, parser):
    if not 0 < args.conf <= 1 or args.min_face_size < 1:
        parser.error("Require 0 < --conf <= 1 and --min-face-size >= 1")
    if args.opencv_threads is not None and args.opencv_threads < 1:
        parser.error("Require --opencv-threads >= 1")
    return ModelConfig(
        detector=args.detector, recognizer=args.recognizer, device=args.device,
        confidence=args.conf, min_face_size=args.min_face_size,
    )


def configure_runtime(args):
    if args.opencv_threads is not None:
        import cv2

        cv2.setNumThreads(args.opencv_threads)
