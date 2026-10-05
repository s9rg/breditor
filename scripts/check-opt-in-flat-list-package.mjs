// Install the opt-in archive outside the workspace and exercise its public API.
// Keep failed consumers/reports for inspection; no aliases or shipping rebuilds.
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {cp, mkdtemp, readFile, realpath, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {build, preview} from "vite";
import {chromium, firefox, webkit} from "playwright-core";
import {readQualifiedPair, sha256, tree} from "./build-opt-in-flat-list-package.mjs";

assert.equal(process.argv.length, 3, "usage: node scripts/check-opt-in-flat-list-package.mjs <assembly.json>");
const repository = fileURLToPath(new URL("../", import.meta.url));
const assemblyPath = await realpath(resolve(repository, process.argv[2]));
const assembly = JSON.parse(await readFile(assemblyPath, "utf8"));
assert.equal(assembly.status, "assembled-not-consumer-qualified");
assert.equal(assembly.publishable, false);
assert.equal(await realpath(assembly.directory), dirname(assemblyPath));
assert.equal(sha256(await readFile(assembly.archive)), assembly.sha256);
assert.equal(sha256(JSON.stringify(await tree(assembly.packageDirectory))), assembly.packageTreeSha256);
assert.equal(sha256(await readFile(assembly.inputRecord)), assembly.inputRecordSha256);
const {staging} = await readQualifiedPair(assembly.inputRecord);
const consumer = await mkdtemp(join(await realpath(tmpdir()), "breditor-opt-in-consumer-"));
const run = (command, args) => {
  const result = spawnSync(command, args, {cwd: consumer, encoding: "utf8", env: {...process.env, npm_config_offline: "true"}, maxBuffer: 4 * 1024 * 1024});
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};
await cp(join(repository, "scripts/fixtures/flat-list-consumer"), consumer, {recursive: true});
const mainPath = join(consumer, "main.ts");
const original = await readFile(mainPath, "utf8");
assert.equal(original.split('from "@breditor/browser"').length, 2);
assert.equal(original.split('from "@breditor/wasm"').length, 2);
await writeFile(mainPath, original
  .replace('import { BreditorBrowserEditor } from "@breditor/browser";', 'import { BreditorBrowserEditor, FLAT_LIST_TOOLBAR_MANIFEST, preflightFlatListWasmSemanticProfile, type BreditorFlatListBrowserEditorOptions } from "@breditor/experimental-flat-lists";')
  .replace('from "@breditor/wasm"', 'from "@breditor/experimental-flat-lists/wasm"')
  .replace('Parameters<typeof BreditorBrowserEditor.openFlatLists>[0]', 'BreditorFlatListBrowserEditorOptions')
  .replace('const text = (value: string)', 'const checked = preflightFlatListWasmSemanticProfile(wasm, semanticProfile);\n  if (!checked.ok) throw new Error(checked.error.code);\n  equal(checked.profileDescriptor.schema.fingerprint, fingerprint);\n  const text = (value: string)')
  .replace('toolbar: {host: document.getElementById("toolbar")!}', 'toolbar: {host: document.getElementById("toolbar")!, manifest: FLAT_LIST_TOOLBAR_MANIFEST}'));
const runs = [];
let server;
try {
  const dependencyArchive = async name => {
    const manifest = JSON.parse(await readFile(join(repository, "node_modules", name, "package.json"), "utf8"));
    return join(staging, "tarballs", `${name}-${manifest.version}.tgz`);
  };
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", assembly.archive,
    await dependencyArchive("parse5"), await dependencyArchive("entities")]);
  const installed = join(consumer, "node_modules/@breditor/experimental-flat-lists");
  assert.equal(await realpath(installed), installed, "No workspace link allowed");
  assert.deepEqual(await tree(installed), await tree(assembly.packageDirectory));
  run(process.execPath, [join(repository, "node_modules/typescript/bin/tsc"), "-p", join(consumer, "tsconfig.json")]);
  // Assert entry-point identity and actual Node Wasm initialization as well as
  // browser startup. No engine from the default packages participates.
  await writeFile(join(consumer, "node-smoke.mjs"), `
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {BreditorBrowserEditor, BREDITOR_BROWSER_PACKAGE_VERSION} from "@breditor/experimental-flat-lists";
import {BreditorBrowserEditor as advancedEditor} from "@breditor/experimental-flat-lists/advanced";
import {initSync, breditorVersion, BreditorCompiledProfile} from "@breditor/experimental-flat-lists/wasm";
assert.equal(BreditorBrowserEditor, advancedEditor);
initSync({module: await readFile(new URL(import.meta.resolve("@breditor/experimental-flat-lists/wasm-binary")))});
assert.equal(breditorVersion(), BREDITOR_BROWSER_PACKAGE_VERSION);
assert.equal(typeof BreditorCompiledProfile.fromBootstrapJsonV4, "function");
assert.throws(() => import.meta.resolve("@breditor/experimental-flat-lists/dist/browser/browser_editor.js"));
console.log("Node opt-in imports, identity, engine and export boundaries passed");
`);
  run(process.execPath, [join(consumer, "node-smoke.mjs")]);
  await build({configFile: false, root: consumer, logLevel: "warn", build: {outDir: join(consumer, "bundle"), target: "es2022", modulePreload: {polyfill: false}}});
  server = await preview({configFile: false, root: consumer, logLevel: "warn", build: {outDir: join(consumer, "bundle")}, preview: {host: "127.0.0.1", port: 0, strictPort: true}});
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  for (const [name, type] of Object.entries({chromium, firefox, webkit})) {
    const browser = await type.launch();
    const errors = [];
    let page;
    try {
      page = await browser.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${address.port}/`);
      await page.waitForFunction(() => document.getElementById("result")?.hasAttribute("data-status"), undefined, {timeout: 15000});
      assert.equal(await page.locator("#result").getAttribute("data-status"), "passed", await page.locator("#result").textContent());
      assert.deepEqual(errors, []);
      runs.push({browser: name, version: browser.version(), status: "passed"});
    } catch (error) {
      runs.push({browser: name, version: browser.version(), status: "failed", error: String(error), errors});
      throw error;
    } finally { await browser.close(); }
  }
  const report = {status: "passed", assembly: assemblyPath, archiveSha256: assembly.sha256, consumer,
    nodeAndTypes: "passed", browserRuns: runs, publishable: false, sizeBudgetQualified: false,
    boundary: "External installed single-package consumer; list conversion, Undo, V6 restore and Redo. Not native-input qualification or a complete release gate."};
  await writeFile(join(assembly.directory, "consumer-qualification.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await writeFile(join(assembly.directory, "consumer-failure.json"), JSON.stringify({status: "failed", consumer, runs, error: String(error)}, null, 2) + "\n");
  throw error;
} finally {
  if (server) await new Promise((done, fail) => server.httpServer.close(error => error ? fail(error) : done()));
}
