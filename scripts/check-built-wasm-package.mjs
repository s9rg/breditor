import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { assertNoWasmHostPathLeaks } from "./wasm-path-leaks.mjs";

const packageArgument = process.argv[2];
if (packageArgument === undefined) {
  throw new Error("usage: check-built-wasm-package.mjs <package-directory>");
}

const packageDirectory = resolve(packageArgument);
const packageJson = JSON.parse(
  await readFile(join(packageDirectory, "package.json"), "utf8"),
);

assert.doesNotThrow(() =>
  assertNoWasmHostPathLeaks(
    Buffer.from(
      "cargo/registry/src/example.rs\0/rustc/toolchain/library/core/src/example.rs",
    ),
  ),
);
for (const leakedPath of [
  "/Users/example/.cargo/registry/src/example.rs",
  "/home/example/.cargo/registry/src/example.rs",
  "/root/.cargo/registry/src/example.rs",
  String.raw`C:\Users\example\.cargo\registry\src\example.rs`,
]) {
  assert.throws(() => assertNoWasmHostPathLeaks(Buffer.from(leakedPath)));
}
assert.throws(() =>
  assertNoWasmHostPathLeaks(Buffer.from("/ci/private/build/example.rs"), [
    "/ci/private/build",
  ]),
);

assert.deepEqual(packageJson.files, [
  "dist",
  "index.d.ts",
  "LICENSE",
  "LICENSE-APACHE",
  "LICENSE-MIT",
  "README.md",
  "THIRD_PARTY_NOTICES.md",
  "third-party",
]);

const distDirectory = join(packageDirectory, "dist");
assert.deepEqual(await listFiles(distDirectory), [
  "breditor_wasm.d.ts",
  "breditor_wasm.js",
  "breditor_wasm_bg.wasm",
  "breditor_wasm_bg.wasm.d.ts",
  "third-party/rust-1.98.0/COPYRIGHT-library.html",
]);
const rustNotice = await readFile(
  join(
    distDirectory,
    "third-party",
    "rust-1.98.0",
    "COPYRIGHT-library.html",
  ),
);
assert.equal(
  createHash("sha256").update(rustNotice).digest("hex"),
  "68129500b616d5838629e68f55ff3aed5e096dacf60ce9eb41bbe599a563afa6",
);
const moduleUrl = pathToFileURL(join(packageDirectory, "dist", "breditor_wasm.js"));
const wasmBytes = await readFile(join(packageDirectory, "dist", "breditor_wasm_bg.wasm"));
assertNoWasmHostPathLeaks(wasmBytes);
const api = await import(moduleUrl.href);

assert.equal(typeof api.default, "function");
assert.equal(typeof api.initSync, "function");
api.initSync({ module: wasmBytes });
assert.equal(api.breditorWasmAbiVersion(), "5");
assert.equal(api.breditorVersion(), packageJson.version);

async function listFiles(root, relativeDirectory = "") {
  const absoluteDirectory = join(root, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`unexpected non-file package entry: ${relativePath}`);
    }
  }
  return files.sort();
}
