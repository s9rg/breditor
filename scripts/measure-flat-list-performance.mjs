// Reproducible measurements of already-qualified installed experimental packages.
// No hard timing threshold: correctness is mandatory, timing is machine-specific evidence.
// Optional Chromium rendering diagnosis: BREDITOR_PERF_BROWSER=chromium
// BREDITOR_PERF_RENDER_TRACE=1. Keeps minification; raw traces may include local
// URLs and must be inspected before sharing. Not a Firefox performance oracle.
// Optional Firefox native sampling: BREDITOR_PERF_BROWSER=firefox
// BREDITOR_PERF_FIREFOX_PROFILE=1. Unminified disposable fixture, static operation
// marks, local shutdown profile. Diagnostic sample counts, not normal latency.
// Optional WebKit queue failure diagnosis: BREDITOR_PERF_BROWSER=webkit
// BREDITOR_PERF_QUEUE_DIAGNOSTICS=1. Logs bounded caught exceptions only in the
// disposable synthetic fixture; never shipping code or a normal timing result.
// BREDITOR_PERF_OWNER_REPETITIONS=3..100 adds same-page owner churn only with
// queue diagnostics; default ordinary/profiling fixtures stay at three per size.
// BREDITOR_PERF_SELECTION_SCHEDULING=focus-task|native-selection separates focus
// from range installation, optionally awaiting a trusted native selectionchange.
// Requires queue diagnostics; these timings include waits and are not comparable.
// BREDITOR_PERF_EXCEPTION_PROBE=1 instead probes global new Error/TypeError/
// RangeError calls through a page init script while leaving bundle bytes intact.
// It cannot observe every engine-thrown exception or calls without new. Bounded
// messages/stacks are local diagnostic data, not a normal timing result.
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
import {instrumentQueueFailures, instrumentRouterFailures, instrumentProjectionUpdateFailures, instrumentProjectionValidationSites, instrumentParagraphComparison, repeatPerformanceOwners, schedulePerformanceSelection} from "./queue-failure-diagnostics.mjs";
import {installExceptionConstructorProbe} from "./exception-constructor-probe.mjs";

assert.ok(process.argv.length === 3 || (process.argv.length === 4 && ["--diagnose-export", "--core-only"].includes(process.argv[3])), "usage: node scripts/measure-flat-list-performance.mjs <packed-consumer-qualification.json> [--diagnose-export|--core-only]");
const diagnoseExport = process.argv[3] === "--diagnose-export";
const coreOnly = process.argv[3] === "--core-only";
const browserName = process.env["BREDITOR_PERF_BROWSER"] ?? "all";
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
const headingComparison = process.env["BREDITOR_PERF_HEADING_COMPARISON"] ?? "strict";
assert.ok(["strict", "same-value"].includes(headingComparison) &&
  (headingComparison === "strict" || queueDiagnosticsEnabled), "heading comparison variant requires queue diagnostics");
const constructorProbeEnabled = process.env["BREDITOR_PERF_EXCEPTION_PROBE"] === "1";
assert.ok(!queueDiagnosticsEnabled || (browserName === "webkit" && !coreOnly && !diagnoseExport && !cpuProfileEnabled && !geckoProfileEnabled && !renderingTraceEnabled),
  "queue diagnostics require WebKit full-editor mode without other instrumentation");
assert.ok(!constructorProbeEnabled || (browserName === "webkit" && !coreOnly && !diagnoseExport && !cpuProfileEnabled && !geckoProfileEnabled && !renderingTraceEnabled && !queueDiagnosticsEnabled),
  "exception constructor probe requires WebKit full-editor mode without other instrumentation");
const ownerRepetitions = Number(process.env["BREDITOR_PERF_OWNER_REPETITIONS"] ?? "3");
assert.ok(Number.isSafeInteger(ownerRepetitions) && ownerRepetitions >= 3 && ownerRepetitions <= 100 && (ownerRepetitions === 3 || queueDiagnosticsEnabled),
  "owner repetitions must be 3..100 and nondefault counts require queue diagnostics");
