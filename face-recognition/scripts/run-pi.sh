#!/bin/sh
# Use the project's system-Python venv even when Conda (base) is active.
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec "$PROJECT_DIR/.venv/bin/python" "$PROJECT_DIR/src/recognize.py" \
    --source picamera2 --device cpu --opencv-threads 4 \
    --detector "$PROJECT_DIR/models/yolo26n-face_ncnn_model" "$@"
