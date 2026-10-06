// Local delivery experiment, not a publishing command or approved package layout.
// Stages private tarballs and an external consumer; never runs package prepack/build.
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cp, mkdir, mkdtemp, readFile, readdir, realpath, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {gzipSync} from "node:zlib";
import {build, preview} from "vite";
import {chromium, firefox, webkit} from "playwright-core";
import {checkNestedListDeclarations} from "./check-nested-list-declarations.mjs";

assert.equal(process.argv.length, 3, "usage: node scripts/check-experimental-nested-list-packages.mjs <qualified-candidate>");
const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const target = join(repository, "target");
assert.equal(await realpath(target), target, "target must not be redirected");
const candidate = await realpath(resolve(repository, process.argv[2]));
assert.ok(relative(target, candidate).length > 0 && !relative(target, candidate).startsWith(`..${sep}`) && relative(target, candidate) !== "..", "candidate must be beneath target");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const qualification = JSON.parse(await readFile(join(candidate, "qualification.json"), "utf8"));
assert.equal(qualification.status, "passed"); assert.equal(qualification.feature, "experimental-nested-lists");
assert.equal(hash(await readFile(join(candidate, "breditor_wasm_bg.wasm"))), qualification.wasmSha256);
const declarations = await readFile(join(candidate, "breditor_wasm.d.ts"), "utf8");
assert.equal(hash(declarations), qualification.declarationsSha256);
checkNestedListDeclarations(await readFile(join(repository, "crates/breditor-wasm/api/breditor_wasm.d.ts"), "utf8"), declarations);
const files = async path => (await Promise.all((await readdir(path, {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))
  .map(async entry => entry.isDirectory() ? (await files(join(path, entry.name))).map(file => join(entry.name, file)) : [entry.name]))).flat();
const tree = async path => Object.fromEntries(await Promise.all((await files(path)).map(async name => [name, hash(await readFile(join(path, name)))])));
const shippingPaths = ["packages/breditor-browser/dist", "packages/breditor-wasm/dist", "packages/breditor-reference-highlight/dist", "examples/react/dist"];
const before = await Promise.all(shippingPaths.map(path => tree(join(repository, path))));
const staging = await mkdtemp(join(target, "nested-list-packages-"));
const consumer = await mkdtemp(join(await realpath(tmpdir()), "breditor-nested-list-consumer-"));
console.log(JSON.stringify({staging, consumer}));
const run = (command, args, cwd = repository) => {
  const result = spawnSync(command, args, {cwd, encoding: "utf8", env: {...process.env, npm_config_offline: "true"}, maxBuffer: 10 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.error ?? result.stderr}\n${result.stdout}`);
  return result.stdout;
};
const browserStage = join(staging, "browser"), wasmStage = join(staging, "wasm");
await mkdir(browserStage); await mkdir(wasmStage);
let server;
try {
  for (const [name, destination] of [["breditor-browser", browserStage], ["breditor-wasm", wasmStage]]) {
    const source = join(repository, "packages", name);
    const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
    delete manifest.scripts; delete manifest.publishConfig;
    manifest.private = true; manifest.breditorExperimental = "nested-list-delivery-probe-not-for-publication";
    await writeFile(join(destination, "package.json"), JSON.stringify(manifest, null, 2));
    for (const entry of manifest.files.filter(name => name !== "dist")) await cp(join(source, entry), join(destination, entry), {recursive: true});
  }
  const tsc = join(repository, "node_modules/typescript/bin/tsc");
  run(process.execPath, [tsc, "-p", "packages/breditor-browser/tsconfig.json", "--declaration", "false", "--removeComments", "--outDir", join(browserStage, "dist")]);
  run(process.execPath, [tsc, "-p", "packages/breditor-browser/tsconfig.json", "--emitDeclarationOnly", "--outDir", join(browserStage, "dist")]);
  await cp(join(repository, "packages/breditor-wasm/dist"), join(wasmStage, "dist"), {recursive: true});
  for (const name of ["breditor_wasm.js", "breditor_wasm.d.ts", "breditor_wasm_bg.wasm", "breditor_wasm_bg.wasm.d.ts"]) {
    await cp(join(candidate, name), join(wasmStage, "dist", name));
  }
  const archives = join(staging, "tarballs"); await mkdir(archives);
  const pack = (directory, breditor = false) => {
    const result = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", archives], directory))[0];
    if (breditor) assert.ok(result.files.every(file => !file.path.endsWith(".d.ts.map") && !file.path.includes(".test.")), "Breditor must not ship test sources or declaration maps");
    return {path: join(archives, result.filename), bytes: result.size, unpackedBytes: result.unpackedSize, fileCount: result.files.length};
  };
  const browserPackage = pack(browserStage, true), wasmPackage = pack(wasmStage, true);
  const parse5Package = pack(join(repository, "node_modules/parse5"));
  const entitiesPackage = pack(join(repository, "node_modules/entities"));
  await cp(join(repository, "scripts/fixtures/nested-list-consumer"), consumer, {recursive: true});
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline",
    browserPackage.path, wasmPackage.path, parse5Package.path, entitiesPackage.path], consumer);
  for (const name of ["@breditor/browser", "@breditor/wasm", "parse5", "entities"]) {
    const installed = join(consumer, "node_modules", name);
    assert.equal(await realpath(installed), installed, "consumer must not use workspace symlinks");
  }
  assert.equal(hash(await readFile(join(consumer, "node_modules/@breditor/wasm/dist/breditor_wasm_bg.wasm"))), qualification.wasmSha256);
  for (const name of ["browser", "wasm"]) {
    assert.equal(JSON.parse(await readFile(join(consumer, `node_modules/@breditor/${name}/package.json`), "utf8")).private, true);
  }
  assert.deepEqual(await tree(join(consumer, "node_modules/@breditor/browser/dist")), await tree(join(browserStage, "dist")));
  run(process.execPath, [tsc, "-p", join(consumer, "tsconfig.json")], consumer);
  await build({configFile: false, root: consumer, logLevel: "warn", build: {
    outDir: join(consumer, "bundle"), target: "es2022", modulePreload: {polyfill: false}, emptyOutDir: false,
  }});
  server = await preview({configFile: false, root: consumer, logLevel: "warn", build: {outDir: join(consumer, "bundle")},
    preview: {host: "127.0.0.1", port: 0, strictPort: true}});
  const address = server.httpServer.address(); assert.ok(address && typeof address !== "string");
  const browserRuns = [];
  for (const [name, type] of Object.entries({chromium, firefox, webkit})) {
    const browser = await type.launch();
    let page;
    const errors = [];
    try {
      page = await browser.newPage(); page.on("pageerror", error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.waitForFunction(() => document.getElementById("result")?.hasAttribute("data-status"), undefined, {timeout: 15000});
      const result = await page.locator("#result").getAttribute("data-status");
      assert.equal(result, "passed", await page.locator("#result").textContent()); assert.deepEqual(errors, []);
      browserRuns.push({browser: name, version: browser.version(), status: result});
    } catch (error) {
      // Preserve the failing engine and page state before teardown. A later
      // successful run must not erase or stand in for this failed qualification.
      let fixtureState;
      try {
        fixtureState = {url: page?.url(), result: await page?.locator("#result").textContent({timeout: 1000})};
      } catch (snapshotError) { fixtureState = {snapshotError: String(snapshotError)}; }
      const failure = {status: "failed", candidate, staging, consumer, browser: name,
        version: browser.version(), error: String(error), errors, fixtureState, completedBrowserRuns: browserRuns};
      await writeFile(join(staging, "failed-browser.json"), JSON.stringify(failure, null, 2) + "\n");
      console.error(JSON.stringify(failure));
      throw error;
    } finally { await browser.close(); }
  }
  const sums = async (directory, suffix) => (await Promise.all((await files(directory)).filter(file => file.endsWith(suffix)).map(async file => (await readFile(join(directory, file))).length))).reduce((a,b) => a+b, 0);
  const jsAssets = (await files(join(consumer, "bundle"))).filter(file => file.endsWith(".js"));
  const js = await Promise.all(jsAssets.map(file => readFile(join(consumer, "bundle", file))));
  const baseConsumer = join(consumer, "base");
  await cp(join(repository, "scripts/fixtures/npm-consumer"), baseConsumer, {recursive: true});
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline",
    browserPackage.path, wasmPackage.path, parse5Package.path, entitiesPackage.path], baseConsumer);
  run(process.execPath, [tsc, "-p", join(baseConsumer, "tsconfig.json")], baseConsumer);
  run(process.execPath, [join(baseConsumer, "smoke.mjs")], baseConsumer);
  await build({configFile: false, root: baseConsumer, logLevel: "warn", build: {
    outDir: join(baseConsumer, "bundle"), target: "es2022", modulePreload: {polyfill: false}, emptyOutDir: false,
  }});
  run(process.execPath, [join(repository, "scripts/check-consumer-browser.mjs"), join(baseConsumer, "bundle")]);
  const browserJavaScriptBytes = await sums(join(browserStage, "dist"), ".js");
  const browserDeclarationsBytes = await sums(join(browserStage, "dist"), ".d.ts");
  const report = {status: "passed", publishable: false, candidate, staging, consumer, browserRuns,
    diagnosticNames: qualification.diagnosticNames === true,
    browserPackage, wasmPackage, browserJavaScriptBytes, browserDeclarationsBytes,
    tarballSha256: {browser: hash(await readFile(browserPackage.path)), wasm: hash(await readFile(wasmPackage.path))},
    baseConsumer: "Existing Node import, strict TypeScript and Chromium initialization/format/content/teardown smoke passed against these same installed experimental artifacts",
    defaultCeilingComparisons: [
      {label: "browser JavaScript", actual: browserJavaScriptBytes, maximum: 1085000},
      {label: "browser declarations", actual: browserDeclarationsBytes, maximum: 276000},
      {label: "browser tarball", actual: browserPackage.bytes, maximum: 270000},
      {label: "Wasm tarball", actual: wasmPackage.bytes, maximum: 525000},
    ].map(value => ({...value, withinDefaultCeiling: value.actual <= value.maximum})),
    consumerJavaScriptBytes: js.reduce((sum, bytes) => sum+bytes.length, 0),
    consumerJavaScriptGzip9Bytes: js.reduce((sum, bytes) => sum+gzipSync(bytes, {level:9}).length, 0),
    sizeBudgetQualified: false, shippingArtifactsWritten: false,
    shippingArtifactTreeSha256: Object.fromEntries(shippingPaths.map((path, index) => [path, hash(JSON.stringify(before[index]))])),
    boundary: "Private staged tarballs of current source and experimental Wasm, external offline consumer, no repository imports or aliases. Not an approved optional shipping package, native-input qualification or complete release gate."};
  for (let i=0; i<shippingPaths.length; i++) assert.deepEqual(await tree(join(repository, shippingPaths[i])), before[i], `${shippingPaths[i]} changed`);
  await writeFile(join(staging, "qualification.json"), JSON.stringify(report, null, 2)+"\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (server) await new Promise((resolveClose, rejectClose) => server.httpServer.close(error => error ? rejectClose(error) : resolveClose()));
  for (let i=0; i<shippingPaths.length; i++) assert.deepEqual(await tree(join(repository, shippingPaths[i])), before[i], `${shippingPaths[i]} changed`);
  // Retain exact tarballs, external consumer and any failure artifacts for inspection.
}
