"""One NPZ file per person; replace a photo's vector when registering it again."""

from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import BadZipFile

import numpy as np

from ..config import EMBEDDING_SIZE, MODEL_ID
from ..domain import Match, unit_vector


def validate_name(name):
    name = name.strip()
    if (
        not name or name.casefold() == "unknown" or name in {".", ".."}
        or any(character in name for character in "/\\")
        or any(ord(character) < 32 for character in name)
    ):
        raise ValueError("Use a non-empty person name without path separators or Unknown")
    return name


def feature_matrix(features):
    matrix = np.asarray(features, dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape[1] != EMBEDDING_SIZE or not len(matrix):
        raise ValueError(f"Expected one or more {EMBEDDING_SIZE}-dimension face vectors")
    return np.stack([unit_vector(row) for row in matrix])


class VectorStore:
    def __init__(self, directory):
        self.directory = Path(directory).expanduser().resolve()
        self.people = {}
        if self.directory.exists() and not self.directory.is_dir():
            raise ValueError(f"Vector directory is not a directory: {self.directory}")
        for path in sorted(self.directory.glob("*.npz")):
            try:
                with path.open("rb") as file, np.load(file, allow_pickle=False) as data:
                    name = validate_name(str(data["name"].item()))
                    if data["model_id"].item() != MODEL_ID:
                        raise ValueError(
                            "Recognition model differs; register into a new directory"
                        )
                    features = feature_matrix(data["features"])
                    sources = data["sources"].astype(str)
                if path.stem != name or sources.ndim != 1 or len(sources) != len(features):
                    raise ValueError("Name or sample count does not match stored vectors")
                if len(set(sources.tolist())) != len(sources):
                    raise ValueError("Duplicate photo paths in vector file")
                self.people[name] = (features, sources.tolist())
            except (KeyError, ValueError, OSError, EOFError, BadZipFile) as error:
                raise ValueError(f"Cannot load vector file {path}: {error}") from error
        self._rebuild_index()

    def _rebuild_index(self):
        self.names = []
        matrices = []
        for name, (features, _) in self.people.items():
            self.names.extend([name] * len(features))
            matrices.append(features)
        self.features = np.concatenate(matrices) if matrices else None

    def save(self, name, features, sources):
        name = validate_name(name)
        features = feature_matrix(features)
        sources = [str(Path(path).expanduser().resolve()) for path in sources]
        if len(features) != len(sources) or len(set(sources)) != len(sources):
            raise ValueError("Each vector must have one unique source photo path")
        existing = self.people.get(name)
        samples = dict(zip(existing[1], existing[0])) if existing else {}
        added = sum(source not in samples for source in sources)
        samples.update(zip(sources, features))
        all_sources = list(samples)
        all_features = np.stack(list(samples.values()))
        self.directory.mkdir(parents=True, exist_ok=True)
        target = self.directory / f"{name}.npz"
        temporary = None
        try:
            with NamedTemporaryFile(dir=self.directory, suffix=".tmp", delete=False) as file:
                temporary = Path(file.name)
                np.savez_compressed(
                    file, name=np.array(name), model_id=np.array(MODEL_ID),
                    features=all_features, sources=np.array(all_sources, dtype=str),
                )
            temporary.replace(target)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        self.people[name] = (all_features, all_sources)
        self._rebuild_index()
        return added, len(sources) - added

    def match(self, feature, threshold=0.5):
        if not np.isfinite(threshold) or not -1 <= threshold <= 1:
            raise ValueError("Similarity threshold must be between -1 and 1")
        if self.features is None:
            return Match("Unknown", 0.0)
        vector = unit_vector(feature)
        if vector.size != EMBEDDING_SIZE:
            raise ValueError(f"Expected a {EMBEDDING_SIZE}-dimension face vector")
        scores = self.features @ vector
        index = int(np.argmax(scores))
        score = float(np.clip(scores[index], -1, 1))
        return Match(self.names[index] if score >= threshold else "Unknown", score)
