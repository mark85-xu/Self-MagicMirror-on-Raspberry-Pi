"""Recognize recursive image inputs or frames from a camera/video."""

from pathlib import Path
from time import perf_counter

import cv2

from ..utils.capture import open_capture
from ..utils.display import require_display
from ..utils.drawing import annotate
from ..utils.images import collect_images, read_image, write_image


WINDOW = "Face recognition - Q / Esc to quit"


def recognize_frame(image, pipeline, store, threshold):
    faces = pipeline.extract(image)
    matches = [store.match(face.feature, threshold) for face in faces]
    return annotate(image, faces, matches), matches


def print_matches(label, matches):
    text = ", ".join(f"{match.name} ({match.score:.3f})" for match in matches)
    print(f"{label}: {text or 'No usable faces'}")


def show_frame(image, delay):
    cv2.imshow(WINDOW, image)
    key = cv2.waitKey(delay) & 0xFF
    if key in (ord("q"), 27):
        return False
    return cv2.getWindowProperty(WINDOW, cv2.WND_PROP_VISIBLE) >= 1


def recognize_images(source, pipeline, store, threshold=0.5, output=None, show=False, events=None):
    source = Path(source).expanduser().resolve()
    paths = collect_images(source, exclude=output)
    if show:
        require_display()
    processed, errors = 0, []
    try:
        for path in paths:
            try:
                image = read_image(path)
                annotated, matches = recognize_frame(image, pipeline, store, threshold)
                print_matches(path, matches)
                if events:
                    events.emit(processed, annotated, matches)
                if output:
                    relative = path.relative_to(source) if source.is_dir() else Path(path.name)
                    destination = (
                        Path(output) / relative.parent / f"{relative.name}.recognized.jpg"
                    )
                    write_image(destination, annotated)
                processed += 1
            except (ValueError, OSError, cv2.error) as error:
                errors.append((path, str(error)))
                print(f"SKIP {path}: {error}")
                continue
            if show and not show_frame(annotated, 0):
                break
    finally:
        if show:
            cv2.destroyAllWindows()
    print(f"Recognition: processed={processed}, skipped={len(errors)}")
    return processed, errors


def recognize_video(source, pipeline, store, threshold=0.5, show=True, max_frames=0, events=None):
    if show:
        require_display()
    capture = open_capture(source)
    frames = 0
    started = perf_counter()
    try:
        if not capture.isOpened():
            raise ValueError(f"Cannot open camera/video: {source}")
        while not max_frames or frames < max_frames:
            ok, image = capture.read()
            if not ok:
                if frames == 0:
                    raise ValueError("Could not read the first video frame")
                break
            annotated, matches = recognize_frame(image, pipeline, store, threshold)
            if events:
                events.emit(frames, annotated, matches)
            elif not show:
                print_matches(f"frame={frames}", matches)
            frames += 1
            if show and not show_frame(annotated, 1):
                break
    finally:
        capture.release()
        if show:
            cv2.destroyAllWindows()
        if frames:
            elapsed = perf_counter() - started
            print(f"Video: frames={frames}, elapsed={elapsed:.2f}s, fps={frames / elapsed:.2f}")
    return frames
