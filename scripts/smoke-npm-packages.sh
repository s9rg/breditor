#!/usr/bin/env bash

# Prove that the npm tarballs work without workspace links or repository-only
# module paths. The temporary consumer is created under ignored target/ and is
# always removed through a path-checked trap.

set -euo pipefail

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly script_directory
repository_root="$(cd -- "${script_directory}/.." && pwd)"
readonly repository_root
readonly target_directory="${repository_root}/target"

fail() {
  printf 'smoke-npm-packages: %s\n' "$*" >&2
  exit 1
}

readonly npm_candidate="${NPM_BIN:-npm}"
npm_executable="$(command -v -- "${npm_candidate}" 2>/dev/null)" ||
  fail "npm was not found; put it on PATH or set NPM_BIN to its executable."
readonly npm_executable

readonly node_candidate="${NODE_BIN:-node}"
node_executable="$(command -v -- "${node_candidate}" 2>/dev/null)" ||
  fail "Node.js was not found; put it on PATH or set NODE_BIN to its executable."
readonly node_executable

readonly tsc_executable="${repository_root}/node_modules/.bin/tsc"
[[ -x "${tsc_executable}" ]] || fail "missing workspace TypeScript; run 'npm ci' first."

mkdir -p -- "${target_directory}"
smoke_directory="$(mktemp -d "${target_directory}/npm-package-smoke.XXXXXX")" ||
  fail "could not create a temporary consumer under ${target_directory}."
readonly smoke_directory

cleanup() {
  case "${smoke_directory}" in
    "${target_directory}"/npm-package-smoke.*)
      rm -rf -- "${smoke_directory}"
      ;;
    *)
      printf 'smoke-npm-packages: refusing to remove unexpected path: %s\n' "${smoke_directory}" >&2
      ;;
  esac
}
trap cleanup EXIT

readonly tarball_directory="${smoke_directory}/tarballs"
readonly consumer_directory="${smoke_directory}/consumer"
mkdir -p -- "${tarball_directory}" "${consumer_directory}"
cp -R -- "${script_directory}/fixtures/npm-consumer/." "${consumer_directory}/"

printf 'smoke-npm-packages: packing workspace tarballs through their prepack gates\n'
(
  cd -- "${repository_root}"
  "${npm_executable}" pack \
    --workspace @breditor/browser \
    --pack-destination "${tarball_directory}" >/dev/null
  "${npm_executable}" pack \
    --workspace @breditor/wasm \
    --pack-destination "${tarball_directory}" >/dev/null
)

readonly browser_tarball="${tarball_directory}/breditor-browser-0.0.58.tgz"
readonly wasm_tarball="${tarball_directory}/breditor-wasm-0.0.58.tgz"
[[ -f "${browser_tarball}" ]] || fail "missing @breditor/browser tarball"
[[ -f "${wasm_tarball}" ]] || fail "missing @breditor/wasm tarball"

for archive in "${browser_tarball}" "${wasm_tarball}"; do
  tar -tzf "${archive}" package/LICENSE-MIT >/dev/null ||
    fail "${archive} does not contain LICENSE-MIT"
  tar -tzf "${archive}" package/LICENSE-APACHE >/dev/null ||
    fail "${archive} does not contain LICENSE-APACHE"
done
if tar -tzf "${browser_tarball}" | grep -Eq '\.d\.ts\.map$'; then
  fail "the browser tarball contains declaration maps whose sources are not shipped"
fi
tar -tzf "${wasm_tarball}" package/dist/breditor_wasm_bg.wasm >/dev/null ||
  fail "the Wasm tarball does not contain its module"

printf 'smoke-npm-packages: installing into an isolated consumer\n'
(
  cd -- "${consumer_directory}"
  "${npm_executable}" install \
    --no-audit \
    --no-fund \
    "${browser_tarball}" \
    "${wasm_tarball}" >/dev/null
  "${node_executable}" smoke.mjs
  "${tsc_executable}" --project tsconfig.json
)

printf 'smoke-npm-packages: isolated import, Wasm initialization, and typecheck passed.\n'
