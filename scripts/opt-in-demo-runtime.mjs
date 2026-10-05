// Admission and module-graph assertions for the installed opt-in demo runtime.
import assert from "node:assert/strict";
import {readFile, realpath} from "node:fs/promises";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {readQualifiedPair, sha256, tree} from "./build-opt-in-flat-list-package.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));

export async function loadOptInConsumer(source) {
  assert.equal(typeof source, "string", "Set BREDITOR_OPT_IN_CONSUMER_RECORD to a passed consumer-qualification.json");
  const root = await realpath(repository), target = join(root, "target");
  assert.equal(await realpath(target), target);
  const path = await realpath(resolve(root, source));
  const local = relative(target, path);
  assert.ok(local !== ".." && !local.startsWith(`..${sep}`) && !local.startsWith(sep), "Consumer record must be under repository target");
  const report = JSON.parse(await readFile(path, "utf8"));
  assert.equal(report.status, "passed");
  assert.equal(report.nodeAndTypes, "passed");
  assert.equal(report.publishable, false);
  assert.deepEqual(report.browserRuns.map(run => [run.browser, run.status]), [["chromium", "passed"], ["firefox", "passed"], ["webkit", "passed"]]);
  const assemblyPath = await realpath(report.assembly);
  assert.equal(dirname(assemblyPath), dirname(path));
  const assembly = JSON.parse(await readFile(assemblyPath, "utf8"));
  assert.equal(assembly.status, "assembled-not-consumer-qualified");
  assert.equal(assembly.publishable, false);
  assert.equal(assembly.sha256, report.archiveSha256);
  assert.equal(sha256(await readFile(assembly.archive)), assembly.sha256);
  assert.equal(sha256(await readFile(assembly.inputRecord)), assembly.inputRecordSha256);
  await readQualifiedPair(assembly.inputRecord);
  const installed = join(await realpath(report.consumer), "node_modules/@breditor/experimental-flat-lists");
  assert.equal(await realpath(installed), installed);
  assert.equal(sha256(JSON.stringify(await tree(installed))), assembly.packageTreeSha256, "Installed opt-in package changed since qualification");
  const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
  assert.equal(manifest.name, "@breditor/experimental-flat-lists");
  assert.equal(manifest.version, assembly.version);
  assert.equal(manifest.private, true);
  const wasmSha256 = sha256(await readFile(join(installed, "dist/wasm/breditor_wasm_bg.wasm")));
  return {installed, archiveSha256: assembly.sha256, wasmSha256, recordPath: path};
}

/** Reject accidental mixed ownership graphs; this observes, never rewrites code. */
export function assertOptInRuntimeModules(ids, repository, installed) {
  const normalize = path => path.replaceAll("\\", "/");
  repository = normalize(repository);
  installed = normalize(installed);
  const modules = [...ids].map(id => normalize(id.split("?")[0]));
  const forbidden = ["packages/breditor-browser/", "packages/breditor-wasm/"].map(path => `${repository}/${path}`);
  for (const id of modules) {
    assert.ok(!forbidden.some(prefix => id.startsWith(prefix)), `Workspace editor runtime leaked into opt-in demo: ${id}`);
    if (id.endsWith("/browser_editor.js")) assert.equal(id, `${installed}/dist/browser/browser_editor.js`, "Demo used another browser owner");
    if (id.endsWith("/breditor_wasm.js")) assert.equal(id, `${installed}/dist/wasm/breditor_wasm.js`, "Demo used another Wasm engine");
  }
  assert.ok(modules.includes(`${installed}/dist/browser/browser_editor.js`), "Installed browser owner missing");
  assert.ok(modules.includes(`${installed}/dist/wasm/breditor_wasm.js`), "Installed Wasm module missing");
  return modules.filter(id => id.startsWith(`${installed}/`)).map(id => id.slice(installed.length + 1)).sort();
}
