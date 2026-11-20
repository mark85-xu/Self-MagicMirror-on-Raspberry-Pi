"""Compose model adapters without coupling them to files or camera input."""

from ..domain import Face
from ..models.detector import FaceDetector
from ..models.embedder import FaceEmbedder


class FacePipeline:
    def __init__(self, config):
        self.detector = FaceDetector(config)
        self.embedder = FaceEmbedder(config)

    def extract(self, image, require_single=False):
        detections = self.detector.detect(image)
        if require_single:
            if len(detections) != 1:
                raise ValueError(f"Expected exactly one detected face, got {len(detections)}")
            detection = detections[0]
            return [Face(detection, self.embedder.extract(image, detection))]
        faces = []
        for detection in detections:
            try:
                feature = self.embedder.extract(image, detection)
            except ValueError:
                continue
            faces.append(Face(detection, feature))
        return faces
