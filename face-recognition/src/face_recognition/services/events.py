"""Bounded, embedding-free dashboard events and an optional atomic preview."""

import json
import os
from pathlib import Path
from time import monotonic

import cv2


class DashboardEvents:
    def __init__(self, preview_file=None, interval_ms=500):
        self.preview_file = Path(preview_file) if preview_file else None
        self.interval = interval_ms / 1000
        self.last_preview = -float("inf")

    def emit(self, frame, annotated, matches):
        updated = False
        now = monotonic()
        if self.preview_file and now - self.last_preview >= self.interval:
            self.preview_file.parent.mkdir(parents=True, exist_ok=True)
            # Match the extension so OpenCV can select its JPEG encoder.
            temporary = self.preview_file.with_name(self.preview_file.stem + ".tmp.jpg")
            height, width = annotated.shape[:2]
            scale = min(1, 640 / width)
            image = cv2.resize(annotated, (round(width * scale), round(height * scale)))
            if not cv2.imwrite(str(temporary), image, [cv2.IMWRITE_JPEG_QUALITY, 75]):
                raise OSError("Cannot write dashboard preview")
            os.replace(temporary, self.preview_file)
            self.last_preview = now
            updated = True
        print(json.dumps({
            "type": "frame", "frame": frame, "previewUpdated": updated,
            "faces": [{"name": match.name, "score": float(match.score)} for match in matches],
        }, ensure_ascii=False, allow_nan=False), flush=True)
