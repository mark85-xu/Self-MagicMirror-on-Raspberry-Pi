#!/bin/sh
# Project-local, reproducible NCNN and application build on Raspberry Pi 5.
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEPS_DIR="$PROJECT_DIR/build/deps"
ARCHIVE="$DEPS_DIR/ncnn-20261020.tar.gz"
mkdir -p "$DEPS_DIR"
if [ ! -f "$ARCHIVE" ]; then
    curl -fL --retry 2 -o "$ARCHIVE" \
        https://codeload.github.com/Tencent/ncnn/tar.gz/refs/tags/20261020
fi
printf '%s  %s\n' \
    968d8d8e65ccadc803322f8238736176e0f9c929fcf484895f58a63e6b227127 \
    "$ARCHIVE" | sha256sum -c -
if [ ! -d "$DEPS_DIR/ncnn-20261020" ]; then
    tar -xzf "$ARCHIVE" -C "$DEPS_DIR"
fi
cmake -S "$DEPS_DIR/ncnn-20261020" -B "$DEPS_DIR/ncnn-build" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$DEPS_DIR/ncnn-install" \
    -DNCNN_VULKAN=OFF -DNCNN_INT8=OFF -DNCNN_BF16=OFF \
    -DNCNN_BUILD_TOOLS=OFF -DNCNN_BUILD_EXAMPLES=OFF \
    -DNCNN_BUILD_BENCHMARK=OFF -DNCNN_BUILD_TESTS=OFF \
    -DNCNN_ARM82=ON -DNCNN_ARM82DOT=ON -DNCNN_ARM82FP16FML=OFF \
    -DNCNN_ARM84BF16=OFF -DNCNN_ARM84I8MM=OFF -DNCNN_ARM86SVE=OFF
cmake --build "$DEPS_DIR/ncnn-build" --parallel "${CPP_BUILD_JOBS:-2}"
cmake --install "$DEPS_DIR/ncnn-build"
if [ "${1:-}" = "--deps-only" ]; then exit 0; fi
cmake -S "$PROJECT_DIR/src/cpp" -B "$PROJECT_DIR/build/cpp" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$DEPS_DIR/ncnn-install"
cmake --build "$PROJECT_DIR/build/cpp" --parallel "${CPP_BUILD_JOBS:-2}"
