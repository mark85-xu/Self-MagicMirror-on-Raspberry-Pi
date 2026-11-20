"""Shared paths and model settings, independent of the working directory."""

from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
VECTOR_DIRECTORY = PROJECT_ROOT / "face_vectors"
MODEL_ID = "sface-2021dec"
EMBEDDING_SIZE = 128


@dataclass(frozen=True)
class ModelConfig:
    detector: Path = PROJECT_ROOT / "models/yolo26n-face.pt"
    recognizer: Path = PROJECT_ROOT / "models/face_recognition_sface_2021dec.onnx"
    device: str = "cpu"
    confidence: float = 0.5
    min_face_size: int = 40
