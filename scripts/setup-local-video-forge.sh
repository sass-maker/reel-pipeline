#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.reel-pipeline/engines/ltx-2-mlx"
MODEL_DIR="${ROOT_DIR}/.reel-pipeline/models/ltx-2.3-mlx-q4"
RUNTIME_REPOSITORY="https://github.com/dgrauet/ltx-2-mlx.git"
RUNTIME_REVISION="e1838a855bfd1640135c424c96cb27a0c0ad150e"
MODEL_REPOSITORY="dgrauet/ltx-2.3-mlx-q4"
MODEL_REVISION="53a6f5f39d9c074bc73e6a18ba391f40ddffaa68"
EXPECTED_INSTALL_GIB=45
MAX_DISK_PERCENT=85

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "Local Video Forge requires Apple Silicon macOS." >&2
  exit 1
fi

for command_name in git uv ffmpeg curl; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
done

read -r disk_used_kib disk_available_kib < <(df -Pk "${ROOT_DIR}" | awk 'NR==2 { print $3, $4 }')
projected_percent="$(awk -v used="${disk_used_kib}" -v available="${disk_available_kib}" -v install_gib="${EXPECTED_INSTALL_GIB}" 'BEGIN { projected = used + install_gib * 1024 * 1024; printf "%.2f", projected / (used + available) * 100 }')"
if awk -v projected="${projected_percent}" -v limit="${MAX_DISK_PERCENT}" 'BEGIN { exit !(projected >= limit) }'; then
  echo "Refusing Local Video Forge setup: projected disk use ${projected_percent}% reaches the ${MAX_DISK_PERCENT}% limit." >&2
  exit 1
fi

if [[ "${1:-}" == "--check" ]]; then
  git ls-remote "${RUNTIME_REPOSITORY}" HEAD >/dev/null
  curl -fsI "https://huggingface.co/${MODEL_REPOSITORY}/resolve/${MODEL_REVISION}/config.json" >/dev/null
  echo "Local Video Forge install preflight passed."
  echo "Projected disk use: ${projected_percent}% (limit: ${MAX_DISK_PERCENT}%)."
  echo "Pinned runtime and model sources are reachable; no files were installed."
  exit 0
fi

mkdir -p "$(dirname "${RUNTIME_DIR}")" "${MODEL_DIR}"

if [[ ! -d "${RUNTIME_DIR}/.git" ]]; then
  git clone --no-checkout "${RUNTIME_REPOSITORY}" "${RUNTIME_DIR}"
  git -C "${RUNTIME_DIR}" switch --detach "${RUNTIME_REVISION}"
fi

actual_origin="$(git -C "${RUNTIME_DIR}" remote get-url origin)"
actual_revision="$(git -C "${RUNTIME_DIR}" rev-parse HEAD)"
if [[ "${actual_origin}" != "${RUNTIME_REPOSITORY}" || "${actual_revision}" != "${RUNTIME_REVISION}" ]]; then
  echo "Runtime checkout is not at the pinned repository/revision." >&2
  echo "Expected: ${RUNTIME_REPOSITORY} ${RUNTIME_REVISION}" >&2
  echo "Actual:   ${actual_origin} ${actual_revision}" >&2
  exit 1
fi

uv sync --frozen --directory "${RUNTIME_DIR}"

HF_HUB_DISABLE_XET=1 uv run --directory "${RUNTIME_DIR}" --no-sync hf download \
  "${MODEL_REPOSITORY}" \
  --revision "${MODEL_REVISION}" \
  --local-dir "${MODEL_DIR}" \
  audio_vae.safetensors \
  config.json \
  connector.safetensors \
  embedded_config.json \
  quantize_config.json \
  spatial_upscaler_x2_v1_1.safetensors \
  spatial_upscaler_x2_v1_1_config.json \
  split_model.json \
  transformer-dev.safetensors \
  transformer-distilled-1.1.safetensors \
  vae_decoder.safetensors \
  vae_encoder.safetensors \
  vocoder.safetensors

echo "Local Video Forge runtime is ready."
echo "Run: npm run forge:readiness"
