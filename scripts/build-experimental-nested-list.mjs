// Developer-only build + qualification. Never writes package dist or exports.
// All generated candidates are retained under target for inspection on failure.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { checkNestedListDeclarations } from "./check-nested-list-declarations.mjs";
import { assertNoWasmHostPathLeaks } from "./wasm-path-leaks.mjs";
import { nonCustomWasmBytes, retainWasmCustomSections, wasmFunctionNames, withWasmFunctionNames } from "./wasm-function-names.mjs";

assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === "--diagnostic-names"), "only optional --diagnostic-names is supported");
const diagnosticNames = process.argv[2] === "--diagnostic-names";
const wordFlag = process.env.BREDITOR_NESTED_WORD_CANDIDATE ?? "0";
assert.ok(["0", "1"].includes(wordFlag), "BREDITOR_NESTED_WORD_CANDIDATE must be 0 or 1");
const privateScalarWords = wordFlag === "1";
assert.ok(!privateScalarWords || !diagnosticNames, "word candidate cannot add diagnostic names");
// Explicit experimental override: keep the production profile and its cache
// untouched, and record the optimization choice in qualification evidence.
const optLevel = process.env.BREDITOR_WASM_SIZE_OPT ?? "s";
assert.ok(["s", "z"].includes(optLevel), "BREDITOR_WASM_SIZE_OPT must be s or z");
const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const target = join(repository, "target");
const cargoTarget = join(target, `${privateScalarWords ? "nested-list-words" : diagnosticNames ? "nested-list-symbols" : "nested-list"}${optLevel === "z" ? "-size-z" : ""}-cargo`);
await mkdir(cargoTarget, { recursive: true });
// A symlink must not redirect experimental compilation into the default cache.
assert.equal(await realpath(cargoTarget), cargoTarget, "experimental Cargo target must be isolated");
const directory = await mkdtemp(join(target, diagnosticNames ? "nested-list-symbols-" : "nested-list-candidate-"));
console.log(`Experimental candidate: ${directory}`);
const cargoHome = await realpath(resolve(repository, process.env.CARGO_HOME ?? join(homedir(), ".cargo")));
const cargo = process.env.CARGO_BIN ?? "cargo";
const bindgen = process.env.WASM_BINDGEN_BIN ?? "wasm-bindgen";
const rolldown = join(repository, "node_modules/.bin/rolldown");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: repository, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed (${result.signal ?? result.status})`);
  return result.stdout?.trim();
};
assert.equal(run(bindgen, ["--version"], { encoding: "utf8", stdio: "pipe" }), "wasm-bindgen 0.2.127");
assert.equal(run(rolldown, ["--version"], { encoding: "utf8", stdio: "pipe" }), "rolldown v1.2.7");
const shippingPath = join(repository, "packages/breditor-wasm/dist/breditor_wasm_bg.wasm");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shippingBefore = hash(await readFile(shippingPath));
const hashTree = async (path) => {
  const result = {};
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    result[entry.name] = entry.isDirectory()
      ? await hashTree(join(path, entry.name)) : hash(await readFile(join(path, entry.name)));
  }
  return result;
};
const shippingDist = join(repository, "packages/breditor-wasm/dist");
const shippingTreeBefore = await hashTree(shippingDist);
const browserDist = join(repository, "packages/breditor-browser/dist");
const browserTreeBefore = await hashTree(browserDist);
run(cargo, ["build", "--locked", "-p", "breditor-wasm", "--features", privateScalarWords ? "candidate-word-projection-scalars" : "experimental-nested-lists",
  "--profile", "wasm-release", "--target", "wasm32-unknown-unknown"], {
  env: { ...process.env, CARGO_TARGET_DIR: cargoTarget, CARGO_HOME: cargoHome,
    CARGO_PROFILE_WASM_RELEASE_OPT_LEVEL: optLevel,
    ...(diagnosticNames ? {CARGO_PROFILE_WASM_RELEASE_STRIP: "debuginfo"} : {}),
    CARGO_INCREMENTAL: "0", RUSTFLAGS: "", SOURCE_DATE_EPOCH: "0",
    CARGO_ENCODED_RUSTFLAGS: [
      `--remap-path-prefix=${cargoTarget}=target`,
      `--remap-path-prefix=${cargoHome}=cargo`,
      `--remap-path-prefix=${repository}=breditor`,
    ].join("\x1f") },
});
const raw = await mkdtemp(join(target, "nested-list-bindgen-"));
let bindgenInput = join(cargoTarget, "wasm32-unknown-unknown/wasm-release/breditor_wasm.wasm");
if (diagnosticNames) {
  // Rust's stripped build retains only bindgen metadata. Keeping target_features
  // would enable different bindgen multivalue/externref transforms and change
  // the low-level ABI. Retain names, not that change in toolchain behavior.
  const source = await readFile(bindgenInput);
  const names = wasmFunctionNames(source);
  let removed = 0;
  for (const [index, name] of names) {
    // Bindgen otherwise uses these names instead of the reviewed anonymous
    // allocator exports. Preserve the existing export naming, not a new ABI.
    if (/^__wbindgen_(malloc|realloc|free)$/u.test(name)) { names.delete(index); removed++; }
  }
  assert.equal(removed, 3, "diagnostic allocator names changed");
  const bytes = withWasmFunctionNames(retainWasmCustomSections(source,
    new Set(["__wasm_bindgen_unstable"])), names);
  assert.ok(nonCustomWasmBytes(source).equals(nonCustomWasmBytes(bytes)), "diagnostic metadata preparation changed executable sections");
  bindgenInput = join(directory, "diagnostic-input.wasm");
  await writeFile(bindgenInput, bytes);
}
run(bindgen, [bindgenInput,
  "--target", "web", "--typescript", ...(diagnosticNames ? [] : ["--remove-name-section"]), "--remove-producers-section",
  "--out-dir", raw, "--out-name", "breditor_wasm"]);
run(rolldown, [join(raw, "breditor_wasm.js"), "--file", join(directory, "breditor_wasm.js"),
  "--format", "esm", "--platform", "browser", "--minify", "--logLevel", "silent"]);
for (const file of ["breditor_wasm.d.ts", "breditor_wasm_bg.wasm", "breditor_wasm_bg.wasm.d.ts"]) {
  await writeFile(join(directory, file), await readFile(join(raw, file)));
}
const declarations = await readFile(join(directory, "breditor_wasm.d.ts"), "utf8");
run(process.execPath, ["--test", "scripts/check-nested-list-declarations.test.mjs"]);
checkNestedListDeclarations(await readFile(join(repository, "crates/breditor-wasm/api/breditor_wasm.d.ts"), "utf8"), declarations, {privateScalarWords});
await writeFile(join(directory, "nested-list-api.ts"), await readFile(join(repository, "scripts/fixtures/nested-list-api.ts")));
run(join(repository, "node_modules/.bin/tsc"), ["--noEmit", "--strict", "--target", "ES2022",
  "--module", "NodeNext", "--lib", "ES2022,DOM,esnext.disposable", join(directory, "nested-list-api.ts")]);
const wasm = await readFile(join(directory, "breditor_wasm_bg.wasm"));
assertNoWasmHostPathLeaks(wasm, [repository, cargoHome, cargoTarget]);

run(process.execPath, ["scripts/check-experimental-heading-wasm.mjs", directory]);
run(process.execPath, ["scripts/check-experimental-nested-list-wasm.mjs", directory]);
run(process.execPath, ["scripts/check-experimental-nested-list-browsers.mjs", directory]);

assert.equal(hash(await readFile(shippingPath)), shippingBefore, "shipping Wasm changed during experimental qualification");
assert.deepEqual(await hashTree(shippingDist), shippingTreeBefore, "shipping artifacts changed during experimental qualification");
assert.deepEqual(await hashTree(browserDist), browserTreeBefore, "browser artifacts changed during experimental qualification");
const manifest = { status: "passed", publishable: false, feature: "experimental-nested-lists",
  diagnosticNames, optLevel, privateScalarWords, projectionScalarWordsVersion: privateScalarWords ? 1 : null,
  codecs: { bootstrap: 5, document: 2, state: 3, session: 7, commit: 7 },
  wasmBytes: wasm.length, wasmGzip9Bytes: gzipSync(wasm, { level: 9 }).length,
  wasmSha256: hash(wasm), shippingWasmSha256: shippingBefore,
  declarationsSha256: hash(declarations),
  browserDistTreeSha256: hash(JSON.stringify(browserTreeBefore)),
  qualification: "Generated ABI and TypeScript, Node nested commands/recovery and retained heading compatibility; five raw-Wasm runs and one integrated editor/default-toolbar/recovery scenario each in Chromium/Firefox/WebKit. Synthetic input only; no packed-consumer, native clipboard or IME qualification." };
await writeFile(join(directory, "qualification.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ directory, ...manifest }, null, 2));
