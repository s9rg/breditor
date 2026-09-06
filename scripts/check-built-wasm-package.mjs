import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageArgument = process.argv[2];
if (packageArgument === undefined) {
  throw new Error("usage: check-built-wasm-package.mjs <package-directory>");
}

const packageDirectory = resolve(packageArgument);
const packageJson = JSON.parse(
  await readFile(join(packageDirectory, "package.json"), "utf8"),
);
const moduleUrl = pathToFileURL(join(packageDirectory, "dist", "breditor_wasm.js"));
const wasmBytes = await readFile(join(packageDirectory, "dist", "breditor_wasm_bg.wasm"));
const api = await import(moduleUrl.href);

assert.equal(typeof api.default, "function");
assert.equal(typeof api.initSync, "function");
api.initSync({ module: wasmBytes });
assert.equal(api.breditorWasmAbiVersion(), "1");
assert.equal(api.breditorVersion(), packageJson.version);
