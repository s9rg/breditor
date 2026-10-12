// Replay retained browser bytes, not a rebuilt/instrumented approximation.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile, readdir, realpath, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, relative, resolve} from "node:path";
import {preview} from "vite";
import {webkit} from "playwright-core";
import {fileURLToPath} from "node:url";
import {verifyFailureBundle, retainNestedListReplayFailure} from "./retain-nested-list-failure.mjs";
import {FIXTURE_COMPLETION_POLLING_MS, readFixtureFailureState, waitForFixtureCompletion, waitForTerminalFixtureCompletion} from "./fixture-completion.mjs";
import {webkitReplayTier} from "./webkit-replay-tier.mjs";

assert.equal(process.argv.length, 3, "usage: node scripts/replay-nested-list-performance.mjs <retained measurement.json>");
const replayTier = webkitReplayTier(process.env);
const sourcePath = await realpath(resolve(process.argv[2]));
const temporaryRoot = await realpath(tmpdir());
const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const durable = /^(?:failure|trace)-[a-zA-Z0-9]+\/measurement\.json$/u.test(relative(join(repository, "target/nested-list-reproductions"), sourcePath));
const manifest = durable ? JSON.parse(await readFile(join(dirname(sourcePath), "retention.json"))) : undefined;
if (!durable) assert.match(relative(temporaryRoot, sourcePath), /^breditor-nested-list-consumer-[a-zA-Z0-9]+\/(?:performance|getter-probe)-[a-zA-Z0-9]+\/measurement\.json$/u);
await verifyFailureBundle(sourcePath, manifest);
const sourceBytes = await readFile(sourcePath);
const source = JSON.parse(sourceBytes);
if (!durable && dirname(sourcePath).split("/").at(-1).startsWith("getter-probe-")) {
  assert.equal(source.fixtureKind, "nested-getter-probe", "getter path requires its explicit fixture kind");
}
assert.ok(source.browserName === "webkit" || (source.browserName === "all" &&
  source.measurements?.some(run => run.browser === "webkit" && run.status === "failed")),
"replay requires a WebKit run or a failed WebKit measurement from an all-engine run");
if (!durable) assert.equal(source.fixture, dirname(sourcePath));
assert.ok(Number.isSafeInteger(source.ownerRepetitions) && source.ownerRepetitions >= 3 && source.ownerRepetitions <= 30);
const bundle = join(dirname(sourcePath), "bundle");
assert.equal(await realpath(bundle), bundle);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const verifyAssets = async () => {
  const assets = join(bundle, "assets");
  assert.deepEqual((await readdir(assets)).sort(), Object.keys(source.bundleAssets).sort());
  for (const [name, expected] of Object.entries(source.bundleAssets)) {
    assert.match(name, /^[a-zA-Z0-9_.-]+$/u);
    const path = join(assets, name);
    assert.equal(await realpath(path), path);
    assert.equal(hash(await readFile(path)), expected, `retained asset changed: ${name}`);
  }
};
await verifyAssets();
const output = await mkdtemp(join(dirname(sourcePath), "exact-replay-"));
const report = {status: "running", sourcePath, sourceSha256: hash(sourceBytes),
  javaScriptTierMode: replayTier.mode, requestedJavaScriptTierOverrides: replayTier.overrides,
  tierOverrideEffectVerified: false,
  sourceDiagnosticDerivation: source.retainedLayoutDerivation ?? null,
  fixtureCompletionPollingMs: FIXTURE_COMPLETION_POLLING_MS,
  bundleAssets: source.bundleAssets, indexSha256: hash(await readFile(join(bundle, "index.html"))),
  rebuilt: false, addedInstrumentation: false, releaseQualified: false, runs: []};
const save = () => writeFile(join(output, "replay.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({output}));
await save();
const server = await preview({configFile: false, root: dirname(sourcePath),
  build: {outDir: bundle}, preview: {host: "127.0.0.1", port: 0, strictPort: true}});
try {
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  for (let run = 0; run < 10; run++) {
    let browser;
    let page;
    const result = {run, status: "running", diagnostics: [], pageErrors: []};
    report.runs.push(result);
    try {
      browser = await webkit.launch({env: replayTier.browserEnvironment});
      result.version = browser.version();
      page = await browser.newPage({viewport: {width: 1280, height: 960}});
      page.on("console", message => {if (message.type() === "error" && result.diagnostics.length < 100) result.diagnostics.push(message.text());});
      page.on("pageerror", error => {if (result.pageErrors.length < 100) result.pageErrors.push(String(error));});
      await page.goto(`http://127.0.0.1:${address.port}/?editTarget=${source.editTarget ?? "root"}`);
      if (source.fixtureKind === "nested-getter-probe") await waitForTerminalFixtureCompletion(page);
      else await waitForFixtureCompletion(page);
      const element = page.locator("#result");
      result.fixtureStatus = await element.getAttribute("data-status");
      result.fixtureOutput = await element.textContent();
      assert.equal(result.fixtureStatus, "passed", result.fixtureOutput);
      const fixtureResult = JSON.parse(result.fixtureOutput);
      if (source.fixtureKind === "nested-getter-probe") assert.equal(fixtureResult.owners, String(3 * source.ownerRepetitions));
      else assert.equal(fixtureResult.cases.length, 3 * source.ownerRepetitions);
      assert.deepEqual(result.pageErrors, []);
      result.status = "passed";
    } catch (error) {
      result.status = "failed";
      result.error = String(error);
      try {result.fixtureState = await readFixtureFailureState(page);}
      catch (snapshotError) {result.fixtureState = {snapshotError: String(snapshotError)};}
    } finally {await browser?.close(); await save();}
    console.log(JSON.stringify({run, status: result.status, diagnostics: result.diagnostics}));
    if (result.status === "failed") break;
  }
  await verifyAssets();
  await verifyFailureBundle(sourcePath, manifest);
  assert.equal(hash(await readFile(join(bundle, "index.html"))), report.indexSha256);
  report.status = report.runs.every(run => run.status === "passed") ? "passed" : "failed";
  await save();
  if (report.status === "failed") {
    if (!durable) {
      const retained = await retainNestedListReplayFailure(join(output, "replay.json"), sourcePath,
        join(repository, "target/nested-list-reproductions"));
      console.log(JSON.stringify({retained}));
    }
    process.exitCode = 1;
  }
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  await save();
  throw error;
} finally {await new Promise(resolveClose => server.httpServer.close(resolveClose));}
