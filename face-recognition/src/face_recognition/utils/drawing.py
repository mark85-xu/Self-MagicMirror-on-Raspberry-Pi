"""Draw detection boxes, original landmarks and identity matches."""

import cv2
import numpy as np


def annotate(image, faces, matches):
    output = image.copy()
    for face, match in zip(faces, matches):
        color = (0, 200, 0) if match.name != "Unknown" else (0, 100, 255)
        x1, y1, x2, y2 = np.rint(face.detection.box).astype(int)
        cv2.rectangle(output, (x1, y1), (x2, y2), color, 2)
        for x, y in np.rint(face.detection.landmarks).astype(int):
            cv2.circle(output, (x, y), 2, (255, 180, 0), -1)
        cv2.putText(
            output, f"{match.name} {match.score:.3f}", (max(0, x1), max(18, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
        )
    return output
