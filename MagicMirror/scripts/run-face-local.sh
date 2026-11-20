#!/bin/sh
set -eu
MIRROR_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$MIRROR_ROOT"
node scripts/prepare-face-local.js
export MM_CONFIG_FILE="$MIRROR_ROOT/config/config.face-local.generated.js"
exec node serveronly
