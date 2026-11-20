#!/bin/sh
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec "$PROJECT_DIR/build/cpp/face_recognizer" --root "$PROJECT_DIR" "$@"
