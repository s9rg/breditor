import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp, mkdir, writeFile, symlink} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {gzipSync} from "node:zlib";
import {measureOptInSize, readAssetTree, summarizeAssets} from "./measure-opt-in-flat-list-size.mjs";
import {sha256, tree} from "./build-opt-in-flat-list-package.mjs";

const asset = (name, text) => ({name, bytes: Buffer.from(text)});
const fixtures = () => [asset("engine.wasm", "wasm-fixture"), asset("shared.js", "shared"),
  asset("demo.js", "demo entry"), asset("clipboard.js", "clipboard entry"), asset("demo.css", "css")];

test("counts shared and secondary chunks once and compresses each file separately", () => {
  const files = fixtures(), r = summarizeAssets(files);
  const code = files.filter(f => /\.(?:js|wasm)$/u.test(f.name));
  assert.equal(r.javascriptAndWasm.bytes, code.reduce((n, f) => n + f.bytes.length, 0));
  assert.equal(r.javascriptAndWasm.gzip9Bytes,
    code.reduce((n, f) => n + gzipSync(f.bytes, {level: 9}).length, 0));
  assert.equal(r.other.bytes, 3);
  assert.equal(r.files.length, 5);
  assert(r.files.every(f => /^[a-f0-9]{64}$/u.test(f.sha256)));
  assert.deepEqual(summarizeAssets(files.reverse()), r);
});

test("rejects missing/duplicate engines, missing JS and reported lengths without bytes", () => {
  for (const files of [[], [asset("engine.wasm", "x")], [asset("demo.js", "x")],
    [...fixtures(), asset("other.wasm", "x")], [...fixtures(), asset("demo.js", "duplicate")],
    [{name: "demo.js", bytes: 100}, asset("engine.wasm", "x")]]) {
    assert.throws(() => summarizeAssets(files));
  }
});

test("recursively measures regular assets but rejects symlinked audit inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "breditor-size-audit-test-"));
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "engine.wasm"), "wasm");
  await writeFile(join(root, "nested/demo.js"), "demo");
  const r = summarizeAssets(await readAssetTree(root));
  assert.equal(r.javascript.bytes, 4);
  assert.equal(r.wasm.bytes, 4);
  await symlink(join(root, "engine.wasm"), join(root, "alias.wasm"));
  await assert.rejects(readAssetTree(root), /Non-regular audit input/u);
});

// These tiny synthetic files test identity binding, not Wasm execution or package
// qualification. Keep them under the same target boundary as real audit inputs.
async function fixture() {
  const repository = fileURLToPath(new URL("../", import.meta.url));
  const root = await mkdtemp(join(repository, "target/opt-in-size-test-"));
  const packageDirectory = join(root, "package"), assets = join(root, "bundle/assets");
  await mkdir(join(packageDirectory, "dist/wasm"), {recursive: true});
  await mkdir(assets, {recursive: true});
  const wasm = Buffer.from("test engine");
  await writeFile(join(packageDirectory, "dist/wasm/breditor_wasm_bg.wasm"), wasm);
  await writeFile(join(assets, "engine.wasm"), wasm);
  await writeFile(join(assets, "demo.js"), "test js");
  const archive = join(root, "test.tgz"), archiveBytes = Buffer.from("test archive");
  await writeFile(archive, archiveBytes);
  const assembly = {name: "@breditor/experimental-flat-lists",
    status: "assembled-not-consumer-qualified", publishable: false, directory: root,
    packageDirectory, archive, sha256: sha256(archiveBytes), bytes: archiveBytes.length,
    unpackedBytes: wasm.length, packageTreeSha256: sha256(JSON.stringify(await tree(packageDirectory)))};
  const proof = {workspaceEditorModules: 0, installedModules: ["test.js"],
    archiveSha256: assembly.sha256, wasmSha256: sha256(wasm)};
  const assemblyPath = join(root, "assembly.json"), proofPath = join(root, "bundle/opt-in-runtime-proof.json");
  const save = async () => {
    await writeFile(assemblyPath, JSON.stringify(assembly));
    await writeFile(proofPath, JSON.stringify(proof));
  };
  await save();
  return {root, assets, archive, assembly, proof, assemblyPath, proofPath, save,
    measure: () => measureOptInSize(assemblyPath, proofPath)};
}

test("artifact-bound audit remains unqualified and rejects changed identities or counts", async () => {
  const f = await fixture();
  const result = await f.measure();
  assert.equal(result.status, "measured-not-budget-qualified");
  assert.equal(result.sizeBudgetQualified, false);
  assert.equal(result.publishable, false);
  assert.equal(result.package.unpackedBytes, Buffer.byteLength("test engine"));
  assert.equal(result.assets.javascript.bytes, 7);
  for (const [record, key, invalid] of [
    [f.assembly, "bytes", 0], [f.assembly, "unpackedBytes", 0],
    [f.assembly, "packageTreeSha256", "changed"], [f.assembly, "sha256", "changed"],
    [f.assembly, "publishable", true], [f.proof, "archiveSha256", "changed"],
    [f.proof, "wasmSha256", "changed"], [f.proof, "workspaceEditorModules", 1],
    [f.proof, "installedModules", []],
  ]) {
    const original = record[key]; record[key] = invalid; await f.save();
    await assert.rejects(f.measure());
    record[key] = original; await f.save();
  }
  await writeFile(join(f.assets, "engine.wasm"), "different engine");
  await assert.rejects(f.measure(), /Wasm identity changed/u);
  f.proof.wasmSha256 = sha256(Buffer.from("different engine"));
  await f.save();
  await assert.rejects(f.measure(), /differs from the packaged engine/u);
});

test("audit rejects actual archive mutation and redirected input records", async () => {
  const f = await fixture();
  const alias = join(f.root, "alias.json");
  await symlink(f.assemblyPath, alias);
  await assert.rejects(measureOptInSize(alias, f.proofPath), /Redirected audit path/u);
  await writeFile(f.archive, "changed archive");
  await assert.rejects(f.measure(), /Archive identity changed/u);
});
