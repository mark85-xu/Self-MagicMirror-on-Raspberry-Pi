"""Discover single photos or recursive image folders in a stable order."""

from pathlib import Path

import cv2
import numpy as np


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff", ".jfif"}


def collect_images(source, exclude=None):
    source = Path(source).expanduser().resolve()
    excluded = Path(exclude).expanduser().resolve() if exclude else None
    if not source.exists():
        raise ValueError(f"Input does not exist: {source}")
    if source.is_file():
        if source.suffix.lower() not in IMAGE_SUFFIXES:
            raise ValueError(f"Unsupported image extension: {source}")
        return [source]
    if not source.is_dir():
        raise ValueError(f"Input is not a file or directory: {source}")
    if excluded == source:
        raise ValueError("Output directory must differ from the input directory")
    images = {
        path.resolve() for path in source.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        and not (excluded and path.resolve().is_relative_to(excluded))
    }
    if not images:
        raise ValueError(f"No supported images found recursively in: {source}")
    return sorted(images)


def registration_groups(source, name=None):
    """An explicit name groups all photos; otherwise first-level folders are names."""
    source = Path(source).expanduser().resolve()
    if name is not None:
        return {name: collect_images(source)}
    if not source.is_dir():
        raise ValueError("A single photo requires --name")
    if any(
        path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        for path in source.iterdir()
    ):
        raise ValueError("Photos at the folder root require --name; otherwise use person subfolders")
    groups = {}
    for directory in sorted(path for path in source.iterdir() if path.is_dir()):
        # Empty/non-image directories are not person groups.
        if any(path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
               for path in directory.rglob("*")):
            groups[directory.name] = collect_images(directory)
    if not groups:
        raise ValueError("No person folders found; use --name for a single person's folder")
    return groups


def read_image(path):
    # imdecode also handles paths containing Chinese characters.
    try:
        image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    except (OSError, cv2.error) as error:
        raise ValueError(f"Cannot read image: {path}") from error
    if image is None:
        raise ValueError(f"Cannot decode image: {path}")
    return image


def write_image(path, image):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(".jpg", image)
    if not ok:
        raise ValueError(f"Cannot encode output image: {path}")
    encoded.tofile(path)
