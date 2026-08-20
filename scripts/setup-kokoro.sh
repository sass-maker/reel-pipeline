#!/usr/bin/env bash
# One-time local Kokoro TTS setup: venv + kokoro-onnx + model download.
# Idempotent — safe to re-run; skips anything already in place.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KOKORO_DIR="$ROOT/tools/kokoro"
VENV="$KOKORO_DIR/.venv"
MODEL="$KOKORO_DIR/kokoro-v1.0.onnx"
VOICES="$KOKORO_DIR/voices-v1.0.bin"
RELEASE_BASE="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"

mkdir -p "$KOKORO_DIR"

if [ ! -x "$VENV/bin/python" ]; then
  echo "[kokoro] creating venv at $VENV"
  if ! command -v uv >/dev/null 2>&1; then
    echo "[kokoro] uv is required to create the pinned Python 3.12 environment" >&2
    exit 1
  fi
  uv venv --python 3.12 --seed "$VENV"
fi

echo "[kokoro] installing kokoro-onnx + soundfile"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet "kokoro-onnx>=0.4,<0.5" "soundfile>=0.12"

download() {
  local url="$1" dest="$2"
  if [ -s "$dest" ]; then
    echo "[kokoro] $(basename "$dest") already present"
  else
    echo "[kokoro] downloading $(basename "$dest") …"
    curl -fL --retry 3 -C - -o "$dest.part" "$url"
    mv "$dest.part" "$dest"
  fi
}

download "$RELEASE_BASE/kokoro-v1.0.onnx" "$MODEL"
download "$RELEASE_BASE/voices-v1.0.bin" "$VOICES"

echo "[kokoro] smoke synth"
echo '{"scenes":[{"text":"Kokoro is ready.","outPath":"'"$KOKORO_DIR"'/setup-smoke.wav"}],"voice":"af_heart"}' \
  | "$VENV/bin/python" "$ROOT/scripts/kokoro_tts.py"
ls -lh "$KOKORO_DIR/setup-smoke.wav"
echo "[kokoro] setup complete"
