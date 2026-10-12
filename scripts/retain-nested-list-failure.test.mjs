import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {retainNestedListFailure, retainNestedListReplayFailure, verifyFailureBundle} from "./retain-nested-list-failure.mjs";

test("failed replay retains a successful source unchanged and survives source deletion", async t => {
  const {root, source, report} = await fixture(t);
  const sourcePath = join(source, "measurement.json");
  await writeFile(sourcePath, JSON.stringify({...report, status: "measured"}));
  const sourceBytes = await readFile(sourcePath);
  const replayPath = join(source, "replay.json");
  const replay = {status: "failed", sourcePath, sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    indexSha256: createHash("sha256").update(await readFile(join(source, "bundle/index.html"))).digest("hex"),
    bundleAssets: report.bundleAssets};
  await writeFile(replayPath, JSON.stringify({...replay, status: "passed"}));
  await assert.rejects(retainNestedListReplayFailure(replayPath, sourcePath, join(root, "retained")));
  await writeFile(replayPath, JSON.stringify({...replay, sourceSha256: "wrong"}));
  await assert.rejects(retainNestedListReplayFailure(replayPath, sourcePath, join(root, "retained")));
  const replayBytes = Buffer.from(JSON.stringify(replay));
  await writeFile(replayPath, replayBytes);
  const output = await retainNestedListReplayFailure(replayPath, sourcePath, join(root, "retained"));
  const manifest = JSON.parse(await readFile(join(output, "retention.json")));
  await rm(source, {recursive: true});
  const retained = await verifyFailureBundle(join(output, "measurement.json"), manifest);
  assert.deepEqual(retained.files["measurement.json"], sourceBytes);
  assert.equal(retained.source.status, "measured");
  assert.deepEqual(retained.files["replay.json"], replayBytes);
  await writeFile(join(output, "replay.json"), "{}");
  await assert.rejects(verifyFailureBundle(join(output, "measurement.json"), manifest));
});

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "breditor-retention-test-")));
  t.after(() => rm(root, {recursive: true, force: true}));
  const source = join(root, "original");
  await mkdir(join(source, "bundle/assets"), {recursive: true});
  await writeFile(join(source, "bundle/index.html"), "<script src='/assets/main.js'></script>");
  await writeFile(join(source, "bundle/assets/main.js"), "exact bytes");
  const report = {status: "failed", fixture: source, bundleAssets: {
    "main.js": createHash("sha256").update("exact bytes").digest("hex"),
  }};
  await writeFile(join(source, "measurement.json"), JSON.stringify(report));
  return {root, source, report};
}

test("retained bytes survive original fixture removal and reject mutations", async t => {
  const {root, source} = await fixture(t);
  const original = await readFile(join(source, "measurement.json"));
  const output = await retainNestedListFailure(join(source, "measurement.json"), join(root, "retained"));
  const manifest = JSON.parse(await readFile(join(output, "retention.json")));
  await rm(source, {recursive: true});
  const retained = await verifyFailureBundle(join(output, "measurement.json"), manifest);
  assert.deepEqual(retained.files["measurement.json"], original);
  for (const name of ["bundle/assets/main.js", "bundle/index.html", "measurement.json"]) {
    const bytes = await readFile(join(output, name));
    await writeFile(join(output, name), name === "measurement.json" ? "{}" : "changed");
    await assert.rejects(verifyFailureBundle(join(output, "measurement.json"), manifest));
    await writeFile(join(output, name), bytes);
  }
});

test("rejects successful reports, unexpected files, and linked assets", async t => {
  const {root, source, report} = await fixture(t);
  const path = join(source, "measurement.json");
  await writeFile(path, JSON.stringify({...report, status: "measured"}));
  await assert.rejects(retainNestedListFailure(path, join(root, "retained")));
  await writeFile(path, JSON.stringify(report));
  await writeFile(join(source, "bundle/assets/extra.js"), "unexpected");
  await assert.rejects(retainNestedListFailure(path, join(root, "retained")));
  await rm(join(source, "bundle/assets/extra.js"));
  await rm(join(source, "bundle/assets/main.js"));
  await writeFile(join(root, "external.js"), "exact bytes");
  await symlink(join(root, "external.js"), join(source, "bundle/assets/main.js"));
  await assert.rejects(retainNestedListFailure(path, join(root, "retained")));
});

test("WebKit replay accepts retained bytes after source deletion", {skip: process.env.BREDITOR_RETENTION_WEBKIT_TEST !== "1"}, async t => {
  // This deliberately synthetic fixture tests replay plumbing, not editor reliability.
  const {source, report} = await fixture(t);
  const repository = fileURLToPath(new URL("../", import.meta.url));
  const retentionRoot = join(repository, "target/nested-list-reproductions");
  await writeFile(join(source, "measurement.json"), JSON.stringify({...report, browserName: "webkit", ownerRepetitions: 3}));
  await writeFile(join(source, "bundle/index.html"), '<div id="result" data-status="passed">{"cases":[0,1,2,3,4,5,6,7,8]}</div>');
  const output = await retainNestedListFailure(join(source, "measurement.json"), retentionRoot);
  t.after(() => rm(output, {recursive: true, force: true}));
  await rm(source, {recursive: true});
  const replay = spawnSync(process.execPath, [join(repository, "scripts/replay-nested-list-performance.mjs"), join(output, "measurement.json")], {encoding: "utf8", timeout: 120000});
  assert.equal(replay.status, 0, `${replay.error ?? ""}\n${replay.stdout}\n${replay.stderr}`);
  const match = replay.stdout.split("\n").map(line => {try {return JSON.parse(line);} catch {return undefined;}}).find(value => value?.output);
  const results = JSON.parse(await readFile(join(match.output, "replay.json")));
  assert.equal(results.status, "passed");
  assert.equal(results.runs.length, 10);
  assert.equal(results.rebuilt, false);
});
