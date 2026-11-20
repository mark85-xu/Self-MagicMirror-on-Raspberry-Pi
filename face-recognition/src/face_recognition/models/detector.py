"""Extract face boxes and five landmarks in original-image coordinates."""

from ultralytics import YOLO
from ultralytics.utils import YAML

from ..domain import Detection


class FaceDetector:
    def __init__(self, config):
        path = config.detector
        self.imgsz = 640
        if path.is_dir():
            required = ("model.ncnn.param", "model.ncnn.bin", "metadata.yaml")
            if not path.name.endswith("_ncnn_model") or any(
                not (path / name).is_file() for name in required
            ):
                raise ValueError("Expected a complete Ultralytics *_ncnn_model directory")
            metadata = YAML.load(path / "metadata.yaml")
            if metadata.get("task") != "pose" or metadata.get("kpt_shape") != [5, 2]:
                raise ValueError("NCNN model must declare task=pose and kpt_shape=[5, 2]")
            if config.device != "cpu":
                raise ValueError("This NCNN detector uses --device cpu")
            self.imgsz = metadata["imgsz"]
            self.model = YOLO(str(path), task="pose")
        elif path.is_file() and path.suffix == ".pt":
            self.model = YOLO(str(path), task="pose")
            if tuple(getattr(self.model.model, "kpt_shape", ())) != (5, 2):
                raise ValueError("Expected a face detector with kpt_shape=[5, 2]")
        else:
            raise ValueError(f"Detector model not found: {config.detector}")
        self.config = config

    def detect(self, image):
        result = self.model.predict(
            image, conf=self.config.confidence, imgsz=self.imgsz,
            device=self.config.device, show=False, verbose=False,
        )[0]
        if result.keypoints is None or result.boxes is None:
            return []
        return [
            Detection(box, points, float(confidence))
            for box, points, confidence in zip(
                result.boxes.xyxy.cpu().numpy(),
                result.keypoints.xy.cpu().numpy(),
                result.boxes.conf.cpu().numpy(),
            )
        ]
