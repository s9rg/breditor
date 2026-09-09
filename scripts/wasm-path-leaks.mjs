import { readFile, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const hostPathPatterns = Object.freeze([
  Object.freeze({
    label: "macOS user-home path",
    expression: /\/Users\/[^/\0]+\//,
  }),
  Object.freeze({
    label: "Linux user-home path",
    expression: /\/home\/[^/\0]+\//,
  }),
  Object.freeze({
    label: "Unix root-home path",
    expression: /\/root\//,
  }),
  Object.freeze({
    label: "Windows user-home path",
    expression: /[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+/,
  }),
]);

/**
 * Rejects exact build-root prefixes supplied by the caller and common user-home
 * path patterns in one generated Wasm module. Stable remapped paths such as
 * `cargo/registry/...` and compiler-owned `/rustc/<toolchain-hash>/...` remain
 * useful panic locations and are intentionally permitted.
 */
export function assertNoWasmHostPathLeaks(wasmBytes, forbiddenPrefixes = []) {
  if (!Buffer.isBuffer(wasmBytes)) {
    throw new TypeError("generated Wasm must be supplied as a Buffer");
  }

  for (const prefix of forbiddenPrefixes) {
    if (typeof prefix !== "string" || prefix.length < 2) {
      throw new TypeError("forbidden Wasm path prefixes must be nonempty strings");
    }
    if (wasmBytes.includes(Buffer.from(prefix))) {
      throw new Error("generated Wasm contains an absolute build-root path");
    }
  }

  const searchableBytes = wasmBytes.toString("latin1");
  for (const { label, expression } of hostPathPatterns) {
    if (expression.test(searchableBytes)) {
      throw new Error(`generated Wasm contains a ${label}`);
    }
  }
}

async function main() {
  const [wasmPath, ...forbiddenPrefixes] = process.argv.slice(2);
  if (wasmPath === undefined) {
    throw new Error(
      "usage: wasm-path-leaks.mjs <wasm-path> [forbidden-prefix ...]",
    );
  }
  const wasmBytes = await readFile(resolve(wasmPath));
  assertNoWasmHostPathLeaks(wasmBytes, forbiddenPrefixes);
  console.log(
    "wasm-path-leaks: generated Wasm contains no forbidden build-root prefixes or common user-home paths.",
  );
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  (await realpath(resolve(invokedPath))) ===
    (await realpath(fileURLToPath(import.meta.url)))
) {
  await main();
}
