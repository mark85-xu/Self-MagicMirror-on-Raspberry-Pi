#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${VOICE_ROOT:-/home/lhx/Desktop/MagicMirror2/voice}"
MODELS_DIR="$ROOT_DIR/models"
WHISPER_DIR="$ROOT_DIR/whisper.cpp"
PIPER_VENV="$ROOT_DIR/piper-venv"

WHISPER_MODEL_NAME="${WHISPER_MODEL_NAME:-ggml-tiny.bin}"
WHISPER_MODEL_URL="${WHISPER_MODEL_URL:-https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/$WHISPER_MODEL_NAME}"
PIPER_MODEL_NAME="${PIPER_MODEL_NAME:-zh_CN-huayan-medium.onnx}"
PIPER_CONFIG_NAME="${PIPER_CONFIG_NAME:-zh_CN-huayan-medium.onnx.json}"
PIPER_MODEL_URL="${PIPER_MODEL_URL:-https://hf-mirror.com/csukuangfj/vits-piper-zh_CN-huayan-medium/resolve/main/$PIPER_MODEL_NAME}"
PIPER_CONFIG_URL="${PIPER_CONFIG_URL:-https://hf-mirror.com/csukuangfj/vits-piper-zh_CN-huayan-medium/resolve/main/$PIPER_CONFIG_NAME}"

download() {
  local url="$1"
  local output="$2"
  if [ -f "$output" ]; then
    echo "[skip] $output already exists"
    return
  fi
  echo "[download] $url"
  if command -v curl >/dev/null 2>&1; then
    curl -L --fail --retry 2 --connect-timeout 20 -o "$output" "$url"
  else
    wget -O "$output" "$url"
  fi
}

need_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[missing] $cmd"
    return 1
  fi
}

echo "[voice] installing local voice components into $ROOT_DIR"
mkdir -p "$MODELS_DIR"

missing_packages=()
for cmd in git make gcc g++ python3 arecord aplay; do
  if ! need_cmd "$cmd"; then
    missing_packages+=("$cmd")
  fi
done

if ! command -v cmake >/dev/null 2>&1; then
  missing_packages+=("cmake")
fi

if [ "${#missing_packages[@]}" -gt 0 ]; then
  echo "[apt] installing required packages: ${missing_packages[*]}"
  sudo apt-get update
  sudo apt-get install -y git make gcc g++ cmake python3 python3-venv alsa-utils curl unzip
fi

if [ ! -d "$WHISPER_DIR/.git" ]; then
  rm -rf "$WHISPER_DIR"
  for attempt in 1 2 3; do
    echo "[git] cloning whisper.cpp, attempt $attempt"
    if git -c http.version=HTTP/1.1 clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"; then
      break
    fi
    rm -rf "$WHISPER_DIR"
    sleep $((attempt * 3))
  done
fi

if [ ! -d "$WHISPER_DIR/.git" ]; then
  echo "[fallback] downloading whisper.cpp source zip"
  tmp_zip="$ROOT_DIR/whisper.cpp.zip"
  download "https://codeload.github.com/ggerganov/whisper.cpp/zip/refs/heads/master" "$tmp_zip"
  rm -rf "$ROOT_DIR/whisper.cpp-master" "$WHISPER_DIR"
  unzip -q "$tmp_zip" -d "$ROOT_DIR"
  mv "$ROOT_DIR/whisper.cpp-master" "$WHISPER_DIR"
fi

echo "[build] whisper.cpp"
cmake -S "$WHISPER_DIR" -B "$WHISPER_DIR/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$WHISPER_DIR/build" --config Release -j "$(nproc)"

download "$WHISPER_MODEL_URL" "$MODELS_DIR/$WHISPER_MODEL_NAME"

echo "[python] piper virtualenv"
if [ ! -x "$PIPER_VENV/bin/piper" ]; then
  python3 -m venv "$PIPER_VENV"
  "$PIPER_VENV/bin/python" -m pip install --upgrade pip
  "$PIPER_VENV/bin/pip" install piper-tts
fi

download "$PIPER_MODEL_URL" "$MODELS_DIR/$PIPER_MODEL_NAME"
download "$PIPER_CONFIG_URL" "$MODELS_DIR/$PIPER_CONFIG_NAME"

echo
echo "[done] Voice components are ready."
echo "whisperBinary: $WHISPER_DIR/build/bin/whisper-cli"
echo "whisperModel:  $MODELS_DIR/$WHISPER_MODEL_NAME"
echo "piperBinary:   $PIPER_VENV/bin/piper"
echo "piperModel:    $MODELS_DIR/$PIPER_MODEL_NAME"
echo "piperConfig:   $MODELS_DIR/$PIPER_CONFIG_NAME"
