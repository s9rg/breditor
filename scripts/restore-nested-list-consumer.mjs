// Restore exact retained library bytes into a NEW consumer, never old reports.
// The consumer fixture/bundle is current and rebuilt: not the lost failed bundle.
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {cp, mkdir, mkdtemp, readFile, realpath, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {basename, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {build, preview} from "vite";
import {chromium, firefox, webkit} from "playwright-core";
import {exactTree, hashBytes, verifyRetainedPair} from "./retained-nested-pair.mjs";
import {waitForFixtureCompletion} from "./fixture-completion.mjs";

assert.equal(process.argv.length, 3, "usage: node scripts/restore-nested-list-consumer.mjs <retained package qualification.json>");
const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const target = join(repository, "target");
const sourcePath = await realpath(resolve(process.argv[2]));
const original = await verifyRetainedPair(sourcePath, target);
const staging = await mkdtemp(join(target, "nested-list-restored-"));
const consumer = await mkdtemp(join(await realpath(tmpdir()), "breditor-nested-list-consumer-"));
console.log(JSON.stringify({staging, consumer}));
const tarballs = join(staging, "tarballs");
await mkdir(tarballs);
const dependencyHashes = {};
const dependencyArchives = [];
for (const name of ["parse5-8.0.1.tgz", "entities-8.0.0.tgz"]) {
  const source = join(original.record.staging, "tarballs", name);
  assert.equal(await realpath(source), source);
  const bytes = await readFile(source);
  dependencyHashes[name] = hashBytes(bytes);
  const destination = join(tarballs, name);
  await cp(source, destination);
  dependencyArchives.push(destination);
}
const packages = {};
for (const name of ["browser", "wasm"]) {
  await cp(join(original.record.staging, name), join(staging, name), {recursive: true});
  assert.deepEqual(await exactTree(join(staging, name)), original.trees[name]);
  const path = join(tarballs, basename(original.archives[name]));
  await cp(original.archives[name], path);
  assert.equal(hashBytes(await readFile(path)), original.record.tarballSha256[name]);
  packages[name] = {...original.record[`${name}Package`], path};
}
const run = (command, args, cwd = consumer) => {
  const result = spawnSync(command, args, {cwd, encoding: "utf8", env: {...process.env, npm_config_offline: "true"}, maxBuffer: 10 * 1024 * 1024});
  assert.equal(result.status, 0, `${command} failed: ${result.error ?? result.stderr}\n${result.stdout}`);
};
const install = directory => run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", packages.browser.path, packages.wasm.path, ...dependencyArchives], directory);
const tsc = join(repository, "node_modules/typescript/bin/tsc");
const bundle = root => build({configFile: false, root, logLevel: "warn", build: {
  outDir: join(root, "bundle"), target: "es2022", modulePreload: {polyfill: false}, emptyOutDir: false,
}});
await cp(join(repository, "scripts/fixtures/nested-list-consumer"), consumer, {recursive: true});
install(consumer);
for (const name of ["browser", "wasm"]) {
  const installed = join(consumer, `node_modules/@breditor/${name}`);
  assert.equal(await realpath(installed), installed);
  assert.equal(JSON.parse(await readFile(join(installed, "package.json"))).private, true);
  assert.deepEqual(await exactTree(join(installed, "dist")), await exactTree(join(staging, name, "dist")));
}
run(process.execPath, [tsc, "-p", join(consumer, "tsconfig.json")]);
await bundle(consumer);
let server;
const browserRuns = [];
try {
  server = await preview({configFile: false, root: consumer, logLevel: "warn", build: {outDir: join(consumer, "bundle")}, preview: {host: "127.0.0.1", port: 0, strictPort: true}});
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  for (const [name, type] of Object.entries({chromium, firefox, webkit})) {
    const browser = await type.launch();
    const errors = [];
    try {
      const page = await browser.newPage();
      page.on("pageerror", error => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await waitForFixtureCompletion(page, 15000);
      assert.equal(await page.locator("#result").getAttribute("data-status"), "passed", await page.locator("#result").textContent());
      assert.deepEqual(errors, []);
      browserRuns.push({browser: name, version: browser.version(), status: "passed"});
    } catch (error) {
      await writeFile(join(staging, "failed-browser.json"), JSON.stringify({browser: name, error: String(error), errors, browserRuns}, null, 2));
      throw error;
    } finally {await browser.close();}
  }
} finally {if (server) await new Promise(done => server.httpServer.close(done));}
const base = join(consumer, "base");
await cp(join(repository, "scripts/fixtures/npm-consumer"), base, {recursive: true});
install(base);
run(process.execPath, [tsc, "-p", join(base, "tsconfig.json")], base);
run(process.execPath, [join(base, "smoke.mjs")], base);
await bundle(base);
run(process.execPath, [join(repository, "scripts/check-consumer-browser.mjs"), join(base, "bundle")], repository);
assert.deepEqual(await verifyRetainedPair(sourcePath, target), original, "original retained pair changed");
for (const [name, expected] of Object.entries(dependencyHashes)) {
  assert.equal(hashBytes(await readFile(join(original.record.staging, "tarballs", name))), expected);
  assert.equal(hashBytes(await readFile(join(tarballs, name))), expected);
}
const report = {...original.record, staging, consumer, browserRuns,
  browserPackage: packages.browser, wasmPackage: packages.wasm,
  restoredFrom: sourcePath, restoredFromSha256: original.reportSha256,
  dependencyArchiveSha256: dependencyHashes,
  fixtureSha256: hashBytes(await readFile(join(consumer, "main.ts"))),
  rebuiltLibraries: false, rebuiltConsumerBundle: true, historicalFailureBundleRestored: false,
  nativeQualificationTransferred: false, shippingArtifactsWritten: false,
  boundary: "Exact retained private library archives installed offline into a new consumer and qualified against the current fixture. The consumer bundle is rebuilt; this does NOT restore the lost historical failed bundle or its report. No release qualification or publication.",
};
// These fields measured the original temporary consumer, not this rebuilt one.
delete report.consumerJavaScriptBytes;
delete report.consumerJavaScriptGzip9Bytes;
delete report.shippingArtifactTreeSha256;
await writeFile(join(staging, "qualification.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
