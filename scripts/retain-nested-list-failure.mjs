// Keep exact failed fixture bytes outside macOS's disposable temporary tree.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, readdir, realpath, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";
import {traceRetainedBootstrapFailures} from "./retained-bootstrap-failure-trace.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export async function verifyFailureBundle(sourcePath, manifest) {
  const root = dirname(sourcePath);
  const bytes = await readFile(sourcePath);
  const source = JSON.parse(bytes);
  if(source.diagnosticWorkload!==undefined) {
    assert.equal(manifest?.diagnosticDerivation,true,"workload override requires verified derivation");
    assert.equal(manifest.diagnosticDerivationKind,"bootstrap");
  }
  if (manifest) {
    assert.equal(manifest.version, 1);
    assert.equal(hash(bytes), manifest.measurementSha256);
    assert.equal(source.fixture, dirname(manifest.originalSourcePath));
  } else assert.equal(source.fixture, root);
  const files = {"measurement.json": bytes};
  for (const directory of [join(root, "bundle"), join(root, "bundle/assets")]) {
    assert.equal(await realpath(directory), directory, "linked bundle directory");
  }
  assert.deepEqual((await readdir(join(root, "bundle"))).sort(), ["assets", "index.html"]);
  assert.deepEqual((await readdir(join(root, "bundle/assets"))).sort(), Object.keys(source.bundleAssets).sort());
  for (const name of ["index.html", ...Object.keys(source.bundleAssets).map(name => {
    assert.match(name, /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/u);
    return `assets/${name}`;
  })]) {
    const path = join(root, "bundle", name);
    assert.equal(await realpath(path), path, "linked bundle file");
    const content = await readFile(path);
    const expected = name === "index.html" ? manifest?.indexSha256 : source.bundleAssets[name.slice(7)];
    if (expected !== undefined) assert.equal(hash(content), expected, `changed bundle file: ${name}`);
    files[`bundle/${name}`] = content;
  }
  if (manifest?.replaySha256 !== undefined) {
    const replayBytes = await readFile(join(root, "replay.json"));
    assert.equal(hash(replayBytes), manifest.replaySha256, "changed retained replay");
    const replay = JSON.parse(replayBytes);
    assert.equal(replay.status, "failed");
    assert.equal(replay.sourcePath, manifest.replaySourcePath);
    assert.equal(replay.sourceSha256, manifest.measurementSha256);
    assert.equal(replay.indexSha256, manifest.indexSha256);
    assert.deepEqual(replay.bundleAssets, source.bundleAssets);
    files["replay.json"] = replayBytes;
  }
  if (manifest?.diagnosticDerivation === true) {
    const bootstrap = source.retainedBootstrapDerivation !== undefined;
    assert.notEqual(bootstrap, source.retainedLayoutDerivation !== undefined, "ambiguous diagnostic derivation");
    if (bootstrap) assert.equal(manifest.diagnosticDerivationKind, "bootstrap");
    const derivation = bootstrap ? source.retainedBootstrapDerivation : source.retainedLayoutDerivation;
    assert.equal(source.status, "prepared-diagnostic-only");
    assert.equal(source.releaseQualified, false);
    const originalMeasurement = await readFile(join(root, "original-measurement.json"));
    const originalRetention = await readFile(join(root, "original-retention.json"));
    const originalFile = bootstrap ? "original-script.js" : "original-layout.js";
    const originalLayout = await readFile(join(root, originalFile));
    assert.equal(hash(originalMeasurement), derivation.sourceMeasurementSha256);
    assert.equal(hash(originalRetention), derivation.sourceRetentionSha256);
    assert.equal(hash(originalLayout), bootstrap ? derivation.originalAssetSha256 : derivation.originalLayoutSha256);
    const original = JSON.parse(originalMeasurement), retained = JSON.parse(originalRetention);
    assert.equal(retained.version, 1);
    assert.equal(retained.measurementSha256, hash(originalMeasurement));
    assert.equal(retained.indexSha256, hash(files["bundle/index.html"]));
    assert.equal(original.bundleAssets[derivation.asset], derivation.originalAssetSha256);
    const tracedScript = files[`bundle/assets/${derivation.asset}`];
    assert.ok(tracedScript, "missing derived script");
    assert.equal(hash(tracedScript), derivation.tracedAssetSha256);
    if (bootstrap) {
      if(derivation.replayBrowser!==undefined) {
        assert.equal(derivation.replayBrowser,"webkit","invalid diagnostic replay browser");
        assert.equal(original.browserName,"all");
        assert.equal(source.browserName,original.browserName);
        const failures=original.measurements?.filter(run=>run.status==="failed")??[];
        assert.equal(failures.length,1,"ambiguous original failed browser");
        assert.equal(failures[0].browser,"webkit","original failure was not WebKit");
      }
      assert.ok(derivation.ownerFaults===undefined||typeof derivation.ownerFaults==="boolean");
      assert.ok(derivation.smallRestoreChurn===undefined||typeof derivation.smallRestoreChurn==="boolean");
      assert.ok(derivation.checkpointExports===undefined||typeof derivation.checkpointExports==="boolean");
      assert.ok(derivation.inputRoutes===undefined||typeof derivation.inputRoutes==="boolean");
      assert.ok(derivation.checkpointReader===undefined||typeof derivation.checkpointReader==="boolean");
      assert.ok(derivation.checkpointValidation===undefined||typeof derivation.checkpointValidation==="boolean");
      assert.ok(derivation.checkpointPredicates===undefined||typeof derivation.checkpointPredicates==="boolean");
      assert.ok(derivation.checkpointCapture===undefined||typeof derivation.checkpointCapture==="boolean");
      const expected = traceRetainedBootstrapFailures(originalLayout.toString("utf8"),{ownerFaults:derivation.ownerFaults===true,smallRestoreChurn:derivation.smallRestoreChurn===true,checkpointExports:derivation.checkpointExports===true,inputRoutes:derivation.inputRoutes===true,checkpointReader:derivation.checkpointReader===true,checkpointValidation:derivation.checkpointValidation===true,checkpointPredicates:derivation.checkpointPredicates===true,checkpointCapture:derivation.checkpointCapture===true});
      assert.deepEqual(source.diagnosticWorkload,expected.diagnosticWorkload,"diagnostic workload changed");
      assert.deepEqual(tracedScript, Buffer.from(expected.code), "bytes outside bootstrap trace changed");
      assert.deepEqual(derivation.sites, expected.sites, "bootstrap trace sites changed");
      assert.equal(derivation.rebuilt, false);
      assert.equal(derivation.remangled, false);
    } else {
    const code = tracedScript.toString("utf8"), layout = derivation.layout;
    assert.ok(Number.isSafeInteger(layout.start) && Number.isSafeInteger(layout.tracedEnd) &&
      layout.start >= 0 && layout.tracedEnd > layout.start && layout.tracedEnd <= code.length, "invalid derived layout span");
    const restored = code.slice(0, layout.start) + originalLayout.toString("utf8") + code.slice(layout.tracedEnd);
    assert.equal(hash(Buffer.from(restored)), derivation.originalAssetSha256, "bytes outside retained layout changed");
    }
    assert.deepEqual(Object.keys(original.bundleAssets).sort(), Object.keys(source.bundleAssets).sort());
    for (const name of Object.keys(original.bundleAssets)) if (name !== derivation.asset) {
      assert.equal(source.bundleAssets[name], original.bundleAssets[name], "non-script control asset changed");
    }
    files["original-measurement.json"] = originalMeasurement;
    files["original-retention.json"] = originalRetention;
    files[originalFile] = originalLayout;
  }
  return {source, files};
}

