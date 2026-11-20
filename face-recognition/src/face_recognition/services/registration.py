"""Register valid photos and report individual failures in a recursive batch."""

from dataclasses import dataclass, field

import cv2

from ..storage.vector_store import validate_name
from ..utils.images import read_image, registration_groups


@dataclass
class RegistrationReport:
    added: int = 0
    updated: int = 0
    skipped: list = field(default_factory=list)


def register_faces(source, name, pipeline, store):
    groups = registration_groups(source, name)
    # Validate every identity before writing any vectors.
    for person in groups:
        validate_name(person)
    report = RegistrationReport()
    for person, paths in groups.items():
        features, sources = [], []
        for path in paths:
            try:
                faces = pipeline.extract(read_image(path), require_single=True)
                features.append(faces[0].feature)
                sources.append(path)
            except (ValueError, OSError, cv2.error) as error:
                report.skipped.append((path, str(error)))
                print(f"SKIP {path}: {error}")
        if features:
            added, updated = store.save(person, features, sources)
            report.added += added
            report.updated += updated
            print(f"REGISTER {person}: added={added}, updated={updated}")
    print(
        f"Registration: added={report.added}, updated={report.updated}, "
        f"skipped={len(report.skipped)}; vectors={store.directory}"
    )
    return report
