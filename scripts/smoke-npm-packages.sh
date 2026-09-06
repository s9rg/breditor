#!/usr/bin/env bash

# Prove that the npm tarballs work without workspace links or repository-only
# module paths. The temporary consumer is deliberately outside the repository,
# so normal Node/Vite ancestor lookup cannot see the workspace node_modules.

set -euo pipefail

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly script_directory
repository_root="$(cd -- "${script_directory}/.." && pwd)"
readonly repository_root
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

readonly vite_executable="${repository_root}/node_modules/.bin/vite"
[[ -x "${vite_executable}" ]] || fail "missing workspace Vite; run 'npm ci' first."

smoke_directory="$(mktemp -d "/tmp/breditor-npm-package-smoke.XXXXXX")" ||
  fail "could not create an external temporary consumer."
readonly smoke_directory

cleanup() {
  case "${smoke_directory}" in
    /tmp/breditor-npm-package-smoke.*)
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

printf 'smoke-npm-packages: building and checking workspace package artifacts\n'
(
  cd -- "${repository_root}"
  "${npm_executable}" run build --workspace @breditor/browser
  "${npm_executable}" run check --workspace @breditor/wasm
)

printf 'smoke-npm-packages: packing explicitly verified artifacts with lifecycle hooks disabled\n'
(
  cd -- "${repository_root}"
  "${npm_executable}" pack \
    --ignore-scripts \
    --workspace @breditor/browser \
    --pack-destination "${tarball_directory}" >/dev/null
  "${npm_executable}" pack \
    --ignore-scripts \
    --workspace @breditor/wasm \
    --pack-destination "${tarball_directory}" >/dev/null
)

readonly browser_tarball="${tarball_directory}/breditor-browser-0.1.0.tgz"
readonly wasm_tarball="${tarball_directory}/breditor-wasm-0.1.0.tgz"
[[ -f "${browser_tarball}" ]] || fail "missing @breditor/browser tarball"
[[ -f "${wasm_tarball}" ]] || fail "missing @breditor/wasm tarball"

assert_archive_size() {
  local label="$1"
  local archive="$2"
  local maximum="$3"
  local actual
  actual="$(wc -c < "${archive}")"
  actual="${actual//[[:space:]]/}"
  [[ "${actual}" =~ ^[0-9]+$ ]] || fail "could not measure ${label} tarball"
  (( actual <= maximum )) ||
    fail "${label} tarball is ${actual} bytes; budget is ${maximum}"
  printf 'smoke-npm-packages: %s tarball size %s / %s bytes\n' \
    "${label}" "${actual}" "${maximum}"
}

assert_archive_size "@breditor/browser" "${browser_tarball}" 225000
assert_archive_size "@breditor/wasm" "${wasm_tarball}" 450000

for archive in "${browser_tarball}" "${wasm_tarball}"; do
  tar -tzf "${archive}" package/LICENSE-MIT >/dev/null ||
    fail "${archive} does not contain LICENSE-MIT"
  tar -tzf "${archive}" package/LICENSE-APACHE >/dev/null ||
    fail "${archive} does not contain LICENSE-APACHE"
done
if tar -tzf "${browser_tarball}" | grep -E '\.d\.ts\.map$' >/dev/null; then
  fail "the browser tarball contains declaration maps whose sources are not shipped"
fi
tar -tzf "${wasm_tarball}" package/dist/breditor_wasm_bg.wasm >/dev/null ||
  fail "the Wasm tarball does not contain its module"

readonly wasm_package_allowlist="${script_directory}/fixtures/wasm-package-files.txt"
[[ -f "${wasm_package_allowlist}" ]] ||
  fail "missing Wasm package file allowlist"
readonly wasm_package_listing="${smoke_directory}/wasm-package-files.txt"
tar -tzf "${wasm_tarball}" | LC_ALL=C sort > "${wasm_package_listing}"
if ! diff -u -- "${wasm_package_allowlist}" "${wasm_package_listing}"; then
  fail "the Wasm tarball file set differs from the reviewed allowlist"
fi

assert_archive_member_sha256() {
  local archive="$1"
  local member="$2"
  local expected="$3"
  local actual
  actual="$(tar -xOzf "${archive}" "${member}" | shasum -a 256 | awk '{print $1}')" ||
    fail "could not read ${member} from ${archive}"
  [[ "${actual}" == "${expected}" ]] ||
    fail "${member} has digest ${actual}; expected ${expected}"
}

assert_archive_member_sha256 "${wasm_tarball}" \
  package/THIRD_PARTY_NOTICES.md \
  c9a244517db5e3b31fc1ebe436f4e4506045e408497f9d7b6626562a26fcd8b5
assert_archive_member_sha256 "${wasm_tarball}" \
  package/third-party/memchr-2.8.3/UNLICENSE \
  7e12e5df4bae12cb21581ba157ced20e1986a0508dd10d0e8a4ab9a4cf94e85c
assert_archive_member_sha256 "${wasm_tarball}" \
  package/third-party/unicode-ident-1.0.24/LICENSE-APACHE \
  62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a
assert_archive_member_sha256 "${wasm_tarball}" \
  package/third-party/unicode-ident-1.0.24/LICENSE-UNICODE \
  f7db81051789b729fea528a63ec4c938fdcb93d9d61d97dc8cc2e9df6d47f2a1
assert_archive_member_sha256 "${wasm_tarball}" \
  package/third-party/unicode-segmentation-1.13.3/COPYRIGHT \
  23860c2a7b5d96b21569afedf033469bab9fe14a1b24a35068b8641c578ce24d
assert_archive_member_sha256 "${wasm_tarball}" \
  package/third-party/zmij-1.0.23/LICENSE-MIT \
  23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3
assert_archive_member_sha256 "${wasm_tarball}" \
  package/dist/third-party/rust-1.98.0/COPYRIGHT-library.html \
  68129500b616d5838629e68f55ff3aed5e096dacf60ce9eb41bbe599a563afa6

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
  "${vite_executable}" build "${consumer_directory}" \
    --outDir "${consumer_directory}/bundle" \
    --emptyOutDir >/dev/null
  [[ -f "${consumer_directory}/bundle/index.html" ]] ||
    fail "the isolated consumer bundle has no entry HTML"
  find "${consumer_directory}/bundle" -type f -name '*.wasm' -print -quit |
    grep -q . || fail "the isolated consumer bundle has no Wasm asset"
  "${node_executable}" \
    "${script_directory}/check-consumer-browser.mjs" \
    "${consumer_directory}/bundle"
)

printf 'smoke-npm-packages: isolated import, typecheck, bundle, and real-browser initialization passed.\n'