// Diagnostic task ordering, not a normal selection latency measurement.
const selectionScheduling = process.env["BREDITOR_PERF_SELECTION_SCHEDULING"] ?? "synchronous";
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
assert.match(relative(temporaryRoot, consumer), /^breditor-flat-list-consumer-[a-zA-Z0-9]+$/u);
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
await cp(join(repository, coreOnly ? "scripts/fixtures/flat-list-core-performance" : "scripts/fixtures/flat-list-performance"), fixture, {recursive: true});
await cp(join(consumer, "tsconfig.json"), join(fixture, "tsconfig.json"));
await cp(join(consumer, "package.json"), join(fixture, "package.json"));
const types = spawnSync(process.execPath, [join(repository, "node_modules/typescript/bin/tsc"), "-p", join(fixture, "tsconfig.json")], {encoding: "utf8"});
assert.equal(types.status, 0, `${types.stdout}\n${types.stderr}`);
// Diagnostic transforms affect only this disposable bundle, never the installed
// artifacts. Report rejection sites without logging document/user payloads.
const diagnosticPlugin = {name: "document-export-rejection-sites", transform(code, id) {
  if (!id.startsWith(join(consumer, "node_modules/@breditor/browser/dist/"))) return;
  if (id.endsWith("/wasm_document_json.js") && deepDiagnostics) {
    const names = ["documentJsonUtf8Bytes", "documentJsonMatchesFlatListProjection", "documentTextBlockMatches", "readDocument", "validDocument", "durableDocumentRootMatchesContract"];
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
let validationDiagnosticModules = 0;
let routerDiagnosticModules = 0;
let stressFixtureModules = 0;
let selectionFixtureModules = 0;
const queueDiagnosticPlugin = {name: "queue-failure-diagnostics", enforce: "pre", transform(code, id) {
  if (id === join(consumer, "node_modules/@breditor/browser/dist/projection.js")) {
    validationDiagnosticModules++;
    return instrumentParagraphComparison(code, headingComparison);
  }
  for (const moduleName of ["wasm_projection_adapter", "flat_list_projection_update"]) {
    if (id === join(consumer, `node_modules/@breditor/browser/dist/${moduleName}.js`)) {
      validationDiagnosticModules++;
      return instrumentProjectionValidationSites(code, moduleName);
    }
  }
  if (id === join(consumer, "node_modules/@breditor/browser/dist/wasm_command_adapter.js")) {
    projectionDiagnosticModules++;
    return instrumentProjectionUpdateFailures(code);
  }
  if (id === join(consumer, "node_modules/@breditor/browser/dist/browser_event_router.js")) {
    routerDiagnosticModules++;
    return instrumentRouterFailures(code);
  }
  if (id === join(consumer, "node_modules/@breditor/browser/dist/command_queue.js")) {
    queueDiagnosticModules++;
    return instrumentQueueFailures(code);
  }
  if (id === join(fixture, "main.ts")) {
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
await build({configFile: false, root: fixture, logLevel: "warn", plugins: diagnoseExport ? [diagnosticPlugin] : queueDiagnosticsEnabled ? [queueDiagnosticPlugin] : [], build: {outDir: join(fixture, "bundle"), emptyOutDir: false, minify: !cpuProfileEnabled && !geckoProfileEnabled, target: "es2022", modulePreload: {polyfill: false}}});
assert.equal(queueDiagnosticModules, queueDiagnosticsEnabled ? 1 : 0, "queue diagnostic module was not transformed exactly once");
assert.equal(projectionDiagnosticModules, queueDiagnosticsEnabled ? 1 : 0, "projection diagnostic module was not transformed exactly once");
assert.equal(validationDiagnosticModules, queueDiagnosticsEnabled ? 3 : 0, "validation diagnostic modules were not transformed exactly once");
assert.equal(routerDiagnosticModules, queueDiagnosticsEnabled ? 1 : 0, "router diagnostic module was not transformed exactly once");
assert.equal(stressFixtureModules, ownerRepetitions === 3 ? 0 : 1, "stress fixture was not transformed exactly once");
assert.equal(selectionFixtureModules, selectionScheduling === "synchronous" ? 0 : 1, "selection fixture was not transformed exactly once");
const server = await preview({configFile: false, root: fixture, logLevel: "warn", build: {outDir: join(fixture, "bundle")}, preview: {host: "127.0.0.1", port: 0, strictPort: true}});
const measurements = [];
const output = join(fixture, "measurement.json");
const save = async status => writeFile(output, JSON.stringify({status, diagnosticInstrumentation: diagnoseExport || queueDiagnosticsEnabled || constructorProbeEnabled, queueDiagnosticsEnabled, constructorProbeEnabled, releasePerformanceQualified: false,
  routerDiagnosticsEnabled: queueDiagnosticsEnabled, headingComparison,
  diagnosticWasmNames: record.diagnosticNames === true,
  measurementScope: coreOnly ? "raw-core-abi-no-editor-dom" : "browser-owner-with-editor-dom",
  deepDiagnostics, browserName, runCount, ownerRepetitions, selectionScheduling,
  selectionTimingIncludesTaskWaits: selectionScheduling !== "synchronous",
  cpuProfileEnabled, geckoProfileEnabled, renderingTraceEnabled, profileBuild: cpuProfileEnabled || geckoProfileEnabled ? "unminified" : null, bundleAssets: await tree(join(fixture, "bundle/assets")),
  fixtureSha256: hash(await readFile(join(fixture, "main.ts"))),
  packageRecord: recordPath, fixture, tarballSha256: record.tarballSha256,
  environment: {platform: platform(), arch: arch(), cpu: cpus()[0]?.model}, measurements,
  methodology: coreOnly
    ? "One 5-item warm-up followed by three independent raw engines at each of 10/100/500 ordered items, every tenth item a heading, identical text to the DOM fixture. Installed packed Wasm, production bundle, headless browser, no editor DOM or browser owner. Raw synchronous calls include observation acquisition/disposal but exclude returned-handle inspection/disposal, except JSON exports which include takeValue and disposal. Action-state cold, exact-hit and post-edit refresh measured separately with full status/revision assertions. Commands pass false for history-group closure and do not call the result's projectionUpdate() readback; projection handle acquisition is a separate span, not full node readback or DOM rendering. Profile compilation once per process, no autosave/layout. Exact document/selection and undo/reload/redo assertions outside spans. Diagnostic decomposition, not an additive subtraction from browser timings or release performance qualification."
    : `One 5-item warm-up followed by ${ownerRepetitions} independent editor owners at each of 10/100/500 ordered items, every tenth item a heading, about 75 UTF-16 units per item. Installed packed artifacts, production bundle, 1280x960 headless browser. Wall-clock spans include a forced layout read. Selection scheduling: ${selectionScheduling}; nondefault selection spans include task waits and are not comparable latency measurements. No autosave. Full selection, document and redo recovery assertions outside measured spans; initialization fetch/compile measured once separately. Nondefault owner count is diagnostic same-page churn, not normal timing. Not OS input, statistical p95, memory or multi-device performance qualification.`,
}, null, 2)+"\n");
console.log(JSON.stringify({output}));
await save("running");
try {
  const address = server.httpServer.address(); assert.ok(address && typeof address !== "string");
  for (const [name, type] of Object.entries({chromium, firefox, webkit})) {
    if (browserName !== "all" && name !== browserName) continue;
    for (let run = 0; run < runCount; run++) {
    let browser;
    let page;
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
      await page.goto(`http://127.0.0.1:${address.port}/${renderingTraceEnabled || geckoProfileEnabled ? "?renderTrace=1" : ""}`);
      await page.waitForFunction(() => document.getElementById("result")?.hasAttribute("data-status"), undefined, {timeout: 180000});
      await captureCpuProfile();
      await captureRenderingTrace();
      await captureExceptionProbe();
      const output = page.locator("#result"), status = await output.getAttribute("data-status");
      assert.equal(status, "passed", await output.textContent());
      assert.deepEqual(pageErrors, [], "uncaught browser errors");
      const results = JSON.parse(await output.textContent()); assert.equal(results.cases.length, 3 * ownerRepetitions);
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
      const measured = {browser: name, run, version: browser.version(), ...results, summary, diagnostics, cpuProfile, geckoProfile, renderingTrace, exceptionProbe};
      measurements.push(measured); console.log(JSON.stringify({browser: name, summary}));
      await save("running");
    } catch (error) {
      try { await captureCpuProfile(); } catch (profileError) { diagnostics.push(String(profileError)); }
      try { await captureRenderingTrace(); } catch (traceError) { diagnostics.push(String(traceError)); }
      try { await captureExceptionProbe(); } catch (probeError) { diagnostics.push(String(probeError)); }
      let fixtureState;
      try {
        // Read completion and payload in one evaluation: separate protocol calls
        // can straddle completion and produce a misleading mixed-time snapshot.
        fixtureState = await page?.locator("#result").evaluate(element => ({
          status: element.getAttribute("data-status"), output: element.textContent,
          visibility: document.visibilityState, readyState: document.readyState,
        }), undefined, {timeout: 5000});
      } catch (snapshotError) { fixtureState = {snapshotError: String(snapshotError)}; }
      try { await captureGeckoProfile(); } catch (profileError) { diagnostics.push(String(profileError)); }
      measurements.push({browser: name, run, version: browser?.version(), status: "failed", error: String(error), diagnostics, pageErrors, cpuProfile, geckoProfile, renderingTrace, exceptionProbe, fixtureState});
      await save("failed"); throw error;
    } finally {await browser?.close();}
    }
  }
  await save("measured");
} finally {await new Promise((resolveClose, rejectClose) => server.httpServer.close(error => error ? rejectClose(error) : resolveClose()));}
