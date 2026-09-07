#!/usr/bin/env bash

# Regenerate Breditor's public WebAssembly TypeScript declaration with the
# exact wasm-bindgen CLI release paired with the Rust dependency, then compare
# it byte-for-byte with the reviewed declaration checked into the repository.

set -euo pipefail

readonly required_wasm_bindgen_version="0.2.127"
readonly required_rolldown_version="rolldown v1.2.7"
script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly script_directory
repository_root="$(cd -- "${script_directory}/.." && pwd)"
readonly repository_root
readonly cargo_target_directory="${repository_root}/target"
readonly wasm_manifest="${repository_root}/crates/breditor-wasm/Cargo.toml"
readonly checked_in_declaration="${repository_root}/crates/breditor-wasm/api/breditor_wasm.d.ts"
readonly generated_glue_test="${repository_root}/crates/breditor-wasm/tests/generated_web_glue.mjs"
readonly browser_projection_module="${repository_root}/packages/breditor-browser/dist/advanced.js"
readonly abi_v3_baseline_check="${repository_root}/scripts/check-wasm-abi-v3-baseline.mjs"

fail() {
  printf 'check-wasm-api: %s\n' "$*" >&2
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
  fail "Cargo was not found; put it on PATH or set CARGO_BIN to its executable."
readonly cargo_executable

readonly wasm_bindgen_candidate="${WASM_BINDGEN_BIN:-wasm-bindgen}"
wasm_bindgen_executable="$(resolve_executable "${wasm_bindgen_candidate}")" ||
  fail "wasm-bindgen ${required_wasm_bindgen_version} was not found; put it on PATH or set WASM_BINDGEN_BIN to its executable."
readonly wasm_bindgen_executable

readonly node_candidate="${NODE_BIN:-node}"
node_executable="$(resolve_executable "${node_candidate}")" ||
  fail "Node.js was not found; put it on PATH or set NODE_BIN to its executable."
readonly node_executable

readonly rolldown_candidate="${ROLLDOWN_BIN:-${repository_root}/node_modules/.bin/rolldown}"
rolldown_executable="$(resolve_executable "${rolldown_candidate}")" ||
  fail "Rolldown 1.2.7 was not found; run 'npm ci' or set ROLLDOWN_BIN to its executable."
readonly rolldown_executable

rolldown_version="$("${rolldown_executable}" --version 2>/dev/null)" ||
  fail "could not read the Rolldown version from ${rolldown_executable}."
readonly rolldown_version
[[ "${rolldown_version}" == "${required_rolldown_version}" ]] ||
  fail "expected ${required_rolldown_version}, found '${rolldown_version}' at ${rolldown_executable}."

wasm_bindgen_version="$("${wasm_bindgen_executable}" --version 2>/dev/null)" ||
  fail "could not read the version from ${wasm_bindgen_executable}."
readonly wasm_bindgen_version
readonly expected_version_output="wasm-bindgen ${required_wasm_bindgen_version}"

[[ "${wasm_bindgen_version}" == "${expected_version_output}" ]] ||
  fail "expected ${expected_version_output}, found '${wasm_bindgen_version}' at ${wasm_bindgen_executable}."

[[ -f "${wasm_manifest}" ]] || fail "missing Wasm crate manifest: ${wasm_manifest}"
[[ -f "${checked_in_declaration}" ]] ||
  fail "missing reviewed TypeScript declaration: ${checked_in_declaration}"
[[ -f "${generated_glue_test}" ]] ||
  fail "missing generated-glue test: ${generated_glue_test}"
[[ -f "${browser_projection_module}" ]] ||
  fail "missing built browser advanced module; run 'npm run build' first."
[[ -f "${abi_v3_baseline_check}" ]] ||
  fail "missing ABI 3 baseline check: ${abi_v3_baseline_check}"

"${node_executable}" "${abi_v3_baseline_check}"

mkdir -p -- "${cargo_target_directory}"
generated_directory="$(mktemp -d "${cargo_target_directory}/wasm-api-check.XXXXXX")" ||
  fail "could not create a temporary generation directory under ${cargo_target_directory}."
readonly generated_directory

cleanup() {
  case "${generated_directory}" in
    "${cargo_target_directory}"/wasm-api-check.*)
      rm -rf -- "${generated_directory}"
      ;;
    *)
      printf 'check-wasm-api: refusing to remove unexpected path: %s\n' "${generated_directory}" >&2
      ;;
  esac
}
trap cleanup EXIT

printf 'check-wasm-api: building breditor-wasm for wasm32-unknown-unknown (wasm-release)\n'
(
  cd -- "${repository_root}"
  CARGO_INCREMENTAL=0 CARGO_TARGET_DIR="${cargo_target_directory}" \
    "${cargo_executable}" build \
    --manifest-path "${repository_root}/Cargo.toml" \
    --locked \
    --package breditor-wasm \
    --profile wasm-release \
    --target wasm32-unknown-unknown
)

readonly compiled_wasm="${cargo_target_directory}/wasm32-unknown-unknown/wasm-release/breditor_wasm.wasm"
[[ -f "${compiled_wasm}" ]] || fail "Cargo did not produce the expected module: ${compiled_wasm}"

printf 'check-wasm-api: generating TypeScript declarations with %s\n' "${expected_version_output}"
"${wasm_bindgen_executable}" "${compiled_wasm}" \
  --target web \
  --typescript \
  --remove-name-section \
  --remove-producers-section \
  --out-dir "${generated_directory}" \
  --out-name breditor_wasm

readonly generated_declaration="${generated_directory}/breditor_wasm.d.ts"
[[ -f "${generated_declaration}" ]] ||
  fail "wasm-bindgen did not produce the expected declaration: ${generated_declaration}"

if ! diff -u -- "${checked_in_declaration}" "${generated_declaration}"; then
  fail "generated TypeScript declarations differ; review the API change and update the checked-in declaration deliberately."
fi

printf 'check-wasm-api: checked-in TypeScript declarations are current.\n'

readonly generated_javascript="${generated_directory}/breditor_wasm.js"
readonly generated_webassembly="${generated_directory}/breditor_wasm_bg.wasm"
readonly generated_module="${generated_directory}/breditor_wasm.mjs"
[[ -f "${generated_javascript}" ]] ||
  fail "wasm-bindgen did not produce the expected JavaScript glue: ${generated_javascript}"
[[ -f "${generated_webassembly}" ]] ||
  fail "wasm-bindgen did not produce the expected transformed module: ${generated_webassembly}"

printf 'check-wasm-api: minifying JavaScript glue with %s\n' "${required_rolldown_version}"
"${rolldown_executable}" "${generated_javascript}" \
  --file "${generated_module}" \
  --format esm \
  --platform browser \
  --minify \
  --postBanner '/* @ts-self-types="./breditor_wasm.d.ts" */' \
  --logLevel silent >/dev/null
[[ -f "${generated_module}" ]] ||
  fail "Rolldown did not produce the expected minified JavaScript glue: ${generated_module}"

printf 'check-wasm-api: exercising generated JavaScript glue with Node.js\n'
"${node_executable}" \
  "${generated_glue_test}" \
  "${generated_module}" \
  "${generated_webassembly}" \
  "${browser_projection_module}"
printf 'check-wasm-api: generated JavaScript glue passed.\n'
