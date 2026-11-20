"""Configure the current process's OpenCV Qt window backend."""

import os
import sys
from pathlib import Path


def configure_display():
    # Call after importing cv2, which may overwrite QT_QPA_FONTDIR.
    if os.environ.get("DISPLAY"):
        os.environ.setdefault("QT_QPA_PLATFORM", "xcb")
    fonts = Path("/usr/share/fonts/truetype/dejavu")
    if fonts.is_dir() and not Path(os.environ.get("QT_QPA_FONTDIR", "")).is_dir():
        os.environ["QT_QPA_FONTDIR"] = str(fonts)


def require_display():
    if sys.platform.startswith("linux") and not os.environ.get("DISPLAY"):
        raise ValueError("DISPLAY is not set; run on the desktop or use --no-show")
