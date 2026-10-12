// Reproducible measurements of already-qualified installed experimental packages.
// No hard timing threshold: correctness is mandatory, timing is machine-specific evidence.
// BREDITOR_PERF_BROWSER selects all/Chromium/Firefox/WebKit (lowercase names).
// BREDITOR_PERF_RUNS=1..10 repeats fresh browser sessions, three owners per size.
// BREDITOR_PERF_EDIT_TARGET=root|grandchild selects the edited depth (default root).
// WebKit-only BREDITOR_PERF_QUEUE_DIAGNOSTICS=1 captures terminal queue/router
// failures in a disposable bundle. Diagnostic runs are not timing evidence.
// Diagnostic owner churn is bounded to 30 owners per size; ordinary runs use 3.
// BREDITOR_PERF_STRESS=1 admits 4..30 owners with no package instrumentation.
// Explicit stress verifies correctness, not ordinary latency or release budgets.
// Chromium/Firefox CPU profiling is diagnostic-only; rendering traces and scheduling remain guarded off.
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cp, mkdtemp, readFile, readdir, realpath, writeFile} from "node:fs/promises";
import {tmpdir, platform, arch, cpus} from "node:os";
import {dirname, join, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {build, preview} from "vite";
import {chromium, firefox, webkit} from "playwright-core";
import {summarizeRenderingTrace} from "./rendering-trace-summary.mjs";
import {summarizeGeckoProfile} from "./gecko-profile-summary.mjs";
import {instrumentQueueFailures, instrumentRouterFailures, instrumentOwnerFailures, instrumentProjectionUpdateFailures, instrumentProjectionValidationSites, instrumentFixtureProgress, repeatPerformanceOwners, schedulePerformanceSelection} from "./queue-failure-diagnostics.mjs";
import {installExceptionConstructorProbe} from "./exception-constructor-probe.mjs";
import {retainNestedListFailure} from "./retain-nested-list-failure.mjs";
import {FIXTURE_COMPLETION_POLLING_MS, readFixtureFailureState, waitForFixtureCompletion} from "./fixture-completion.mjs";
import {instrumentElementTypeReturn} from "./element-type-return-diagnostics.mjs";
import {nestedListStressMode, uninstrumentedNestedStressPlugin} from "./nested-list-stress-mode.mjs";
import {tree as artifactTree} from "./build-opt-in-nested-list-package.mjs";
import {instrumentNestedParagraphResults, instrumentParagraphComparison} from "./queue-failure-diagnostics.mjs";
import {stringKeyHeadingComparison} from "./heading-comparison-trial.mjs";
import {instrumentContentSnapshotComparison,instrumentDocumentExportRead,instrumentDocumentPropertyComparison} from "./document-export-diagnostics.mjs";
import {instrumentFormatPropertyComparison} from "./queue-failure-diagnostics.mjs";
import {instrumentIntegerWordDecode,instrumentProjectedIntegerTuple} from "./integer-word-diagnostics.mjs";

assert.ok(process.argv.length === 3, "usage: node scripts/measure-nested-list-performance.mjs <packed-consumer-qualification.json>");
const diagnoseExport = process.argv[3] === "--diagnose-export";
const coreOnly = process.argv[3] === "--core-only";
const browserName = process.env["BREDITOR_PERF_BROWSER"] ?? "all";
const editTarget = process.env["BREDITOR_PERF_EDIT_TARGET"] ?? "root";
const formattedFlag = process.env["BREDITOR_PERF_FORMATTED"] ?? "0";
assert.ok(["0", "1"].includes(formattedFlag), "invalid formatted stress flag");
const formatted = formattedFlag === "1";
const propertyFlag = process.env["BREDITOR_PERF_PROPERTY_FORMATS"] ?? "0";
assert.ok(["0", "1"].includes(propertyFlag), "invalid property format flag");
const propertyFormats = propertyFlag === "1";
assert.ok(!propertyFormats || formatted, "property formats require formatted workload");
const integerFlag = process.env["BREDITOR_PERF_INTEGER_FORMATS"] ?? "0";
assert.ok(["0", "1"].includes(integerFlag), "invalid integer format flag");
const integerFormats = integerFlag === "1";
assert.ok(!integerFormats || propertyFormats, "integer formats require property workload");
assert.ok(["root", "grandchild"].includes(editTarget), "invalid BREDITOR_PERF_EDIT_TARGET");
assert.ok(["all", "chromium", "firefox", "webkit"].includes(browserName), "invalid BREDITOR_PERF_BROWSER");
const cpuProfileEnabled = process.env["BREDITOR_PERF_CPU_PROFILE"] === "1";
assert.ok(!cpuProfileEnabled || browserName === "chromium", "CPU profiling requires BREDITOR_PERF_BROWSER=chromium");
const geckoProfileEnabled = process.env["BREDITOR_PERF_FIREFOX_PROFILE"] === "1";
assert.ok(!geckoProfileEnabled || (browserName === "firefox" && !coreOnly && !diagnoseExport && !cpuProfileEnabled),
  "Firefox profiling requires Firefox full-editor mode without CPU/export diagnostics");
const renderingTraceEnabled = process.env["BREDITOR_PERF_RENDER_TRACE"] === "1";
assert.ok(!renderingTraceEnabled || (browserName === "chromium" && !cpuProfileEnabled && !coreOnly && !diagnoseExport),
  "Rendering trace requires Chromium full-editor mode without CPU/export diagnostics");
const runCount = Number(process.env["BREDITOR_PERF_RUNS"] ?? "1");
assert.ok(Number.isSafeInteger(runCount) && runCount >= 1 && runCount <= 10, "BREDITOR_PERF_RUNS must be 1..10");
const deepDiagnostics = process.env["BREDITOR_EXPORT_DEEP_DIAGNOSTICS"] === "1";
assert.ok(!deepDiagnostics || diagnoseExport, "deep diagnostics require --diagnose-export");
const queueDiagnosticsEnabled = process.env["BREDITOR_PERF_QUEUE_DIAGNOSTICS"] === "1";
const headingTrialFlag = process.env["BREDITOR_PERF_HEADING_STRING_TRIAL"] ?? "0";
assert.ok(["0", "1"].includes(headingTrialFlag), "invalid heading trial flag");
const headingStringTrial = headingTrialFlag === "1";
assert.ok(!headingStringTrial || (browserName === "webkit" && !queueDiagnosticsEnabled && !cpuProfileEnabled && !geckoProfileEnabled && !renderingTraceEnabled), "heading trial requires isolated WebKit mode");
assert.equal(process.env["BREDITOR_QUEUE_DIAGNOSTICS"], undefined, "use BREDITOR_PERF_QUEUE_DIAGNOSTICS");
const paragraphFlag = process.env["BREDITOR_PERF_PARAGRAPH_DIAGNOSTICS"] ?? "0";
assert.ok(["0", "1"].includes(paragraphFlag), "invalid paragraph diagnostic flag");
const paragraphDiagnosticsEnabled = paragraphFlag === "1";
assert.ok(!paragraphDiagnosticsEnabled || queueDiagnosticsEnabled, "paragraph diagnostics require queue diagnostics");
const blockTypeCallMarkerValue = process.env["BREDITOR_PERF_BLOCK_CALL_MARKER"] ?? "1";
assert.ok(["0", "1"].includes(blockTypeCallMarkerValue), "invalid block call marker mode");
assert.ok(blockTypeCallMarkerValue === "1" || queueDiagnosticsEnabled, "disabling the block call marker requires queue diagnostics");
const blockTypeCallMarker = blockTypeCallMarkerValue === "1";
const constructorProbeEnabled = process.env["BREDITOR_PERF_EXCEPTION_PROBE"] === "1";
const wordCandidateFlag=process.env.BREDITOR_PERF_WORD_CANDIDATE??"0";
assert.ok(["0","1"].includes(wordCandidateFlag));const wordCandidate=wordCandidateFlag==="1";
assert.ok(!headingStringTrial || !wordCandidate, "heading trial cannot combine with copied word Wasm mode");
assert.ok(!headingStringTrial || !constructorProbeEnabled, "heading trial cannot combine with constructor probe");
assert.ok(!wordCandidate||(!coreOnly&&!diagnoseExport&&!cpuProfileEnabled&&!geckoProfileEnabled&&!renderingTraceEnabled&&!constructorProbeEnabled&&!queueDiagnosticsEnabled),"word candidate cannot combine with other instrumentation");
assert.ok(!queueDiagnosticsEnabled || (browserName === "webkit" && !coreOnly && !diagnoseExport && !cpuProfileEnabled && !geckoProfileEnabled && !renderingTraceEnabled),
  "queue diagnostics require WebKit full-editor mode without other instrumentation");
assert.ok(!constructorProbeEnabled || (browserName === "webkit" && !coreOnly && !diagnoseExport && !cpuProfileEnabled && !geckoProfileEnabled && !renderingTraceEnabled && !queueDiagnosticsEnabled),
  "exception constructor probe requires WebKit full-editor mode without other instrumentation");
const stressMode = nestedListStressMode({flag: process.env["BREDITOR_PERF_STRESS"] ?? "0",
  owners: process.env["BREDITOR_PERF_OWNER_REPETITIONS"] ?? "3", browser: browserName,
  diagnostics: queueDiagnosticsEnabled,
  otherInstrumentation: coreOnly || diagnoseExport || cpuProfileEnabled || geckoProfileEnabled || renderingTraceEnabled || constructorProbeEnabled});
const ownerRepetitions = stressMode.count;
// Diagnostic task ordering, not a normal selection latency measurement.
const selectionScheduling = process.env["BREDITOR_PERF_SELECTION_SCHEDULING"] ?? "synchronous";
assert.ok(!renderingTraceEnabled &&
  !constructorProbeEnabled && ownerRepetitions <= 30 && selectionScheduling === "synchronous",
  "Nested runs support ordinary measurements, Chromium/Firefox CPU profiles or bounded WebKit queue diagnostics only");
assert.ok(["synchronous", "focus-task", "native-selection"].includes(selectionScheduling) &&
  (selectionScheduling === "synchronous" || queueDiagnosticsEnabled),
  "selection scheduling requires queue diagnostics and a known mode");
const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const recordPath = await realpath(resolve(repository, process.argv[2]));
const local = relative(join(repository, "target"), recordPath);
assert.ok(local.length > 0 && !local.startsWith(`..${sep}`) && local !== "..", "qualification must be inside target");
const record = JSON.parse(await readFile(recordPath, "utf8"));
assert.equal(record.status, "passed"); assert.equal(record.publishable, false);
const consumer = await realpath(record.consumer), temporaryRoot = await realpath(tmpdir());
assert.match(relative(temporaryRoot, consumer), /^breditor-nested-list-consumer-[a-zA-Z0-9]+$/u);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const tree = async root => {
  const result = {};
  for (const name of (await readdir(root)).sort()) result[name] = hash(await readFile(join(root, name)));
  return result;
};
for (const name of ["browser", "wasm"]) {
  const archive = await realpath(record[`${name}Package`].path);
  assert.equal(dirname(archive), join(dirname(recordPath), "tarballs"));
  assert.equal(hash(await readFile(archive)), record.tarballSha256[name]);
  const installed = join(consumer, `node_modules/@breditor/${name}`);
  assert.equal(await realpath(installed), installed);
  assert.equal(JSON.parse(await readFile(join(installed, "package.json"), "utf8")).private, true);
}
assert.deepEqual(await tree(join(consumer, "node_modules/@breditor/browser/dist")), await tree(join(dirname(recordPath), "browser/dist")));
for (const name of ["breditor_wasm.js", "breditor_wasm_bg.wasm", "breditor_wasm.d.ts"]) {
  assert.equal(hash(await readFile(join(consumer, "node_modules/@breditor/wasm/dist", name))),
    hash(await readFile(join(dirname(recordPath), "wasm/dist", name))));
}
const fixture = await mkdtemp(join(consumer, "performance-"));
await cp(join(repository, coreOnly ? "scripts/fixtures/nested-list-core-performance" : "scripts/fixtures/nested-list-performance"), fixture, {recursive: true});
await cp(join(consumer, "tsconfig.json"), join(fixture, "tsconfig.json"));
await cp(join(consumer, "package.json"), join(fixture, "package.json"));
let privateWordWasmTree;
if(wordCandidate){
  const source=join(repository,"target/nested-child-count-words/pkg");
  assert.equal(await realpath(source),source);
  const destination=join(fixture,"private-word-wasm");await cp(source,destination,{recursive:true});
  privateWordWasmTree=await artifactTree(destination);
  const declarations=await readFile(join(destination,"breditor_wasm.d.ts"),"utf8");
  for(const name of ["childCountWords","childAtWords","formatCountWords","formatPropertyCountWords","headingLevelWords","orderedListStartWords"])assert.ok(declarations.includes(name+"("),"missing word scalar: "+name);
  const adapter=await readFile(join(repository,"scripts/private-word-projection-adapter.mjs"),"utf8");
  assert.equal(adapter.split('./fixtures/nested-getter-probe/word-count.js').length,2);
  await writeFile(join(fixture,"word-adapter.mjs"),adapter.replace('./fixtures/nested-getter-probe/word-count.js','./word-count.js'));
  await cp(join(repository,"scripts/fixtures/nested-getter-probe/word-count.js"),join(fixture,"word-count.js"));
  await writeFile(join(fixture,"word-adapter.d.mts"),'export function installPrivateWordProjectionAdapter(api: {BreditorProjection: {prototype: object}}): () => void;\n');
  const mainPath=join(fixture,"main.ts"),main=await readFile(mainPath,"utf8");
  assert.equal(main.split('from "@breditor/wasm"').length,2);
  assert.equal(main.split('await initialize();').length,2);
  await writeFile(mainPath,'import {installPrivateWordProjectionAdapter} from "./word-adapter.mjs";\n'+main.replace('from "@breditor/wasm"','from "./private-word-wasm/breditor_wasm.js"').replace('await initialize();','await initialize(); installPrivateWordProjectionAdapter(wasm);'));
}
const types = spawnSync(process.execPath, [join(repository, "node_modules/typescript/bin/tsc"), "-p", join(fixture, "tsconfig.json")], {encoding: "utf8"});
assert.equal(types.status, 0, `${types.stdout}\n${types.stderr}`);
// Diagnostic transforms affect only this disposable bundle, never the installed
// artifacts. Report rejection sites without logging document/user payloads.
const diagnosticPlugin = {name: "document-export-rejection-sites", transform(code, id) {
  if (!id.startsWith(join(consumer, "node_modules/@breditor/browser/dist/"))) return;
  if (id.endsWith("/wasm_document_json.js") && deepDiagnostics) {
    const names = ["documentJsonUtf8Bytes", "documentJsonMatchesNestedListProjection", "documentTextBlockMatches", "readDocument", "validDocument", "durableDocumentRootMatchesContract"];
    let active = false;
    let functionName;
    const lines = code.split("\n");
    return lines.map((line, index) => {
      const match = /^(?:export )?function (\w+)\(/u.exec(line);
      if (match) { functionName = match[1]; active = names.includes(match[1]); }
      if (!active) return line;
      const label = JSON.stringify(`document export rejection: wasm_document_json.js:${index + 1}`);
      const rank = functionName === "documentTextBlockMatches" &&
        (lines[index - 1]?.includes("if (level !== projectedBlock?.headingLevel)") ||
          lines[index - 1]?.includes("if (!OBJECT_IS(level, projectedBlock?.headingLevel))"))
        ? ", JSON.stringify({documentLevel: level, documentType: typeof level, projectedLevel: projectedBlock?.headingLevel, projectedType: typeof projectedBlock?.headingLevel})" : "";
      return line.replace(/return (false|null|boundaryFailure\(\));/gu, (_, value) => `return (console.error(${label}${rank}), ${value});`);
    }).join("\n");
  }
  if (id.endsWith("/wasm_command_adapter.js")) {
    const from = code.indexOf("    #readDocumentJson() {"), to = code.indexOf("    #readPlainText() {", from);
    assert.ok(from >= 0 && to > from, "document reader diagnostic anchors");
    for (const anchor of ["return consumed.ok &&", "? invalidWasmDocumentJsonReadResult()", "catch {"]) {
      assert.equal(code.slice(from, to).split(anchor).length, 2, `document reader diagnostic drift: ${anchor}`);
    }
    const section = code.slice(from, to).replace("return consumed.ok &&", "if (!consumed.ok) console.error('document export: consumer rejected');\n            return consumed.ok &&")
      .replace("? invalidWasmDocumentJsonReadResult()", "? (console.error('document export: projection mismatch'), invalidWasmDocumentJsonReadResult())")
      .replace("catch {", "catch { console.error('document export: exception');");
    return code.slice(0, from) + section + code.slice(to);
  }
}};
let queueDiagnosticModules = 0;
let projectionDiagnosticModules = 0;
const validationDiagnosticModules = new Set();
let routerDiagnosticModules = 0;
let ownerDiagnosticModules = 0;
let elementTypeDiagnosticModules = 0;
let stressFixtureModules = 0;
let selectionFixtureModules = 0;
let progressFixtureModules = 0;
const queueDiagnosticPlugin = {name: "queue-failure-diagnostics", enforce: "pre", transform(code, id) {
  if (integerFormats && id === join(consumer, "node_modules/@breditor/browser/dist/projection_scalar_words.js")) {
    return instrumentIntegerWordDecode(code);
  }
  if (id === join(consumer, "node_modules/@breditor/browser/dist/wasm_document_json.js")) {
    return instrumentDocumentPropertyComparison(code);
  }
  if (paragraphDiagnosticsEnabled && id === join(consumer, "node_modules/@breditor/browser/dist/projection.js")) {
    return instrumentFormatPropertyComparison(instrumentParagraphComparison(code, "strict", {failureCapture: true}));
  }
  if (id === join(consumer, "node_modules/@breditor/wasm/dist/breditor_wasm.js")) {
    elementTypeDiagnosticModules++;
    return instrumentElementTypeReturn(code);
  }
  for (const name of ["wasm_projection_adapter", "nested_list_projection_update"]) {
    if (id === join(consumer, `node_modules/@breditor/browser/dist/${name}.js`)) {
      assert.ok(!validationDiagnosticModules.has(name), "duplicate validation transform");
      validationDiagnosticModules.add(name);
      let diagnosed = instrumentProjectionValidationSites(code, name, {blockTypeCallMarker});
      if (integerFormats && name === "wasm_projection_adapter") diagnosed = instrumentProjectedIntegerTuple(diagnosed, {captureBeforeString: true});
      return paragraphDiagnosticsEnabled && name === "nested_list_projection_update"
        ? instrumentNestedParagraphResults(diagnosed) : diagnosed;
    }
  }
  if (id === join(consumer, "node_modules/@breditor/browser/dist/wasm_command_adapter.js")) {
    projectionDiagnosticModules++;
    return instrumentDocumentExportRead(instrumentProjectionUpdateFailures(code));
  }
  if (id === join(consumer, "node_modules/@breditor/browser/dist/browser_event_router.js")) {
    routerDiagnosticModules++;
    return instrumentRouterFailures(code);
  }
  if (id === join(consumer, "node_modules/@breditor/browser/dist/browser_editor.js")) {
    ownerDiagnosticModules++;
    return instrumentContentSnapshotComparison(instrumentOwnerFailures(code));
  }
  if (id === join(consumer, "node_modules/@breditor/browser/dist/command_queue.js")) {
    queueDiagnosticModules++;
    return instrumentQueueFailures(code);
  }
  if (id === join(fixture, "main.ts")) {
    progressFixtureModules++;
    code = instrumentFixtureProgress(code);
    if (ownerRepetitions !== 3) {
      stressFixtureModules++;
      code = repeatPerformanceOwners(code, ownerRepetitions);
    }
    if (selectionScheduling !== "synchronous") {
      selectionFixtureModules++;
      code = schedulePerformanceSelection(code, selectionScheduling);
    }
    return code;
  }
}};
const stressPlugin = uninstrumentedNestedStressPlugin(fixture, ownerRepetitions, () => stressFixtureModules++);
let headingTrialModules = 0;
const headingTrialPlugin = {name: "private-heading-string-trial", enforce: "pre", transform(code, id) {
  if (id !== join(consumer, "node_modules/@breditor/browser/dist/projection.js")) return undefined;
  headingTrialModules++;
  return stringKeyHeadingComparison(code);
}};
await build({configFile: false, root: fixture, logLevel: "warn", plugins: [...(diagnoseExport ? [diagnosticPlugin] : queueDiagnosticsEnabled ? [queueDiagnosticPlugin] : stressMode.enabled ? [stressPlugin] : []), ...(headingStringTrial ? [headingTrialPlugin] : [])], build: {outDir: join(fixture, "bundle"), emptyOutDir: false, minify: !cpuProfileEnabled && !geckoProfileEnabled, target: "es2022", modulePreload: {polyfill: false}}});
assert.equal(headingTrialModules, headingStringTrial ? 1 : 0);
assert.equal(queueDiagnosticModules, queueDiagnosticsEnabled ? 1 : 0, "queue diagnostic module was not transformed exactly once");
assert.equal(projectionDiagnosticModules, queueDiagnosticsEnabled ? 1 : 0, "projection diagnostic module was not transformed exactly once");
assert.equal(validationDiagnosticModules.size, queueDiagnosticsEnabled ? 2 : 0, "validation diagnostic modules were not transformed exactly once");
assert.equal(routerDiagnosticModules, queueDiagnosticsEnabled ? 1 : 0, "router diagnostic module was not transformed exactly once");
assert.equal(ownerDiagnosticModules, queueDiagnosticsEnabled ? 1 : 0, "owner diagnostic module was not transformed exactly once");
assert.equal(elementTypeDiagnosticModules, queueDiagnosticsEnabled ? 1 : 0, "element type diagnostic module was not transformed exactly once");
assert.equal(progressFixtureModules, queueDiagnosticsEnabled ? 1 : 0, "progress fixture was not transformed exactly once");
assert.equal(stressFixtureModules, ownerRepetitions === 3 ? 0 : 1, "stress fixture was not transformed exactly once");
assert.equal(selectionFixtureModules, selectionScheduling === "synchronous" ? 0 : 1, "selection fixture was not transformed exactly once");
const server = await preview({configFile: false, root: fixture, logLevel: "warn", build: {outDir: join(fixture, "bundle")}, preview: {host: "127.0.0.1", port: 0, strictPort: true}});
const measurements = [];
const output = join(fixture, "measurement.json");
const save = async status => {
  if(wordCandidate)assert.deepEqual(await artifactTree(join(fixture,"private-word-wasm")),privateWordWasmTree,"private word Wasm changed during qualification");
  return writeFile(output, JSON.stringify({status, diagnosticInstrumentation: headingStringTrial || wordCandidate || diagnoseExport || queueDiagnosticsEnabled || constructorProbeEnabled || cpuProfileEnabled || geckoProfileEnabled, headingStringTrial, queueDiagnosticsEnabled, paragraphDiagnosticsEnabled, constructorProbeEnabled, releasePerformanceQualified: false,
  wordCandidate,privateWordWasmTree,installedPackedWasmUsed:!wordCandidate,
  routerDiagnosticsEnabled: queueDiagnosticsEnabled,
  uninstrumentedStressEnabled: stressMode.enabled && !wordCandidate && !headingStringTrial,
  ownerStressEnabled: stressMode.enabled,
  ownerDiagnosticsEnabled: queueDiagnosticsEnabled,
  blockTypeCallMarkerEnabled: queueDiagnosticsEnabled && blockTypeCallMarker,
  diagnosticWasmNames: record.diagnosticNames === true,
  measurementScope: coreOnly ? "raw-core-abi-no-editor-dom" : "browser-owner-with-editor-dom",
  fixtureCompletionPollingMs: FIXTURE_COMPLETION_POLLING_MS,
  liveFixtureProgress: queueDiagnosticsEnabled,
  deepDiagnostics, browserName, runCount, ownerRepetitions, selectionScheduling, editTarget, formatted, propertyFormats, integerFormats,
  selectionTimingIncludesTaskWaits: selectionScheduling !== "synchronous",
  cpuProfileEnabled, geckoProfileEnabled, renderingTraceEnabled, profileBuild: cpuProfileEnabled || geckoProfileEnabled ? "unminified" : null, bundleAssets: await tree(join(fixture, "bundle/assets")),
  fixtureSha256: hash(await readFile(join(fixture, "main.ts"))),
  packageRecord: recordPath, fixture, tarballSha256: record.tarballSha256,
  environment: {platform: platform(), arch: arch(), cpu: cpus()[0]?.model}, measurements,
  methodology: wordCandidate ? `Private word-transport integration experiment. Installed qualified packed browser runtime, copied unqualified word Wasm and prototype adapter, minified disposable consumer. ${ownerRepetitions} owners per size, edit target ${editTarget}. Exact document/selection and redo recovery assertions retained. Not ordinary latency, a fully packed Wasm candidate, native input or release qualification.` : coreOnly
    ? "One 5-item warm-up followed by three independent raw engines at each of 10/100/500 ordered items, every tenth item a heading, identical text to the DOM fixture. Installed packed Wasm, production bundle, headless browser, no editor DOM or browser owner. Raw synchronous calls include observation acquisition/disposal but exclude returned-handle inspection/disposal, except JSON exports which include takeValue and disposal. Action-state cold, exact-hit and post-edit refresh measured separately with full status/revision assertions. Commands pass false for history-group closure and do not call the result's projectionUpdate() readback; projection handle acquisition is a separate span, not full node readback or DOM rendering. Profile compilation once per process, no autosave/layout. Exact document/selection and undo/reload/redo assertions outside spans. Diagnostic decomposition, not an additive subtraction from browser timings or release performance qualification."
    : `One 5-item warm-up followed by ${ownerRepetitions} independent editor owners at each of 10/100/500 ordered root items, every tenth item a heading with a bullet-list child and ordered-list grandchild, about 75 UTF-16 units per root item. Edit target: ${editTarget}. Installed packed artifacts, production bundle, 1280x960 headless browser. Wall-clock spans include a forced layout read. Selection scheduling: ${selectionScheduling}; nondefault selection spans include task waits and are not comparable latency measurements. No autosave. Full selection, document and redo recovery assertions outside measured spans; initialization fetch/compile measured once separately. Nondefault owner count is diagnostic same-page churn, not normal timing. Not OS input, statistical p95, memory or multi-device performance qualification.`,
}, null, 2)+"\n");};
console.log(JSON.stringify({output}));
await save("running");
try {
  const address = server.httpServer.address(); assert.ok(address && typeof address !== "string");
  for (const [name, type] of Object.entries({chromium, firefox, webkit})) {
    if (browserName !== "all" && name !== browserName) continue;
    for (let run = 0; run < runCount; run++) {
    let browser;
    let page;
    let failureStage = "browserLaunch";
    let fixtureWaitStartedWallMs;
    let fixtureWaitFinishedWallMs;
    const diagnostics = [];
    const pageErrors = [];
    let cpuSession;
    let cpuProfile;
    let geckoProfile;
    let exceptionProbe;
    const captureExceptionProbe = async () => {
      if (!constructorProbeEnabled || exceptionProbe) return;
      exceptionProbe = await page.evaluate(() => {
        const snapshot = globalThis.__breditorExceptionProbeSnapshot();
        // Only after completion/failure, and after copying application evidence:
        // verify this browser really observes constructed-and-caught errors.
        let controlCaught = false;
        try { throw new TypeError("breditor-exception-probe-control"); }
        catch (error) { controlCaught = error instanceof TypeError; }
        const control = globalThis.__breditorExceptionProbeSnapshot().records.at(-1);
        return {...snapshot, controlPassed: controlCaught && control?.constructor === "TypeError" && control?.message === "breditor-exception-probe-control"};
      });
      assert.equal(exceptionProbe.controlPassed, true, "exception probe positive control failed");
    };
    const geckoProfilePath = join(fixture, `${name}-${run}.gecko-profile.json`);
    const captureGeckoProfile = async () => {
      if (!geckoProfileEnabled || geckoProfile) return;
      // Gecko writes the multiprocess profile on clean shutdown. No extension,
      // persistent browser preference or external upload is involved. Preserve
      // raw identity before analysis; profiles may contain local URLs/paths.
      await browser?.close();
      const bytes = await readFile(geckoProfilePath);
      geckoProfile = {path: geckoProfilePath, sha256: hash(bytes)};
      Object.assign(geckoProfile, summarizeGeckoProfile(JSON.parse(bytes.toString("utf8"))));
      assert.equal(geckoProfile.spans.length, 60, "six operation spans for warm-up plus nine cases");
      console.log(JSON.stringify({geckoProfile: {path: geckoProfile.path, sha256: geckoProfile.sha256, spanCount: geckoProfile.spans.length}}));
    };
    let tracing = false;
    let renderingTrace;
    const captureRenderingTrace = async () => {
      if (!tracing) return;
      tracing = false;
      const bytes = await browser.stopTracing();
      const path = join(fixture, `${name}-${run}.rendering-trace.json`);
      await writeFile(path, bytes);
      // Retain the raw artifact identity even if the summary rejects its shape.
      renderingTrace = {path, sha256: hash(bytes)};
      Object.assign(renderingTrace, summarizeRenderingTrace(JSON.parse(bytes.toString("utf8"))));
      console.log(JSON.stringify({renderingTrace: {path, sha256: renderingTrace.sha256, spanCount: renderingTrace.spans.length}}));
    };
    const captureCpuProfile = async () => {
      if (!cpuSession) return;
      const session = cpuSession; cpuSession = undefined;
      const {profile} = await session.send("Profiler.stop");
      const path = join(fixture, `${name}-${run}.cpuprofile`);
      const bytes = JSON.stringify(profile);
      await writeFile(path, bytes);
      const times = new Map();
      for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
        const id = profile.samples[index]; times.set(id, (times.get(id) ?? 0) + profile.timeDeltas[index]);
      }
      // A function may appear under many caller stacks; combine identical frames
      // for self time while retaining the complete call tree in the raw profile.
      const frames = new Map();
      for (const node of profile.nodes) {
        const key = JSON.stringify(node.callFrame);
        const frame = frames.get(key) ?? {function: node.callFrame.functionName,
          line: node.callFrame.lineNumber + 1, selfMs: 0};
        frame.selfMs += (times.get(node.id) ?? 0) / 1000;
        frames.set(key, frame);
      }
      const hottest = [...frames.values()].sort((a, b) => b.selfMs - a.selfMs).slice(0, 25);
      cpuProfile = {path, sha256: hash(bytes), durationMs: (profile.endTime - profile.startTime) / 1000, hottest};
      console.log(JSON.stringify({cpuProfile}));
    };
    try {
      browser = await type.launch(geckoProfileEnabled ? {env: {...process.env,
        MOZ_PROFILER_STARTUP: "1", MOZ_PROFILER_STARTUP_FILTERS: "GeckoMain",
        MOZ_PROFILER_STARTUP_FEATURES: "js,stackwalk,leaf", MOZ_PROFILER_STARTUP_INTERVAL: "1",
        MOZ_PROFILER_SHUTDOWN: geckoProfilePath,
      }} : {});
      failureStage = "pageSetup";
      page = await browser.newPage({viewport: {width: 1280, height: 960}});
      if (constructorProbeEnabled) await page.addInitScript(installExceptionConstructorProbe);
      if (renderingTraceEnabled) {
        await browser.startTracing(page, {screenshots: false,
          categories: ["devtools.timeline", "blink.user_timing"]});
        tracing = true;
      }
      if (cpuProfileEnabled) {
        cpuSession = await page.context().newCDPSession(page);
        await cpuSession.send("Profiler.enable");
        await cpuSession.send("Profiler.setSamplingInterval", {interval: 1000});
        await cpuSession.send("Profiler.start");
      }
      page.on("console", message => { if (message.type() === "error" && diagnostics.length < 100) { diagnostics.push(message.text()); console.error(message.text()); } });
      page.on("pageerror", error => { if (pageErrors.length < 100) pageErrors.push(String(error)); });
      const query = new URLSearchParams({editTarget});
      if (formatted) query.set("formatted", "1");
      if (propertyFormats) query.set("propertyFormats", "1");
      if (integerFormats) query.set("integerFormats", "1");
      if (renderingTraceEnabled || geckoProfileEnabled) query.set("renderTrace", "1");
      failureStage = "pageNavigation";
      await page.goto(`http://127.0.0.1:${address.port}/?${query}`);
      failureStage = "fixtureExecution";
      fixtureWaitStartedWallMs = Date.now();
      await waitForFixtureCompletion(page);
      fixtureWaitFinishedWallMs = Date.now();
      const fixtureWaitElapsedWallMs = fixtureWaitFinishedWallMs - fixtureWaitStartedWallMs;
      failureStage = "fixtureAssertions";
      await captureCpuProfile();
      await captureRenderingTrace();
      await captureExceptionProbe();
      const output = page.locator("#result"), status = await output.getAttribute("data-status");
      assert.equal(status, "passed", await output.textContent());
      assert.deepEqual(pageErrors, [], "uncaught browser errors");
      const results = JSON.parse(await output.textContent()); assert.equal(results.cases.length, 3 * ownerRepetitions);
      assert.ok(results.cases.every(sample => sample.editTarget === editTarget), "fixture edit target mismatch");
      const fixtureProgress = queueDiagnosticsEnabled ? await output.evaluate(element => ({
        progress: element.getAttribute("data-progress"),
        completedCases: element.getAttribute("data-cases-completed"),
        drainTotalMs: element.getAttribute("data-drain-total-ms"),
        drainMaxMs: element.getAttribute("data-drain-max-ms"),
        drainTotalWallMs: element.getAttribute("data-drain-total-wall-ms"),
        workTotalWallMs: element.getAttribute("data-work-total-wall-ms"),
        workLastWallMs: element.getAttribute("data-work-last-wall-ms"),
      })) : undefined;
      if (fixtureProgress) assert.equal(fixtureProgress.completedCases, String(results.cases.length));
      const summary = [10, 100, 500].map(items => {
        const samples = results.cases.filter(sample => sample.items === items);
        assert.equal(samples.length, ownerRepetitions);
        return {items, metrics: Object.fromEntries(Object.keys(samples[0].metrics).map(metric => {
          const values = samples.map(sample => sample.metrics[metric]).sort((a,b) => a-b);
          assert.ok(values.every(value => Number.isFinite(value) && value >= 0), `invalid ${metric} samples`);
          const middle = Math.floor(values.length / 2);
          const median = values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
          return [metric, {min: values[0], median, max: values.at(-1)}];
        }))};
      });
      if (renderingTraceEnabled) assert.equal(renderingTrace.spans.length, 60, "six measured spans for warm-up plus nine cases");
      await captureGeckoProfile();
      const measured = {browser: name, run, version: browser.version(), ...results, summary, diagnostics, cpuProfile, geckoProfile, renderingTrace, exceptionProbe, fixtureWaitElapsedWallMs, fixtureProgress,
        fixtureWaitStartedAt: new Date(fixtureWaitStartedWallMs).toISOString(),
        fixtureWaitFinishedAt: new Date(fixtureWaitFinishedWallMs).toISOString()};
      measurements.push(measured); console.log(JSON.stringify({browser: name, summary}));
      await save("running");
    } catch (error) {
      const failureCaughtWallMs = Date.now();
      try { await captureCpuProfile(); } catch (profileError) { diagnostics.push(String(profileError)); }
      try { await captureRenderingTrace(); } catch (traceError) { diagnostics.push(String(traceError)); }
      try { await captureExceptionProbe(); } catch (probeError) { diagnostics.push(String(probeError)); }
      let fixtureState;
      try {
        // Read completion and payload in one evaluation: separate protocol calls
        // can straddle completion and produce a misleading mixed-time snapshot.
        fixtureState = await readFixtureFailureState(page);
      } catch (snapshotError) { fixtureState = {snapshotError: String(snapshotError)}; }
      try { await captureGeckoProfile(); } catch (profileError) { diagnostics.push(String(profileError)); }
      measurements.push({browser: name, run, version: browser?.version(), status: "failed", failureStage, error: String(error), diagnostics, pageErrors, cpuProfile, geckoProfile, renderingTrace, exceptionProbe, fixtureState,
        fixtureWaitElapsedWallMs: fixtureWaitStartedWallMs === undefined ? undefined : (fixtureWaitFinishedWallMs ?? failureCaughtWallMs) - fixtureWaitStartedWallMs,
        fixtureWaitStartedAt: fixtureWaitStartedWallMs === undefined ? undefined : new Date(fixtureWaitStartedWallMs).toISOString(),
        fixtureWaitFinishedAt: fixtureWaitStartedWallMs === undefined ? undefined : new Date(fixtureWaitFinishedWallMs ?? failureCaughtWallMs).toISOString()});
      await save("failed");
      try {
        const retained = await retainNestedListFailure(output, join(repository, "target/nested-list-reproductions"));
        console.error(JSON.stringify({retained}));
      } catch (retentionError) { console.error("Failure retention failed:", retentionError); }
      throw error;
    } finally {await browser?.close();}
    }
  }
  await save("measured");
} finally {await new Promise((resolveClose, rejectClose) => server.httpServer.close(error => error ? rejectClose(error) : resolveClose()));}
