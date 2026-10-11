// Keep exact failed fixture bytes outside macOS's disposable temporary tree.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, readdir, realpath, writeFile} from "node:fs/promises";
import {dirname, join} from "node:path";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

export async function verifyFailureBundle(sourcePath, manifest) {
  const root = dirname(sourcePath);
  const bytes = await readFile(sourcePath);
  const source = JSON.parse(bytes);
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
  return {source, files};
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
