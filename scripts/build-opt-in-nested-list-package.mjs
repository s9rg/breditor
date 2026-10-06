// Assemble an explicitly requested opt-in archive from a qualified private pair.
// Never writes default package outputs, rebuilds Wasm, or publishes anything.
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cp, mkdir, mkdtemp, readFile, readdir, realpath, writeFile} from "node:fs/promises";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

/** Fail closed on delivery policy or a version/dependency mismatch. */
export function validateOptInManifest(manifest, browser, wasm) {
  assert.equal(manifest.name, "@breditor/experimental-nested-lists");
  assert.equal(manifest.private, true, "Publication is not authorized");
  assert.equal(manifest.version, browser.version);
  assert.equal(manifest.version, wasm.version);
  assert.equal(browser.peerDependencies?.["@breditor/wasm"], wasm.version);
  assert.deepEqual(manifest.dependencies, browser.dependencies);
  assert.equal(manifest.peerDependencies, undefined, "The opt-in engine must be bundled, not peer-resolved");
  assert.deepEqual(manifest.scripts, {prepack: "node ../../scripts/refuse-unassembled-nested-list-package.mjs"}, "Only the unassembled-package guard is allowed; no implicit workspace build");
}

/** Deterministic identities reject redirected files in the qualified inputs. */
export async function tree(path) {
  const entries = [];
  for (const entry of (await readdir(path, {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))) {
    assert.ok(entry.isDirectory() || entry.isFile(), `Non-regular artifact: ${join(path, entry.name)}`);
    entries.push([entry.name, entry.isDirectory() ? await tree(join(path, entry.name)) : sha256(await readFile(join(path, entry.name)))]);
  }
  return entries;
}

/** Only admitted experimental pairs can seed this separately named package. */
export async function readQualifiedPair(recordPath) {
  const root = await realpath(repository), target = await realpath(join(root, "target"));
  assert.equal(target, join(root, "target"));
  const path = await realpath(resolve(root, recordPath));
  const local = relative(target, path);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`) && !local.startsWith(sep), "Record must be under repository target");
  const record = JSON.parse(await readFile(path, "utf8"));
  assert.equal(record.status, "passed");
  assert.equal(record.publishable, false);
  assert.equal(record.diagnosticNames, false, "Do not package diagnostic Wasm");
  const staging = dirname(path);
  assert.equal(await realpath(record.staging), staging);
  const consumer = await realpath(record.consumer);
  for (const name of ["browser", "wasm"]) {
    const archive = await realpath(record[`${name}Package`].path);
    assert.equal(dirname(archive), join(staging, "tarballs"));
    assert.equal(sha256(await readFile(archive)), record.tarballSha256[name], `Qualified ${name} archive changed`);
    const installed = join(consumer, "node_modules/@breditor", name, "dist");
    assert.equal(await realpath(installed), installed);
    assert.deepEqual(await tree(installed), await tree(join(staging, name, "dist")), `Qualified ${name} installation changed`);
  }
  const candidate = JSON.parse(await readFile(join(record.candidate, "qualification.json"), "utf8"));
  assert.equal(candidate.status, "passed");
  assert.equal(candidate.feature, "experimental-nested-lists");
  const wasm = join(staging, "wasm/dist");
  assert.equal(sha256(await readFile(join(wasm, "breditor_wasm_bg.wasm"))), candidate.wasmSha256);
  assert.equal(sha256(await readFile(join(wasm, "breditor_wasm.d.ts"))), candidate.declarationsSha256);
  return {record, path, staging};
}

export async function buildOptInPackage(recordPath) {
  const {record, path, staging} = await readQualifiedPair(recordPath);
  const source = join(repository, "packages/breditor-experimental-nested-lists");
  const json = async path => JSON.parse(await readFile(path, "utf8"));
  const manifest = await json(join(source, "package.json"));
  validateOptInManifest(manifest, await json(join(staging, "browser/package.json")), await json(join(staging, "wasm/package.json")));
  const shipping = ["packages/breditor-browser/dist", "packages/breditor-wasm/dist", "packages/breditor-reference-highlight/dist", "examples/react/dist"];
  const before = await Promise.all(shipping.map(p => tree(join(repository, p))));
  const directory = await mkdtemp(join(repository, "target/nested-list-opt-in-"));
  const packageDirectory = join(directory, "package");
  await mkdir(packageDirectory);
  try {
    const {scripts: _guard, ...assembledManifest} = manifest;
    await writeFile(join(packageDirectory, "package.json"), JSON.stringify(assembledManifest, null, 2) + "\n");
    for (const file of ["index.js", "index.d.ts", "wasm.d.ts", "README.md"]) await cp(join(source, file), join(packageDirectory, file));
    for (const name of ["LICENSE", "LICENSE-MIT", "LICENSE-APACHE"]) await cp(join(repository, name), join(packageDirectory, name));
    for (const name of ["THIRD_PARTY_NOTICES.md", "third-party"]) await cp(join(repository, "packages/breditor-wasm", name), join(packageDirectory, name), {recursive: true});
    await mkdir(join(packageDirectory, "dist"));
    await cp(join(staging, "browser/dist"), join(packageDirectory, "dist/browser"), {recursive: true});
    await mkdir(join(packageDirectory, "dist/wasm"));
    for (const name of ["breditor_wasm.js", "breditor_wasm.d.ts", "breditor_wasm_bg.wasm", "breditor_wasm_bg.wasm.d.ts"]) {
      await cp(join(staging, "wasm/dist", name), join(packageDirectory, "dist/wasm", name));
    }
    const packed = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", directory], {cwd: packageDirectory, encoding: "utf8"});
    assert.equal(packed.status, 0, packed.stderr);
    const info = JSON.parse(packed.stdout)[0];
    assert.ok(info.files.every(f => !f.path.endsWith(".d.ts.map") && !f.path.includes(".test.")));
    const archive = join(directory, info.filename);
    const result = {status: "assembled-not-consumer-qualified", publishable: false,
      name: manifest.name, version: manifest.version, directory, packageDirectory, archive,
      sha256: sha256(await readFile(archive)), bytes: info.size, unpackedBytes: info.unpackedSize,
      packageTreeSha256: sha256(JSON.stringify(await tree(packageDirectory))),
      inputRecord: path, inputRecordSha256: sha256(await readFile(path)),
      inputTarballSha256: record.tarballSha256,
      sizeBudgetQualified: false, shippingArtifactsWritten: false};
    await writeFile(join(directory, "assembly.json"), JSON.stringify(result, null, 2) + "\n");
    return result;
  } finally {
    for (let i=0; i<shipping.length; i++) assert.deepEqual(await tree(join(repository, shipping[i])), before[i], `${shipping[i]} changed`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, "usage: node scripts/build-opt-in-nested-list-package.mjs <private-package-qualification.json>");
  console.log(JSON.stringify(await buildOptInPackage(process.argv[2]), null, 2));
}
