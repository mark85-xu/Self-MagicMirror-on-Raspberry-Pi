"""Use YOLO's five landmarks to align faces and extract SFace embeddings."""

import cv2
import numpy as np

from ..domain import unit_vector


class FaceEmbedder:
    def __init__(self, config):
        if not config.recognizer.is_file():
            raise ValueError(f"SFace model not found: {config.recognizer}")
        self.model = cv2.FaceRecognizerSF.create(str(config.recognizer), "")
        self.min_face_size = config.min_face_size

    def extract(self, image, detection):
        x1, y1, x2, y2 = detection.box
        points = detection.landmarks
        height, width = image.shape[:2]
        if min(x2 - x1, y2 - y1) < self.min_face_size:
            raise ValueError(f"Face is smaller than {self.min_face_size} pixels")
        if (
            points.shape != (5, 2)
            or not np.isfinite(points).all()
            or np.any(points <= 0)
            or np.any(points[:, 0] >= width)
            or np.any(points[:, 1] >= height)
            or np.linalg.norm(points[0] - points[1]) < 5
        ):
            raise ValueError("Invalid or out-of-frame face landmarks")
        # Order in both models: image-left eye, image-right eye, nose,
        # image-left mouth corner, image-right mouth corner. Never sort the points.
        row = np.concatenate((
            [x1, y1, x2 - x1, y2 - y1], points.ravel(), [detection.confidence],
        )).astype(np.float32).reshape(1, 15)
        aligned = self.model.alignCrop(image, row)
        return unit_vector(self.model.feature(aligned))
