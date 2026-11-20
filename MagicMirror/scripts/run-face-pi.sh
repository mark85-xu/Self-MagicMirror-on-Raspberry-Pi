#!/bin/sh
# Start the Pi desktop mirror with CSI face recognition from a desktop or SSH terminal.
set -eu
MIRROR_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$MIRROR_ROOT"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if [ -z "${WAYLAND_DISPLAY:-}" ]; then
    for display_socket in wayland-0 wayland-1; do
        if [ -S "$XDG_RUNTIME_DIR/$display_socket" ]; then
            export WAYLAND_DISPLAY="$display_socket"
            break
        fi
    done
fi
if [ -n "${WAYLAND_DISPLAY:-}" ]; then
    exec /usr/bin/node --run start:wayland
fi
exec /usr/bin/node --run start:x11
