#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly script_directory
repository_root="$(cd -- "${script_directory}/.." && pwd)"
readonly repository_root

fail() {
  printf 'check-wasm-package: %s\n' "$*" >&2
  exit 1
}

configured_target_root="${CARGO_TARGET_DIR:-${repository_root}/target}"
case "${configured_target_root}" in
  /*)
    target_root="${configured_target_root}"
    ;;
  *)
    target_root="${repository_root}/${configured_target_root}"
    ;;
esac
readonly target_root

mkdir -p -- "${target_root}"
reproducibility_directory="$(mktemp -d "${target_root}/wasm-package-repro.XXXXXX")" ||
  fail "could not create an isolated build directory under ${target_root}."
readonly first_target_directory="${reproducibility_directory}/first"
readonly second_target_directory="${reproducibility_directory}/second"
readonly alias_directory="${reproducibility_directory}/aliases"

cleanup() {
  if [[ -z "${reproducibility_directory}" ]]; then
    return
  fi
  case "${reproducibility_directory}" in
    "${target_root}"/wasm-package-repro.*)
      rm -rf -- "${reproducibility_directory}"
      ;;
    *)
      printf 'check-wasm-package: refusing to remove unexpected path: %s\n' \
        "${reproducibility_directory}" >&2
      ;;
  esac
}
trap cleanup EXIT

printf 'check-wasm-package: building first isolated package snapshot\n'
CARGO_TARGET_DIR="${first_target_directory}" \
  "${script_directory}/build-wasm-package.sh"

readonly node_candidate="${NODE_BIN:-node}"
node_executable="$(command -v -- "${node_candidate}" 2>/dev/null)" || {
  printf 'check-wasm-package: Node.js was not found; put it on PATH or set NODE_BIN.\n' >&2
  exit 1
}
readonly node_executable

first_snapshot="$(
  "${node_executable}" \
    "${script_directory}/hash-wasm-package.mjs" \
    "${repository_root}/packages/breditor-wasm/dist"
)"
readonly first_snapshot

if [[ -n "${CARGO_HOME:-}" ]]; then
  configured_cargo_home="${CARGO_HOME}"
elif [[ -n "${HOME:-}" ]]; then
  configured_cargo_home="${HOME}/.cargo"
else
  fail "CARGO_HOME and HOME are both unset; the Cargo source root cannot be aliased."
fi
case "${configured_cargo_home}" in
  /*)
    cargo_home_candidate="${configured_cargo_home}"
    ;;
  *)
    cargo_home_candidate="${repository_root}/${configured_cargo_home}"
    ;;
esac
mkdir -p -- "${cargo_home_candidate}" "${second_target_directory}" "${alias_directory}"
cargo_home_directory="$(cd -L -- "${cargo_home_candidate}" && pwd -L)" ||
  fail "Cargo home could not be resolved for the aliased package build."
readonly cargo_home_directory
ln -s -- "${repository_root}" "${alias_directory}/repository"
ln -s -- "${cargo_home_directory}" "${alias_directory}/cargo-home"
ln -s -- "${second_target_directory}" "${alias_directory}/target"

printf 'check-wasm-package: building second snapshot through path aliases\n'
CARGO_HOME="${alias_directory}/cargo-home" \
CARGO_TARGET_DIR="${alias_directory}/target" \
  "${alias_directory}/repository/scripts/build-wasm-package.sh"

second_snapshot="$(
  "${node_executable}" \
    "${script_directory}/hash-wasm-package.mjs" \
    "${repository_root}/packages/breditor-wasm/dist"
)"
readonly second_snapshot
[[ "${first_snapshot}" == "${second_snapshot}" ]] || {
  printf 'check-wasm-package: direct and path-aliased builds produced different package bytes.\n' >&2
  diff -u -- <(printf '%s\n' "${first_snapshot}") <(printf '%s\n' "${second_snapshot}") || true
  exit 1
}

"${node_executable}" \
  "${script_directory}/check-built-wasm-package.mjs" \
  "${repository_root}/packages/breditor-wasm"

printf 'check-wasm-package: generated package passed direct/path-aliased reproducibility, declaration, and runtime checks.\n'
