#!/usr/bin/env bash

# Compile and lint the shipped Rust/Wasm boundary for its real target, then run
# its wasm-bindgen tests with the exact runner paired with the locked ABI tool.

set -euo pipefail

readonly required_runner_version="0.2.127"
script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly script_directory
repository_root="$(cd -- "${script_directory}/.." && pwd)"
readonly repository_root

fail() {
  printf 'check-wasm-tests: %s\n' "$*" >&2
  exit 1
}

resolve_executable() {
  local candidate="$1"
  local resolved

  resolved="$(command -v -- "${candidate}" 2>/dev/null)" || return 1
  [[ -x "${resolved}" ]] || return 1
  printf '%s\n' "${resolved}"
}

readonly cargo_candidate="${CARGO_BIN:-cargo}"
cargo_executable="$(resolve_executable "${cargo_candidate}")" ||
  fail "Cargo was not found; put it on PATH or set CARGO_BIN."
readonly cargo_executable

readonly runner_candidate="${WASM_BINDGEN_TEST_RUNNER_BIN:-wasm-bindgen-test-runner}"
runner_executable="$(resolve_executable "${runner_candidate}")" ||
  fail "wasm-bindgen-test-runner ${required_runner_version} was not found; put it on PATH or set WASM_BINDGEN_TEST_RUNNER_BIN."
readonly runner_executable

node_executable="$(resolve_executable node)" ||
  fail "Node.js must be on PATH because wasm-bindgen-test-runner launches it."
readonly node_executable

runner_version="$("${runner_executable}" --version 2>/dev/null)" ||
  fail "could not read the wasm-bindgen test-runner version."
readonly runner_version
readonly expected_runner_version="wasm-bindgen-test-runner ${required_runner_version}"
[[ "${runner_version}" == "${expected_runner_version}" ]] ||
  fail "expected ${expected_runner_version}, found '${runner_version}'."

printf 'check-wasm-tests: checking the workspace for wasm32-unknown-unknown\n'
(
  cd -- "${repository_root}"
  "${cargo_executable}" check \
    --locked \
    --workspace \
    --all-features \
    --target wasm32-unknown-unknown
)

printf 'check-wasm-tests: linting the Wasm crate and target-specific tests\n'
(
  cd -- "${repository_root}"
  "${cargo_executable}" clippy \
    --locked \
    --package breditor-wasm \
    --all-targets \
    --all-features \
    --target wasm32-unknown-unknown \
    -- \
    -D warnings
)

printf 'check-wasm-tests: running target-specific tests with %s\n' \
  "${expected_runner_version}"
(
  cd -- "${repository_root}"
  CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUNNER="${runner_executable}" \
    "${cargo_executable}" test \
      --locked \
      --package breditor-wasm \
      --all-features \
      --target wasm32-unknown-unknown
)

printf 'check-wasm-tests: Wasm target check, lint, and tests passed.\n'
