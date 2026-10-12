import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp, mkdir, readFile, realpath, symlink, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {sha256, tree} from "./build-opt-in-nested-list-package.mjs";
import {measureNestedOptInSize, validateNestedSizeRecords} from "./measure-opt-in-nested-list-size.mjs";

const assemblyPath = "/repo/target/example/assembly.json";
const assembly = {name:"@breditor/experimental-nested-lists",
  status:"assembled-not-consumer-qualified", publishable:false, sha256:"identity"};
const proof = {status:"passed", publishable:false, assembly:assemblyPath,
  archiveSha256:"identity", nodeAndTypes:"passed",
  browserRuns:["chromium","firefox","webkit"].map(browser =>
    ({browser,status:"passed",keyboard:{status:"passed"}}))};

test("matching private all-engine consumer is admitted", () => {
  validateNestedSizeRecords(assembly, proof, assemblyPath);
  assert.deepEqual(assembly, {name:"@breditor/experimental-nested-lists",
    status:"assembled-not-consumer-qualified",publishable:false,sha256:"identity"});
});
for (const [name, change] of [
  ["different archive", p => {p.archiveSha256="other";}],
  ["different assembly", p => {p.assembly="/other/assembly.json";}],
  ["failed consumer", p => {p.status="failed";}],
  ["public candidate", p => {p.publishable=true;}],
  ["failed types", p => {p.nodeAndTypes="failed";}],
  ["missing browser", p => {p.browserRuns.pop();}],
  ["duplicate browser", p => {p.browserRuns[2].browser="chromium";}],
  ["failed engine", p => {p.browserRuns[2].status="failed";}],
  ["unqualified keyboard", p => {delete p.browserRuns[2].keyboard;}],
]) test(`rejects ${name}`, () => {
  const changed = structuredClone(proof); change(changed);
  assert.throws(() => validateNestedSizeRecords(assembly, changed, assemblyPath));
});
test("does not admit flat or publishable assembly", () => {
  assert.throws(() => validateNestedSizeRecords({...assembly,name:"@breditor/experimental-flat-lists"},proof,assemblyPath));
  assert.throws(() => validateNestedSizeRecords({...assembly,publishable:true},proof,assemblyPath));
});

// Synthetic bytes exercise identity checks, not Wasm execution or editor tests.
async function fixture() {
  const root = await mkdtemp(join(fileURLToPath(new URL("../target/", import.meta.url)), "nested-size-audit-test-"));
  const consumer = await mkdtemp(join(await realpath(tmpdir()), "breditor-opt-in-consumer-"));
  const packageDirectory = join(root, "package"), assets = join(consumer, "bundle/assets");
  await mkdir(join(packageDirectory, "dist/wasm"), {recursive:true});
  await mkdir(assets, {recursive:true});
  const wasm = Buffer.from("synthetic engine");
  await writeFile(join(packageDirectory, "dist/wasm/breditor_wasm_bg.wasm"), wasm);
  await writeFile(join(assets, "engine.wasm"), wasm);
  await writeFile(join(assets, "main.js"), "fixture");
  const archive = join(root, "package.tgz"), archiveBytes = Buffer.from("synthetic archive");
  await writeFile(archive, archiveBytes);
  const path = join(root, "assembly.json");
  const record = {...assembly,directory:root,packageDirectory,archive,
    sha256:sha256(archiveBytes),bytes:archiveBytes.length,unpackedBytes:wasm.length,
    packageTreeSha256:sha256(JSON.stringify(await tree(packageDirectory)))};
  const consumerRecord = {...structuredClone(proof),assembly:path,consumer,
    archiveSha256:record.sha256};
  const save = async () => {
    await writeFile(path, JSON.stringify(record));
    await writeFile(join(root, "consumer-qualification.json"), JSON.stringify(consumerRecord));
  };
  await save();
  return {path,root,assets,archive,record,consumerRecord,save,
    measure:() => measureNestedOptInSize(path)};
}

test("real file audit stays unqualified and rejects forged identities and counts", async () => {
  const f = await fixture(), result = await f.measure();
  assert.equal(result.status, "measured-not-budget-qualified");
  assert.equal(result.publishable, false);
  assert.equal(result.sizeBudgetQualified, false);
  assert.equal(result.assets.javascript.bytes, 7);
  for (const [key, invalid] of [["bytes",0],["unpackedBytes",0],
    ["sha256","changed"],["packageTreeSha256","changed"]]) {
    const original=f.record[key]; f.record[key]=invalid; await f.save();
    await assert.rejects(f.measure());
    f.record[key]=original; await f.save();
  }
  await writeFile(join(f.assets,"engine.wasm"),"changed engine");
  await assert.rejects(f.measure());
});

test("rejects mutated archive and redirected record", async () => {
  const f = await fixture(), alias=join(f.root,"alias.json");
  await symlink(f.path,alias);
  await assert.rejects(measureNestedOptInSize(alias),/Redirected audit path/u);
  await writeFile(f.archive,"mutated archive");
  await assert.rejects(f.measure(),/Archive identity changed/u);
});

test("rejects redirected consumer assets instead of measuring an alias", async () => {
  const f=await fixture(), moved=join(f.root,"external-assets");
  await mkdir(moved);
  await writeFile(join(moved,"engine.wasm"),await readFile(join(f.assets,"engine.wasm")));
  await symlink(join(moved,"engine.wasm"),join(f.assets,"alias.wasm"));
  await assert.rejects(f.measure(),/Non-regular audit input/u);
});
