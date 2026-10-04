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
import { checkFlatListDeclarations } from "./check-flat-list-declarations.mjs";
import { assertNoWasmHostPathLeaks } from "./wasm-path-leaks.mjs";

assert.equal(process.argv.length, 2, "this qualification command accepts no arguments");
const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const target = join(repository, "target");
const cargoTarget = join(target, "flat-list-cargo");
await mkdir(cargoTarget, { recursive: true });
// A symlink must not redirect experimental compilation into the default cache.
assert.equal(await realpath(cargoTarget), cargoTarget, "experimental Cargo target must be isolated");
const directory = await mkdtemp(join(target, "flat-list-candidate-"));
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
run(cargo, ["build", "--locked", "-p", "breditor-wasm", "--features", "experimental-flat-lists",
  "--profile", "wasm-release", "--target", "wasm32-unknown-unknown"], {
  env: { ...process.env, CARGO_TARGET_DIR: cargoTarget, CARGO_HOME: cargoHome,
    CARGO_INCREMENTAL: "0", RUSTFLAGS: "", SOURCE_DATE_EPOCH: "0",
    CARGO_ENCODED_RUSTFLAGS: [
      `--remap-path-prefix=${cargoTarget}=target`,
      `--remap-path-prefix=${cargoHome}=cargo`,
      `--remap-path-prefix=${repository}=breditor`,
    ].join("\x1f") },
});
const raw = await mkdtemp(join(target, "flat-list-bindgen-"));
run(bindgen, [join(cargoTarget, "wasm32-unknown-unknown/wasm-release/breditor_wasm.wasm"),
  "--target", "web", "--typescript", "--remove-name-section", "--remove-producers-section",
  "--out-dir", raw, "--out-name", "breditor_wasm"]);
run(rolldown, [join(raw, "breditor_wasm.js"), "--file", join(directory, "breditor_wasm.js"),
  "--format", "esm", "--platform", "browser", "--minify", "--logLevel", "silent"]);
for (const file of ["breditor_wasm.d.ts", "breditor_wasm_bg.wasm", "breditor_wasm_bg.wasm.d.ts"]) {
  await writeFile(join(directory, file), await readFile(join(raw, file)));
}
const declarations = await readFile(join(directory, "breditor_wasm.d.ts"), "utf8");
checkFlatListDeclarations(await readFile(join(repository, "crates/breditor-wasm/api/breditor_wasm.d.ts"), "utf8"), declarations);
await writeFile(join(directory, "flat-list-api.ts"), await readFile(join(repository, "scripts/fixtures/flat-list-api.ts")));
run(join(repository, "node_modules/.bin/tsc"), ["--noEmit", "--strict", "--target", "ES2022",
  "--module", "NodeNext", "--lib", "ES2022,DOM,esnext.disposable", join(directory, "flat-list-api.ts")]);
const wasm = await readFile(join(directory, "breditor_wasm_bg.wasm"));
assertNoWasmHostPathLeaks(wasm, [repository, cargoHome, cargoTarget]);
run(process.execPath, ["--test", "scripts/check-flat-list-declarations.test.mjs"]);
run(process.execPath, ["scripts/check-experimental-heading-wasm.mjs", directory]);
run(process.execPath, ["scripts/check-experimental-flat-list-wasm.mjs", directory]);
run(process.execPath, ["scripts/check-experimental-flat-list-browsers.mjs", directory]);

assert.equal(hash(await readFile(shippingPath)), shippingBefore, "shipping Wasm changed during experimental qualification");
assert.deepEqual(await hashTree(shippingDist), shippingTreeBefore, "shipping artifacts changed during experimental qualification");
assert.deepEqual(await hashTree(browserDist), browserTreeBefore, "browser artifacts changed during experimental qualification");
const manifest = { status: "passed", publishable: false, feature: "experimental-flat-lists",
  codecs: { bootstrap: 4, document: 2, state: 3, session: 6, commit: 6 },
  wasmBytes: wasm.length, wasmGzip9Bytes: gzipSync(wasm, { level: 9 }).length,
  wasmSha256: hash(wasm), shippingWasmSha256: shippingBefore,
  declarationsSha256: hash(declarations),
  browserDistTreeSha256: hash(JSON.stringify(browserTreeBefore)),
  qualification: "Generated ABI and TypeScript, Node list commands/projection/recovery and retained heading compatibility; five raw-Wasm runs each in Chromium/Firefox/WebKit. No editor DOM, native clipboard or IME qualification." };
await writeFile(join(directory, "qualification.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ directory, ...manifest }, null, 2));
