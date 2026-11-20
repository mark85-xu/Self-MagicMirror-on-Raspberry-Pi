"""Data passed between detection, feature extraction and matching."""

from dataclasses import dataclass

import numpy as np


@dataclass
class Detection:
    box: np.ndarray
    landmarks: np.ndarray
    confidence: float


@dataclass
class Face:
    detection: Detection
    feature: np.ndarray


@dataclass(frozen=True)
class Match:
    name: str
    score: float


def unit_vector(feature):
    vector = np.asarray(feature, dtype=np.float32).reshape(-1)
    norm = np.linalg.norm(vector)
    if not vector.size or not np.isfinite(vector).all() or norm < 1e-8:
        raise ValueError("Invalid face embedding")
    return vector / norm
