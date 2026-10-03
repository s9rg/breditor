#!/usr/bin/env bash
# Local-only diagnostic/candidate artifact. Never writes packages/breditor-wasm/dist.
set -euo pipefail
task_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
task_variant="selection-input-diagnostic"
task_features="diagnostic-selection-inputs"
if [[ "${1:-}" == "--rust-tokens" ]]; then
  task_variant="selection-rust-token-candidate"
  task_features+=",candidate-rust-selection-tokens"
  shift
fi
if [[ "${1:-}" == "--format-count" ]]; then
  task_variant+="-count"
  task_features+=",diagnostic-projection-format-count"
  shift
fi
if [[ "${1:-}" == "--without-input-observer" ]]; then
  task_variant+="-unobserved"
  task_features="${task_features#diagnostic-selection-inputs}"
  task_features="${task_features#,}"
  shift
fi
if [[ "$#" != 0 ]]; then
  printf 'usage: bash scripts/build-selection-input-diagnostic.sh [--rust-tokens] [--format-count] [--without-input-observer]\n' >&2
  exit 1
fi
task_output="${task_root}/target/${task_variant}/pkg"
[[ "$(wasm-bindgen --version)" == "wasm-bindgen 0.2.127" ]]
mkdir -p -- "${task_output}"
CARGO_TARGET_DIR="${task_root}/target/selection-input-diagnostic/cargo" \
  cargo build --manifest-path "${task_root}/Cargo.toml" --locked --package breditor-wasm \
  --profile wasm-release --target wasm32-unknown-unknown --features "${task_features}"
wasm-bindgen "${task_root}/target/selection-input-diagnostic/cargo/wasm32-unknown-unknown/wasm-release/breditor_wasm.wasm" \
  --target web --typescript --remove-name-section --remove-producers-section \
  --out-dir "${task_output}" --out-name breditor_wasm
"${task_root}/node_modules/.bin/rolldown" "${task_output}/breditor_wasm.js" \
  --file "${task_output}/breditor_wasm.min.js" --format esm --platform browser --minify \
  --postBanner '/* @ts-self-types="./breditor_wasm.d.ts" */' --logLevel silent
mv -- "${task_output}/breditor_wasm.min.js" "${task_output}/breditor_wasm.js"
