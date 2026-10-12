// Read-only measurement of the qualified opt-in archive and its consumer assets.
// A measurement never approves a ceiling or substitutes for functional tests.
import assert from "node:assert/strict";
import {readFile, realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {sha256, tree} from "./build-opt-in-nested-list-package.mjs";
import {readAssetTree, summarizeAssets} from "./measure-opt-in-flat-list-size.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));

/** Require the matching successful private consumer, not a reported size alone. */
export function validateNestedSizeRecords(assembly, consumer, assemblyPath) {
  assert.equal(assembly.name, "@breditor/experimental-nested-lists");
  assert.equal(assembly.status, "assembled-not-consumer-qualified");
  assert.equal(assembly.publishable, false);
  assert.equal(consumer.status, "passed");
  assert.equal(consumer.publishable, false);
  assert.equal(consumer.assembly, assemblyPath);
  assert.equal(consumer.archiveSha256, assembly.sha256);
  assert.equal(consumer.nodeAndTypes, "passed");
  assert.ok(Array.isArray(consumer.browserRuns));
  assert.deepEqual(consumer.browserRuns.map(run => run.browser).sort(),
    ["chromium", "firefox", "webkit"]);
  for (const run of consumer.browserRuns) {
    assert.equal(run.status, "passed");
    assert.equal(run.keyboard?.status, "passed");
  }
}

async function targetPath(input) {
  const target = join(await realpath(repository), "target");
  assert.equal(await realpath(target), target);
  const path = resolve(repository, input);
  assert.equal(await realpath(path), path, "Redirected audit path");
  const local = relative(target, path);
  assert.ok(local && local !== ".." && !local.startsWith(`..${sep}`) && !local.startsWith(sep));
  return path;
}

/** Verify retained identities, then measure every built consumer asset. */
export async function measureNestedOptInSize(input) {
  const assemblyPath = await targetPath(input);
  const assemblyBytes = await readFile(assemblyPath);
  const assembly = JSON.parse(assemblyBytes);
  const proofPath = join(dirname(assemblyPath), "consumer-qualification.json");
  assert.equal(await targetPath(proofPath), proofPath);
  const proofBytes = await readFile(proofPath), consumer = JSON.parse(proofBytes);
  validateNestedSizeRecords(assembly, consumer, assemblyPath);
  assert.equal(await targetPath(assembly.directory), dirname(assemblyPath));
  const archivePath = await targetPath(assembly.archive);
  assert.equal(dirname(archivePath), dirname(assemblyPath));
  const archive = await readFile(archivePath);
  assert.equal(sha256(archive), assembly.sha256, "Archive identity changed");
  assert.equal(archive.length, assembly.bytes);
  const packagePath = await targetPath(assembly.packageDirectory);
  assert.equal(packagePath, join(dirname(assemblyPath), "package"));
  assert.equal(sha256(JSON.stringify(await tree(packagePath))), assembly.packageTreeSha256);
  const packageFiles = await readAssetTree(packagePath);
  const unpackedBytes = packageFiles.reduce((total, file) => total + file.bytes.length, 0);
  assert.equal(unpackedBytes, assembly.unpackedBytes);
  const consumerPath = await realpath(consumer.consumer);
  assert.equal(consumerPath, consumer.consumer);
  assert.match(relative(await realpath(tmpdir()), consumerPath), /^breditor-opt-in-consumer-[a-zA-Z0-9]+$/u);
  const assetsPath = join(consumerPath, "bundle", "assets");
  assert.equal(await realpath(assetsPath), assetsPath);
  const assets = summarizeAssets(await readAssetTree(assetsPath));
  assert.equal(assets.files.find(file => file.kind === "wasm").sha256,
    sha256(await readFile(join(packagePath, "dist/wasm/breditor_wasm_bg.wasm"))));
  return {format:"breditor/nested-opt-in-size-measurement", formatVersion:1,
    status:"measured-not-budget-qualified", sizeBudgetQualified:false, publishable:false,
    assemblyPath, assemblySha256:sha256(assemblyBytes), consumerProofSha256:sha256(proofBytes),
    package:{archiveSha256:assembly.sha256, bytes:archive.length, unpackedBytes}, assets,
    scope:"All built external qualification-consumer assets, including its test fixture; not the shipping demo. Per-file gzip-9 estimates, not network transfer. Package archive excludes separately installed dependencies. Archive/tree and emitted Wasm identities checked; JS hashes snapshot current assets, not independent proof of provenance. No ceiling acceptance, functional rerun or release qualification."};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3,
    "usage: node scripts/measure-opt-in-nested-list-size.mjs <assembly.json>");
  console.log(JSON.stringify(await measureNestedOptInSize(process.argv[2]), null, 2));
}
