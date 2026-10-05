// Read-only, artifact-bound size audit. Measurements do not approve budgets,
// re-run functional qualification, rebuild shipping files or publish anything.
import assert from "node:assert/strict";
import {readFile, readdir, realpath} from "node:fs/promises";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";
import {sha256, tree} from "./build-opt-in-flat-list-package.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));

/** Measure every emitted JS/Wasm asset, including secondary entry points.
 * gzip is per file at level 9, not one combined stream or a network trace.
 * CSS and other files are retained separately so scope is never implicit. */
export function summarizeAssets(assets) {
  const names = new Set();
  const files = assets.map(({name, bytes}) => {
    assert.equal(typeof name, "string");
    assert.ok(!names.has(name), "Duplicate asset name");
    names.add(name);
    assert.ok(Buffer.isBuffer(bytes), "Expected asset bytes, not reported lengths");
    return {name, bytes: bytes.length, gzip9Bytes: gzipSync(bytes, {level: 9}).length,
      sha256: sha256(bytes), kind: name.endsWith(".wasm") ? "wasm"
        : name.endsWith(".js") ? "javascript" : "other"};
  }).sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(files.filter(f => f.kind === "wasm").length, 1, "Expected exactly one Wasm asset");
  assert.ok(files.some(f => f.kind === "javascript"), "Missing JavaScript assets");
  const total = kind => files.filter(f => f.kind === kind).reduce((sum, f) => ({
    bytes: sum.bytes + f.bytes, gzip9Bytes: sum.gzip9Bytes + f.gzip9Bytes,
  }), {bytes: 0, gzip9Bytes: 0});
  const javascript = total("javascript"), wasm = total("wasm");
  return {files, javascript, wasm, other: total("other"),
    javascriptAndWasm: {bytes: javascript.bytes + wasm.bytes,
      gzip9Bytes: javascript.gzip9Bytes + wasm.gzip9Bytes}};
}

/** Reject links/devices instead of following an audit input outside its tree. */
export async function readAssetTree(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(root, {withFileTypes: true})) {
    assert.ok(entry.isFile() || entry.isDirectory(), `Non-regular audit input: ${entry.name}`);
    const name = join(prefix, entry.name), path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...await readAssetTree(path, name));
    else result.push({name, bytes: await readFile(path)});
  }
  return result;
}

async function targetPath(input) {
  const target = join(await realpath(repository), "target");
  assert.equal(await realpath(target), target, "Redirected target directory");
  const path = resolve(repository, input);
  assert.equal(await realpath(path), path, "Redirected audit path");
  const local = relative(target, path);
  assert.ok(local && local !== ".." && !local.startsWith(`..${sep}`) && !local.startsWith(sep),
    "Audit inputs must be under repository target");
  return path;
}

export async function measureOptInSize(assemblyInput, proofInput) {
  const assemblyPath = await targetPath(assemblyInput), proofPath = await targetPath(proofInput);
  const assemblyBytes = await readFile(assemblyPath), proofBytes = await readFile(proofPath);
  const assembly = JSON.parse(assemblyBytes), proof = JSON.parse(proofBytes);
  assert.equal(assembly.name, "@breditor/experimental-flat-lists");
  assert.equal(assembly.status, "assembled-not-consumer-qualified");
  assert.equal(assembly.publishable, false);
  assert.equal(await targetPath(assembly.directory), dirname(assemblyPath));
  const archivePath = await targetPath(assembly.archive);
  assert.equal(dirname(archivePath), dirname(assemblyPath));
  const packagePath = await targetPath(assembly.packageDirectory);
  assert.equal(packagePath, join(dirname(assemblyPath), "package"));
  const archive = await readFile(archivePath);
  assert.equal(sha256(archive), assembly.sha256, "Archive identity changed");
  assert.equal(archive.length, assembly.bytes, "Archive byte count changed");
  assert.equal(sha256(JSON.stringify(await tree(packagePath))), assembly.packageTreeSha256,
    "Package tree identity changed");
  const unpackedBytes = (await readAssetTree(packagePath)).reduce((sum, f) => sum + f.bytes.length, 0);
  assert.equal(unpackedBytes, assembly.unpackedBytes, "Unpacked byte count changed");
  assert.equal(proof.workspaceEditorModules, 0);
  assert.ok(Array.isArray(proof.installedModules) && proof.installedModules.length > 0);
  assert.equal(proof.archiveSha256, assembly.sha256, "Demo declares a different package");
  const assetsPath = await targetPath(join(dirname(proofPath), "assets"));
  const assets = summarizeAssets(await readAssetTree(assetsPath));
  const emittedWasm = assets.files.find(f => f.kind === "wasm");
  assert.equal(emittedWasm.sha256, proof.wasmSha256, "Demo Wasm identity changed");
  assert.equal(emittedWasm.sha256,
    sha256(await readFile(join(packagePath, "dist/wasm/breditor_wasm_bg.wasm"))),
    "Demo Wasm differs from the packaged engine");
  return {format: "breditor/opt-in-size-measurement", formatVersion: 1,
    status: "measured-not-budget-qualified", publishable: false, sizeBudgetQualified: false,
    assemblyPath, assemblySha256: sha256(assemblyBytes), proofPath, proofSha256: sha256(proofBytes),
    package: {archiveSha256: assembly.sha256, bytes: archive.length, unpackedBytes}, assets,
    scope: "All emitted demo assets; JavaScript/Wasm aggregate includes both demo and clipboard entry points. Per-file gzip-9 estimates, not an actual network transfer. Package bytes exclude separately installed dependencies. Proof declares the matching archive and emitted Wasm; asset hashes snapshot current JS, not independent proof of its provenance or a functional test rerun. No ceiling approval or release qualification."};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4,
    "usage: node scripts/measure-opt-in-flat-list-size.mjs <assembly.json> <opt-in-runtime-proof.json>");
  console.log(JSON.stringify(await measureOptInSize(process.argv[2], process.argv[3]), null, 2));
}
