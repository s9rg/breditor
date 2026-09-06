#!/usr/bin/env bash

# Build the public @breditor/wasm package from the locked Rust workspace with
# the exact wasm-bindgen CLI paired with the crate dependency. Generation takes
# place off to the side so a failed build cannot leave a partial package.

set -euo pipefail

readonly required_wasm_bindgen_version="0.2.127"
script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly script_directory
repository_root="$(cd -- "${script_directory}/.." && pwd)"
readonly repository_root
readonly package_directory="${repository_root}/packages/breditor-wasm"
readonly output_directory="${package_directory}/dist"
configured_cargo_target_directory="${CARGO_TARGET_DIR:-${repository_root}/target}"
case "${configured_cargo_target_directory}" in
  /*)
    cargo_target_directory="${configured_cargo_target_directory}"
    ;;
  *)
    # Cargo resolves a relative CARGO_TARGET_DIR from the working directory. The
    # build below runs at the repository root, so mirror that resolution for the
    # paths this script inspects after Cargo exits.
    cargo_target_directory="${repository_root}/${configured_cargo_target_directory}"
    ;;
esac
readonly cargo_target_directory
readonly wasm_manifest="${repository_root}/crates/breditor-wasm/Cargo.toml"
readonly reviewed_declaration="${repository_root}/crates/breditor-wasm/api/breditor_wasm.d.ts"
readonly third_party_checker="${repository_root}/scripts/check-wasm-third-party-notices.mjs"
readonly publication_lock_root="${repository_root}/target"
readonly publication_lock_directory="${publication_lock_root}/breditor-wasm-dist.lock"
generated_directory=""
publication_lock_acquired=0

fail() {
  printf 'build-wasm-package: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${generated_directory}" ]]; then
    case "${generated_directory}" in
      "${cargo_target_directory}"/wasm-package.*)
        rm -rf -- "${generated_directory}"
        ;;
      *)
        printf 'build-wasm-package: refusing to remove unexpected path: %s\n' "${generated_directory}" >&2
        ;;
    esac
  fi

  if (( publication_lock_acquired == 1 )); then
    rmdir -- "${publication_lock_directory}" 2>/dev/null ||
      printf 'build-wasm-package: could not release publication lock: %s\n' \
        "${publication_lock_directory}" >&2
  fi
}
trap cleanup EXIT

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

wasm_bindgen_version="$("${wasm_bindgen_executable}" --version 2>/dev/null)" ||
  fail "could not read the wasm-bindgen version from ${wasm_bindgen_executable}."
readonly wasm_bindgen_version
readonly expected_version_output="wasm-bindgen ${required_wasm_bindgen_version}"
[[ "${wasm_bindgen_version}" == "${expected_version_output}" ]] ||
  fail "expected ${expected_version_output}, found '${wasm_bindgen_version}' at ${wasm_bindgen_executable}."

[[ -f "${wasm_manifest}" ]] || fail "missing Wasm crate manifest: ${wasm_manifest}"
[[ -f "${reviewed_declaration}" ]] ||
  fail "missing reviewed TypeScript declaration: ${reviewed_declaration}"
[[ -f "${third_party_checker}" ]] ||
  fail "missing third-party dependency checker: ${third_party_checker}"
[[ -f "${repository_root}/LICENSE-MIT" ]] || fail "missing repository MIT license"
[[ -f "${repository_root}/LICENSE-APACHE" ]] || fail "missing repository Apache license"
(
  cd -- "${package_directory}"
  "${node_executable}" ../../scripts/check-package-licenses.mjs
)

mkdir -p -- "${publication_lock_root}"
if ! mkdir -- "${publication_lock_directory}" 2>/dev/null; then
  fail "another Wasm package build holds ${publication_lock_directory}; wait for it to finish, or remove that directory only after confirming no build is running."
fi
publication_lock_acquired=1

mkdir -p -- "${cargo_target_directory}"
generated_directory="$(mktemp -d "${cargo_target_directory}/wasm-package.XXXXXX")" ||
  fail "could not create a temporary generation directory under ${cargo_target_directory}."

printf 'build-wasm-package: checking locked dependency graph and third-party notices\n'
CARGO_BIN="${cargo_executable}" \
  "${node_executable}" "${third_party_checker}" \
  --copy-rust-notice \
  "${generated_directory}/third-party/rust-1.98.0/COPYRIGHT-library.html"

printf 'build-wasm-package: building breditor-wasm for wasm32-unknown-unknown (release)\n'
(
  cd -- "${repository_root}"
  CARGO_INCREMENTAL=0 \
  CARGO_TARGET_DIR="${cargo_target_directory}" \
  SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}" \
    "${cargo_executable}" build \
    --manifest-path "${repository_root}/Cargo.toml" \
    --locked \
    --package breditor-wasm \
    --release \
    --target wasm32-unknown-unknown
)

readonly compiled_wasm="${cargo_target_directory}/wasm32-unknown-unknown/release/breditor_wasm.wasm"
[[ -f "${compiled_wasm}" ]] ||
  fail "Cargo did not produce the expected module: ${compiled_wasm}"

printf 'build-wasm-package: generating package with %s\n' "${expected_version_output}"
"${wasm_bindgen_executable}" "${compiled_wasm}" \
  --target web \
  --typescript \
  --out-dir "${generated_directory}" \
  --out-name breditor_wasm

for generated_name in \
  breditor_wasm.d.ts \
  breditor_wasm.js \
  breditor_wasm_bg.wasm \
  breditor_wasm_bg.wasm.d.ts
do
  [[ -f "${generated_directory}/${generated_name}" ]] ||
    fail "wasm-bindgen did not produce ${generated_name}"
done

generated_file_count="$(find "${generated_directory}" -mindepth 1 -maxdepth 1 -type f | wc -l | tr -d '[:space:]')"
readonly generated_file_count
[[ "${generated_file_count}" == "4" ]] ||
  fail "expected exactly four generated package files, found ${generated_file_count}"

generated_recursive_file_count="$(find "${generated_directory}" -type f | wc -l | tr -d '[:space:]')"
readonly generated_recursive_file_count
[[ "${generated_recursive_file_count}" == "5" ]] ||
  fail "expected four generated artifacts and one Rust notice, found ${generated_recursive_file_count} files"

if ! diff -u -- "${reviewed_declaration}" "${generated_directory}/breditor_wasm.d.ts"; then
  fail "generated declarations differ from the reviewed Rust ABI declaration"
fi

(
  cd -- "${package_directory}"
  "${node_executable}" ../../scripts/clean-package.mjs
)
mv -- "${generated_directory}" "${output_directory}"
generated_directory=""

printf 'build-wasm-package: wrote a complete reviewed package to %s\n' "${output_directory}"
