// Derive a diagnostic copy; never overwrite the failing control or packages.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, realpath, writeFile} from "node:fs/promises";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {verifyFailureBundle} from "./retain-nested-list-failure.mjs";
import {traceRetainedNestedLayout} from "./retained-nested-layout-trace.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

/** Verified failed provenance and a separately hashed, explicitly derived copy. */
export async function prepareRetainedNestedLayoutTrace(sourcePath, retentionRoot) {
  sourcePath = await realpath(sourcePath);
  const controlManifestBytes = await readFile(join(dirname(sourcePath), "retention.json"));
  const controlManifest = JSON.parse(controlManifestBytes);
  const {source, files} = await verifyFailureBundle(sourcePath, controlManifest);
  assert.ok(source.status === "failed" || controlManifest.replaySha256 !== undefined, "trace requires failed provenance");
  assert.equal(source.browserName, "webkit", "trace requires a WebKit control");
  const assets = Object.keys(source.bundleAssets);
  const scripts = assets.filter(name => name.endsWith(".js"));
  assert.equal(scripts.length, 1, "expected one retained script asset");
  const asset = scripts[0], original = files[`bundle/assets/${asset}`];
  const originalCode = original.toString("utf8");
  assert.deepEqual(Buffer.from(originalCode), original, "script is not lossless UTF-8");
  const traced = traceRetainedNestedLayout(originalCode);
  await mkdir(retentionRoot, {recursive: true});
  const output = await mkdtemp(join(await realpath(retentionRoot), "trace-"));
  await mkdir(join(output, "bundle/assets"), {recursive: true});
  const transformed = Buffer.from(traced.code);
  await writeFile(join(output, "bundle/index.html"), files["bundle/index.html"], {flag: "wx"});
  for (const name of assets) await writeFile(join(output, "bundle/assets", name),
    name === asset ? transformed : files[`bundle/assets/${name}`], {flag: "wx"});
  // Keep exact source evidence; do not relabel its failure or measurements.
  await writeFile(join(output, "original-measurement.json"), files["measurement.json"], {flag: "wx"});
  await writeFile(join(output, "original-retention.json"), controlManifestBytes, {flag: "wx"});
  const originalLayout = Buffer.from(originalCode.slice(traced.layout.start, traced.layout.end));
  await writeFile(join(output, "original-layout.js"), originalLayout, {flag: "wx"});
  const derivation = {sourcePath, sourceMeasurementSha256: hash(files["measurement.json"]),
    sourceRetentionSha256: hash(controlManifestBytes), asset, originalAssetSha256: hash(original),
    tracedAssetSha256: hash(transformed), originalLayoutSha256: hash(originalLayout),
    layout: {...traced.layout, tracedEnd: traced.layout.end + traced.code.length - originalCode.length}, sites: traced.sites,
    rebuilt: false, remangled: false, originalControlModified: false};
  const measurement = {...source, status: "prepared-diagnostic-only", fixture: output, measurements: [],
    diagnosticInstrumentation: true, releaseQualified: false, releasePerformanceQualified: false,
    bundleAssets: {...source.bundleAssets, [asset]: hash(transformed)}, retainedLayoutDerivation: derivation};
  const measurementBytes = Buffer.from(`${JSON.stringify(measurement, null, 2)}\n`);
  await writeFile(join(output, "measurement.json"), measurementBytes, {flag: "wx"});
  const manifest = {version: 1, originalSourcePath: join(output, "measurement.json"),
    measurementSha256: hash(measurementBytes), indexSha256: hash(files["bundle/index.html"]),
    diagnosticDerivation: true};
  await writeFile(join(output, "retention.json"), `${JSON.stringify(manifest, null, 2)}\n`, {flag: "wx"});
  await verifyFailureBundle(join(output, "measurement.json"), manifest);
  await verifyFailureBundle(sourcePath, controlManifest);
  return {output, measurementPath: join(output, "measurement.json"), derivation};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "usage: node scripts/prepare-retained-nested-layout-trace.mjs <retained measurement.json>");
  const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
  const root = join(repository, "target/nested-list-reproductions");
  const source = await realpath(resolve(process.argv[2]));
  assert.match(relative(root, source), /^(?:failure|trace)-[a-zA-Z0-9]+\/measurement\.json$/u);
  const result = await prepareRetainedNestedLayoutTrace(source, root);
  console.log(JSON.stringify({output: result.output, measurementPath: result.measurementPath,
    layout: result.derivation.layout, sites: result.derivation.sites.length, rebuilt: false, remangled: false}));
}