/** Retain a failed exact replay even when its original measurement passed.
 * Copy both reports unchanged: failure belongs to the replay, not its source.
 */
export async function retainNestedListReplayFailure(replayPath, sourcePath, retentionRoot, sourceManifest) {
  replayPath = await realpath(replayPath);
  sourcePath = await realpath(sourcePath);
  const {files} = await verifyFailureBundle(sourcePath, sourceManifest);
  const replayBytes = await readFile(replayPath);
  const replay = JSON.parse(replayBytes);
  assert.equal(replay.status, "failed", "retain only failed replays");
  assert.equal(replay.sourcePath, sourcePath);
  assert.equal(replay.sourceSha256, hash(files["measurement.json"]));
  assert.equal(replay.indexSha256, hash(files["bundle/index.html"]));
  assert.deepEqual(replay.bundleAssets, JSON.parse(files["measurement.json"]).bundleAssets);
  files["replay.json"] = replayBytes;
  await mkdir(retentionRoot, {recursive: true});
  const output = await mkdtemp(join(await realpath(retentionRoot), "failure-"));
  await mkdir(join(output, "bundle/assets"), {recursive: true});
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(output, name), bytes, {flag: "wx"});
  const manifest = {version: 1, failureKind: "exact-replay",
    ...(sourceManifest?.diagnosticDerivation === true ? {diagnosticDerivation: true} : {}),
    ...(sourceManifest?.diagnosticDerivationKind !== undefined ? {diagnosticDerivationKind: sourceManifest.diagnosticDerivationKind} : {}),
    originalSourcePath: sourceManifest?.originalSourcePath ?? sourcePath,
    measurementSha256: hash(files["measurement.json"]), indexSha256: hash(files["bundle/index.html"]),
    originalReplayPath: replayPath, replaySourcePath: sourcePath, replaySha256: hash(replayBytes)};
  await writeFile(join(output, "retention.json"), `${JSON.stringify(manifest, null, 2)}\n`, {flag: "wx"});
  await verifyFailureBundle(join(output, "measurement.json"), manifest);
  return output;
}

export async function retainNestedListFailure(sourcePath, retentionRoot) {
  sourcePath = await realpath(sourcePath);
  const {source, files} = await verifyFailureBundle(sourcePath);
  assert.equal(source.status, "failed", "retain only failed measurements");
  await mkdir(retentionRoot, {recursive: true});
  const output = await mkdtemp(join(await realpath(retentionRoot), "failure-"));
  await mkdir(join(output, "bundle/assets"), {recursive: true});
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(output, name), bytes, {flag: "wx"});
  const manifest = {version: 1, originalSourcePath: sourcePath,
    measurementSha256: hash(files["measurement.json"]), indexSha256: hash(files["bundle/index.html"])};
  await writeFile(join(output, "retention.json"), `${JSON.stringify(manifest, null, 2)}\n`, {flag: "wx"});
  await verifyFailureBundle(join(output, "measurement.json"), manifest);
  return output;
}
