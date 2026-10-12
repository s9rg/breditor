import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {transform} from "rolldown/utils";
import {instrumentParagraphComparison} from "./queue-failure-diagnostics.mjs";
import {instrumentProjectionCaughtErrors} from "./queue-failure-diagnostics.mjs";
import {instrumentNestedRootComparison} from "./queue-failure-diagnostics.mjs";
import {instrumentFixtureProgress} from "./queue-failure-diagnostics.mjs";

test("real fixture progress preserves execution before pending startup, even with a throwing marker", async () => {
  const source = await readFile(new URL("./fixtures/nested-list-performance/main.ts", import.meta.url), "utf8");
  const changed = instrumentFixtureProgress(source);
  const outcomes = [];
  for (const [code, hostile] of [[source, false], [changed, false], [changed, true]]) {
    const compiled = (await transform("fixture.ts", code, {lang: "ts"})).code.replace(/^import[^\n]+\n/gmu, "");
    const calls = [], phases = [];
    const output = {textContent: "starting", dataset: {}, setAttribute(name, value) {
      assert.ok(["data-progress", "data-cases-completed"].includes(name));
      if (hostile) throw new Error("marker");
      if (name === "data-progress") phases.push(value);
    }};
    const document = {getElementById(id) {return id === "result" ? output : {};}};
    const wasm = {BreditorCompiledProfile: {fromBootstrapJsonV5(value) {
      calls.push(["compile", value]);
      return {takeProfile() {return {descriptor() {return {schemaFingerprint: "fingerprint", free() {calls.push("descriptor free");}};}, free() {calls.push("profile free");}};}, free() {calls.push("compiled free");}};
    }}};
    const editor = {openNestedLists(options) {calls.push(["open", options]); return new Promise(() => {});}};
    new Function("document", "initialize", "wasm", "BreditorBrowserEditor", "performance", "location", compiled)(
      document, async () => {calls.push("initialize");}, wasm, editor, {now: () => 42}, {search: ""},
    );
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(output.textContent, "starting");
    assert.equal(output.dataset.status, undefined);
    outcomes.push(JSON.stringify(calls));
    if (code === changed && !hostile) assert.deepEqual(phases, ["initialization", "profile compilation", "5 items, repetition -1: startup"]);
  }
  assert.equal(outcomes[0], outcomes[1]);
  assert.equal(outcomes[0], outcomes[2]);
});

test("fixture progress rejects changed or duplicate anchors", async () => {
  const source = await readFile(new URL("./fixtures/nested-list-performance/main.ts", import.meta.url), "utf8");
  assert.throws(() => instrumentFixtureProgress(source.replace('let progress = "initialization";', "let progress;")));
  assert.throws(() => instrumentFixtureProgress(source.replace("exportContent(format)", "exportContent(other)")));
  assert.throws(() => instrumentFixtureProgress(instrumentFixtureProgress(source)));
});

test("drain diagnostics accumulate both clocks and contain marker failures", async () => {
  const source = await readFile(new URL("./fixtures/nested-list-performance/main.ts", import.meta.url), "utf8");
  const changed = instrumentFixtureProgress(source);
  const helper = changed.slice(changed.indexOf("let fixtureCaseStartedWallMs:"), changed.indexOf("recordFixtureProgress(progress, 0);"));
  const compiled = (await transform("drain.ts", helper, {lang: "ts"})).code;
  for (const hostile of [false, true]) {
    const attributes = new Map();
    const output = {setAttribute(name, value) {if (hostile) throw new Error("marker"); attributes.set(name, value);},
      removeAttribute(name) {if (hostile) throw new Error("marker"); attributes.delete(name);}};
    const times = [10, 25, 30, 60], wallTimes = [1000, 1015, 1030, 1060];
    let reads = 0, wallReads = 0;
    const helper = new Function("output", "performance", "Date", `${compiled}; return {start: recordFixtureDrainStart, end: recordFixtureDrainEnd};`)(
      output, {now: () => times[reads++]}, {now: () => wallTimes[wallReads++]},
    );
    const first = helper.start(); assert.equal(first, 10); helper.end(first);
    const second = helper.start(); assert.equal(second, 30); helper.end(second);
    assert.equal(reads, 4); assert.equal(wallReads, 4);
    if (!hostile) assert.deepEqual(Object.fromEntries(attributes), {
      "data-drain-total-ms": "45", "data-drain-max-ms": "30", "data-drain-total-wall-ms": "45",
    });
  }
});

test("real nested comparator labels preserve results, reads and short circuits", async () => {
  const ts = await readFile(new URL("../packages/breditor-browser/src/nested_list_projection_update.ts", import.meta.url), "utf8");
  const compiled = (await transform("nested_list_projection_update.ts", ts, {lang: "ts"})).code;
  const start = compiled.indexOf("export function nestedListRootsEqual(a, b) {");
  const source = compiled.slice(start, compiled.indexOf("\n}", start) + 2);
  const changed = instrumentNestedRootComparison(source);
  const paragraph = {runs: [{text: "A🙂", formats: []}], headingLevel: 2};
  const child = {kind: "orderedList", start: 4, items: [{block: paragraph, lists: []}]};
  const root = {kind: "orderedList", start: 3, items: [{block: paragraph, lists: [child]}]};
  const cases = [root, {...root, kind: "bulletList"}, {...root, start: 5}, {...root, items: []},
    {...root, items: [{block: {...paragraph, headingLevel: 3}, lists: [child]}]},
    {...root, items: [{block: paragraph, lists: []}]},
    {...root, items: [{block: paragraph, lists: [{...child, start: 5}]}]},
    {kind: "textBlock", block: paragraph}];
  for (const right of cases) for (const hostile of [false, true]) {
    const outcomes = [];
    for (const code of [source, changed]) {
      const reads = [], logs = [];
      const observe = (value, path) => typeof value !== "object" || value === null ? value : new Proxy(value, {
        get(target, key, receiver) {
          reads.push(`${path}.${String(key)}`);
          return observe(Reflect.get(target, key, receiver), `${path}.${String(key)}`);
        },
      });
      let paragraphs = 0;
      const compare = new Function("paragraphsEqual", "console", `${code.replace("export ", "")}; return nestedListRootsEqual;`)(
        (a, b) => {paragraphs++; return JSON.stringify(a) === JSON.stringify(b);},
        {error(...args) {if (hostile) throw new Error("logger"); logs.push(args);}});
      const result = compare(observe(structuredClone(root), "left"), observe(structuredClone(right), "right"));
      outcomes.push({result, reads, paragraphs});
      if (code === changed && !hostile) assert.equal(logs.length > 0, !result && right.kind !== "textBlock");
    }
    assert.deepEqual(outcomes[0], outcomes[1]);
  }
  assert.throws(() => instrumentNestedRootComparison(source.replace("a.start === b.start", "false")));
});

test("caught projection diagnostics preserve rejection even with hostile errors or loggers", () => {
  const source = `try { throw error; } catch { return projectionFailure("projection.invalid_update"); }`;
  const transformed = instrumentProjectionCaughtErrors(source, "nested_list_projection_update");
  assert.notEqual(transformed, source);
  const hostileError = {toString() { throw new Error("string conversion"); }, get stack() { throw new Error("stack getter"); }};
  for (const error of [new Error("original failure"), null, "failure", hostileError]) {
    for (const hostileLogger of [false, true]) {
      const logs = [];
      const failure = Object.freeze({ok: false});
      let calls = 0;
      const result = new Function("error", "projectionFailure", "console", transformed)(error,
        code => { calls++; assert.equal(code, "projection.invalid_update"); return failure; },
        {error(...args) { if (hostileLogger) throw new Error("logger"); logs.push(args); }});
      assert.equal(result, failure);
      assert.equal(calls, 1);
      assert.equal(logs.length, hostileLogger ? 0 : 1);
      if (!hostileLogger) assert.ok(logs[0][2].length <= 1024 && logs[0][3].length <= 4096);
    }
  }
  assert.equal(instrumentProjectionCaughtErrors("try {} catch { return false; }", "other"), "try {} catch { return false; }");
});

test("real nested projection catch is instrumented", async () => {
  const ts = await readFile(new URL("../packages/breditor-browser/src/nested_list_projection_update.ts", import.meta.url), "utf8");
  const compiled = (await transform("nested_list_projection_update.ts", ts, {lang: "ts"})).code;
  const transformed = instrumentProjectionCaughtErrors(compiled, "nested_list_projection_update");
  assert.equal(transformed.split("breditor projection caught exception").length - 1, 1);
});

test("paragraph comparison instrumentation preserves real compiled comparison", async () => {
  const ts = await readFile(new URL("../packages/breditor-browser/src/projection.ts", import.meta.url), "utf8");
  const compiled = (await transform("projection.ts", ts, {lang: "ts"})).code;
  const start = compiled.indexOf("function paragraphsEqual(left, right) {");
  const end = compiled.indexOf("\n}", start) + 2;
  assert.ok(start >= 0 && end > start);
  const currentSource = "export " + compiled.slice(start, end);
  // Diagnostics target the retained pre-fix package, not rebuilt current code.
  const source = currentSource.replace("!Object.is(left.headingLevel, right.headingLevel)", "left.headingLevel !== right.headingLevel");
  const instrumented = instrumentParagraphComparison(source);
  const sameValue = instrumentParagraphComparison(source, "same-value");
  const minimal = instrumentParagraphComparison(source, "same-value-minimal");
  assert.equal(minimal, source.replace("left.headingLevel !== right.headingLevel", "!Object.is(left.headingLevel, right.headingLevel)"));
  for (const left of [undefined, 1, 2, 3, 4, 5, 6]) {
    for (const right of [undefined, 1, 2, 3, 4, 5, 6]) {
      const compare = new Function("formatDetailsEqual", "console", sameValue.replace("export ", "") + "; return paragraphsEqual;")(
        () => true, {error() {}});
      assert.equal(compare({headingLevel: left, runs: []}, {headingLevel: right, runs: []}), left === right);
    }
  }
  assert.throws(() => instrumentParagraphComparison(source, "unknown"));
  const a = {headingLevel: 2, runs: [{text: "A🙂", strong: false, formatDetails: []}]};
  for (const b of [a, structuredClone(a), {...a, headingLevel: 3}, {...a, runs: []},
    {...a, runs: [{...a.runs[0], text: "B"}]}, {...a, runs: [{...a.runs[0], strong: true}]},
    {...a, runs: [{...a.runs[0], formatDetails: ["bold"]}]}]) {
    for (const hostile of [false, true]) {
      const results = [];
      for (const code of [source, instrumented, sameValue, minimal]) {
        let calls = 0;
        const compare = new Function("formatDetailsEqual", "console", code.replace("export ", "") + "; return paragraphsEqual;")(
          (left, right) => {calls++; return JSON.stringify(left) === JSON.stringify(right);},
          {error() {if (hostile) throw new Error("logger");}});
        results.push({value: compare(a, b), calls});
      }
      assert.deepEqual(results[0], results[1]);
      assert.deepEqual(results[0], results[2]);
      assert.deepEqual(results[0], results[3]);
    }
  }
});
import {instrumentQueueFailures, instrumentRouterFailures, instrumentOwnerFailures, instrumentProjectionUpdateFailures, instrumentProjectionValidationSites, instrumentParagraphShapeOperands, instrumentAdmittedBlockIndex, instrumentBlockTypeCall, instrumentFlatRootComparison, repeatPerformanceOwners, schedulePerformanceSelection} from "./queue-failure-diagnostics.mjs";

test("admitted index diagnostics preserve rejection without type reads or logger dependency", () => {
  const source = `const paragraphOrdinal = 3, plannedBlock = {};
    if (paragraphIndex !== expectedIndex) { return false; }
    const blockType = invokeGenerated(methods.elementType, view, paragraphIndex);
    return blockType;`;
  const transformed = instrumentAdmittedBlockIndex(source);
  for (const index of [2, undefined, "2", NaN]) for (const hostile of [false, true]) {
    const outcomes = [];
    for (const code of [source, transformed]) {
      let calls = 0;
      const logs = [];
      const result = new Function("paragraphIndex", "expectedIndex", "methods", "view", "invokeGenerated", "console", "globalThis", code)(
        index, 2, {elementType: "type"}, {}, () => {calls++; return "paragraph";},
        {error(...args) {if (hostile) throw Error("logger"); logs.push(args);}}, {});
      outcomes.push({result, calls});
      if (code === transformed && index !== 2 && !hostile) {
        assert.equal(logs.length, 1);
        assert.equal(JSON.parse(logs[0][1]).paragraphIndex.type, typeof index);
      }
    }
    assert.deepEqual(outcomes[0], outcomes[1]);
  }
  assert.throws(() => instrumentAdmittedBlockIndex(source + source));
});

test("block type call marker distinguishes skipped and undefined without duplicate calls", () => {
  const source = `const blockType = paragraphIndex === expectedIndex
        ? invokeGenerated(methods.elementType, view, paragraphIndex) : undefined;
    return {value: blockType};`;
  const transformed = instrumentBlockTypeCall(source).replace("return {value: blockType}", "return {value: blockType, invoked: paragraphBlockTypeInvoked}");
  for (const equal of [false, true]) for (const value of [undefined, "breditor/paragraph"]) {
    let calls = 0;
    const run = new Function("paragraphIndex", "expectedIndex", "methods", "view", "invokeGenerated", transformed);
    const result = run(2, equal ? 2 : 3, {elementType: "elementType"}, {}, () => {calls++; return value;});
    assert.deepEqual(result, {value: equal ? value : undefined, invoked: equal});
    assert.equal(calls, equal ? 1 : 0);
  }
  for (const value of ["", source + source]) assert.throws(() => instrumentBlockTypeCall(value));
});

test("flat comparator logging preserves short circuit and equality results", () => {
  const source = `export function flatListRootsEqual(a, b) {
    if (a.kind === "textBlock" || b.kind === "textBlock")
        return a.kind === "textBlock" && b.kind === "textBlock" && paragraphsEqual(a.block, b.block);
    return a.kind === b.kind && (a.kind !== "orderedList" || (b.kind === "orderedList" && a.start === b.start)) &&
        a.items.length === b.items.length && a.items.every((item, index) => b.items[index] !== undefined && paragraphsEqual(item, b.items[index]));
}`;
  const transformed = instrumentFlatRootComparison(source);
  const a = {kind: "orderedList", start: 3, items: ["a", "b"]};
  for (const b of [a, {...a, kind: "bulletList"}, {...a, start: 4}, {...a, items: []}, {...a, items: ["a", "c"]}, {...a, items: ["a", undefined]}]) {
    for (const hostile of [false, true]) {
      const outcomes = [];
      for (const code of [source, transformed]) {
        const calls = [], logs = [];
        const compare = new Function("paragraphsEqual", "console", code.replace("export ", "") + "; return flatListRootsEqual;")(
          (left, right) => {calls.push([left, right]); return left === right;},
          {error(...args) {if (hostile) throw new Error("logger"); logs.push(args);}});
        const result = compare(a, b);
        outcomes.push({result, calls});
        if (code === transformed && !hostile) assert.equal(logs.length, result ? 0 : 1);
      }
      assert.deepEqual(outcomes[0], outcomes[1]);
    }
  }
  assert.throws(() => instrumentFlatRootComparison(""));
});

for (const admitted of [false, true]) test(`paragraph operand capture preserves single reads and short-circuit rejection (admitted=${admitted})`, () => {
  let source = `const paragraphOrdinal = 0, paragraphIndex = 2, expectedIndex = 2;
    const blockType = "breditor/paragraph", headingLevel = undefined;
        if (paragraphIndex !== expectedIndex ||
            !listMetadataIsAbsent(view, methods, paragraphIndex) ||
            invokeGenerated(methods.nodeKind, view, paragraphIndex) !== "element" ||
            (blockType === "breditor/heading"
                ? !isHeadingProjectionLevel(headingLevel)
                : blockType !== "breditor/paragraph" || headingLevel !== undefined) ||
            invokeGenerated(methods.text, view, paragraphIndex) !== undefined ||
            invokeGenerated(methods.formatCount, view, paragraphIndex) !== undefined ||
            invokeGenerated(methods.formatType, view, paragraphIndex, 0) !== undefined ||
            !formatPropertyProbeIsAbsent(view, methods, paragraphIndex, 0, 0)) {
            return false;
        }
        return true;`;
  if (admitted) source = source.replace("if (paragraphIndex !== expectedIndex ||\n            !listMetadataIsAbsent", "if (!listMetadataIsAbsent");
  const transformed = instrumentParagraphShapeOperands(source);
  for (const failing of [null, "nodeKind", "text", "formatCount", "formatType"]) {
    for (const hostile of [false, true]) {
      const outcomes = [];
      for (const code of [source, transformed]) {
        const calls = [], logs = [];
        const result = new Function("view", "methods", "invokeGenerated", "listMetadataIsAbsent", "formatPropertyProbeIsAbsent", "console", code)(
          {}, {nodeKind: "nodeKind", text: "text", formatCount: "formatCount", formatType: "formatType"},
          name => {calls.push(name); return name === failing ? "bad" : name === "nodeKind" ? "element" : undefined;},
          () => {calls.push("listMetadata"); return true;}, () => {calls.push("formatProperty"); return true;},
          {error(...args) {if (hostile) throw new Error("logger"); logs.push(args);}});
        outcomes.push({result, calls});
        if (code === transformed && failing !== null && !hostile) {
          const diagnostic = JSON.parse(logs[0][1]);
          assert.equal(diagnostic[failing].value, "bad");
          assert.deepEqual(diagnostic.blockType, {type: "string", value: "breditor/paragraph"});
          assert.deepEqual(diagnostic.headingLevel, {type: "undefined"});
        }
      }
      assert.deepEqual(outcomes[0], outcomes[1]);
    }
  }
  assert.throws(() => instrumentParagraphShapeOperands(""));
});

test("admitted block marker preserves the early rejection and exactly one type read", () => {
  const source = `if (paragraphIndex !== expectedIndex) return {rejected: true};
    const blockType = invokeGenerated(methods.elementType, view, paragraphIndex);
    return {value: blockType};`;
  const transformed = instrumentBlockTypeCall(source).replace("return {value: blockType}", "return {value: blockType, invoked: paragraphBlockTypeInvoked}");
  for (const equal of [false, true]) for (const value of [undefined, "breditor/paragraph"]) {
    let calls = 0;
    const run = new Function("paragraphIndex", "expectedIndex", "methods", "view", "invokeGenerated", transformed);
    assert.deepEqual(run(2, equal ? 2 : 3, {elementType: "elementType"}, {}, () => {calls++; return value;}),
      equal ? {value, invoked: true} : {rejected: true});
    assert.equal(calls, equal ? 1 : 0);
  }
  assert.throws(() => instrumentBlockTypeCall(source + source));
});

for (const family of ["flat", "nested"]) test(`${family} impact diagnostics preserve rejection and bound mismatch context`, () => {
  const source = `function verifyImpact(a, b, input) {
    const oldIndex = 0, newIndex = 0;
    if (a === undefined || b === undefined || !flatListRootsEqual(a, b))
            return false;
    return true;
  }
  function rejected() { return projectionFailure("projection.invalid_update"); }`;
  const comparator = family === "nested" ? "nestedListRootsEqual" : "flatListRootsEqual";
  const transformed = instrumentProjectionValidationSites(source.replaceAll("flatListRootsEqual", comparator), `${family}_list_projection_update`);
  for (const hostile of [false, true]) {
    const logs = [];
    let comparisons = 0;
    const run = new Function(comparator, "console", `${transformed}; return verifyImpact;`)(
      (a, b) => { comparisons++; return a === b; }, {error(...args) {if (hostile) throw new Error("logger"); logs.push(args);}});
    const before = {text: "x".repeat(20000) + "a"}, after = {text: "x".repeat(20000) + "b"};
    assert.equal(run(before, before, {kind: "none"}), true);
    assert.equal(logs.length, 0);
    assert.equal(run(before, after, {kind: "none"}), false);
    assert.equal(comparisons, 2, "diagnostics must not retry the comparator");
    if (!hostile) {
      assert.ok(logs[0][1].length <= 4096);
      const detail = JSON.parse(logs[0][1]);
      assert.ok(detail.offset > 20000);
      assert.match(detail.before, /a/);
      assert.match(detail.after, /b/);
    }
  }
});

test("nested owner churn changes only its real fixture loop bound", async () => {
  const source = await readFile(new URL("./fixtures/nested-list-performance/main.ts", import.meta.url), "utf8");
  const expanded = repeatPerformanceOwners(source, 30);
  assert.equal(expanded.replace("repetition < 30", "repetition < 3"), source);
  for (const anchor of ["owner?.dispose()", 'exported("documentJson")', 'measured("redoMs", () => history("redo"))']) {
    assert.ok(source.includes(anchor), `required correctness/lifecycle anchor missing: ${anchor}`);
    assert.ok(expanded.includes(anchor));
  }
});

test("projection site labels preserve values and contain failing loggers", () => {
  const source = 'return projectionFailure("projection.invalid_update");';
  const transformed = instrumentProjectionValidationSites(source, "wasm_projection_adapter");
  const result = Object.freeze({ok: false});
  for (const hostile of [false, true]) {
    const logs = [];
    assert.equal(new Function("projectionFailure", "console", transformed)(() => result, {error(...args) {
      if (hostile) throw new Error("logger"); logs.push(args);
    }}), result);
    if (!hostile) assert.equal(logs[0][1], "wasm_projection_adapter:1:projection.invalid_update");
  }
  assert.throws(() => instrumentProjectionValidationSites("", "wasm_projection_adapter"));
  assert.throws(() => instrumentProjectionValidationSites(source, "unknown"));
  const initialized = 'let result = projectionFailure("projection.invalid_shape");\n' + source;
  const labeled = instrumentProjectionValidationSites(initialized, "wasm_projection_adapter");
  assert.equal(labeled.split("breditor projection rejection site").length, 2);
});

test("nested update rejection labels preserve failure identity and tolerate logger failure", () => {
  const source = 'return projectionFailure("projection.invalid_update");';
  const transformed = instrumentProjectionValidationSites(source, "nested_list_projection_update");
  const result = Object.freeze({ok: false});
  for (const hostile of [false, true]) {
    const logs = [];
    assert.equal(new Function("projectionFailure", "console", transformed)(() => result, {error(...args) {
      if (hostile) throw new Error("logger");
      logs.push(args);
    }}), result);
    if (!hostile) assert.equal(logs[0][1], "nested_list_projection_update:1:projection.invalid_update");
  }
});

test("projection rejection diagnostics preserve the thrown failure even when logging fails", () => {
  const source = 'if (!converted.ok) { throw new TypeError("Wasm projection update is invalid"); }';
  for (const hostile of [false, true]) {
    const logs = [];
    const run = new Function("converted", "console", instrumentProjectionUpdateFailures(source));
    assert.throws(() => run({ok: false, error: {code: "projection.invalid_update"}}, {error(...values) {
      if (hostile) throw new Error("logger failed"); logs.push(values);
    }}), /Wasm projection update is invalid/);
    if (!hostile) assert.match(logs[0][1], /projection.invalid_update/);
  }
  assert.throws(() => instrumentProjectionUpdateFailures(""));
  assert.throws(() => instrumentProjectionUpdateFailures(source + source));
});

test("router diagnostics distinguish adapter faults from queue faults and survive hostile logging", () => {
  const source = `class Router {
    #status = {kind: "live"}; #adapter; #queue;
    constructor(adapter, queue) {this.#adapter = adapter; this.#queue = queue;}
    #fault(reason) {
      if (this.#status.kind !== "live") return;
      this.#status = {kind: "faulted", reason};
    }
    fail() {this.#fault("queueUncertain"); return this.#status;}
  }`;
  for (const hostile of [false, true]) {
    const logs = [];
    const Router = new Function("console", `${instrumentRouterFailures(source)}; return Router;`)({error(...args) {
      logs.push(args); if (hostile) throw new Error("logger failed");
    }});
    for (const queue of [{disposed: false}, {disposed: true, failure: {code: "command_queue.executor_threw"}}]) {
      const router = new Router({state: "faulted"}, queue);
      assert.deepEqual(router.fail(), {kind: "faulted", reason: "queueUncertain"});
      const count = logs.length; router.fail(); assert.equal(logs.length, count);
      const diagnostic = JSON.parse(logs.at(-1)[1]);
      assert.equal(diagnostic.adapterState, "faulted");
      assert.equal(diagnostic.queueDisposed, queue.disposed);
      assert.equal(diagnostic.queueCode, queue.failure?.code);
      assert.ok(diagnostic.stack.length <= 4096);
    }
    const router = new Router({get state() {throw 1;}}, {get failure() {throw 2;}, get disposed() {throw 3;}});
    assert.equal(router.fail().kind, "faulted");
  }
  for (const code of ["", source + source]) assert.throws(() => instrumentRouterFailures(code), /fault site changed/u);
});

test("owner fault tracing preserves one terminal transition and contains hostile observers", () => {
  const source = `class Owner {
    #status = {phase: "live"}; #adapter; #queue;
    constructor(adapter, queue) {this.#adapter = adapter; this.#queue = queue;}
    #fault(reason) {
      if (this.#status.phase !== "live") return;
      this.#status = {phase: "faulted", reason};
      this.#queue.dispose();
    }
    fail() {this.#fault("queueUncertain"); return this.#status;}
  }`;
  for (const hostile of [false, true]) {
    const logs = [];
    const Owner = new Function("console", `${instrumentOwnerFailures(source)}; return Owner;`)({error(...args) {
      logs.push(args); if (hostile) throw new Error("logger failed");
    }});
    let disposed = 0;
    const owner = new Owner({state: "faulted"}, {failure: {code: "command_queue.observer_threw"}, disposed: false, dispose() {disposed++;}});
    assert.deepEqual(owner.fail(), {phase: "faulted", reason: "queueUncertain"});
    owner.fail(); assert.equal(disposed, 1); assert.equal(logs.length, 1);
    const diagnostic = JSON.parse(logs[0][1]);
    assert.equal(diagnostic.queueCode, "command_queue.observer_threw");
    assert.equal(diagnostic.queueDisposed, false);
    assert.equal(diagnostic.adapterState, "faulted");
    assert.ok(diagnostic.stack.length <= 4096);
    const hostileOwner = new Owner({get state() {throw 1;}}, {
      get failure() {throw 2;}, get disposed() {throw 3;}, dispose() {disposed++;}
    });
    assert.equal(hostileOwner.fail().phase, "faulted");
  }
  for (const code of ["", source + source]) assert.throws(() => instrumentOwnerFailures(code), /fault site changed/u);
});

const fixture = `class Queue {
  #fail(code, sequence) { return {code, sequence}; }
  executor(callback, sequence) {
    try { return callback(); } catch {
      const failure = this.#fail("command_queue.executor_threw", sequence);
      return failure;
    }
  }
  observer(callback, sequence) {
    try { return callback(); } catch {
      const failure = this.#fail("command_queue.observer_threw", sequence);
      return failure;
    }
  }
  drainExecutor(callback, pending) {
    try { return callback(); } catch {
      this.#fail("command_queue.executor_threw", pending.sequence);
    }
  }
  drainObserver(callback, pending) {
    try { return callback(); } catch {
      this.#fail("command_queue.observer_threw", pending.sequence);
    }
  }
}`;

test("only the four queue uncertainty catches are instrumented", () => {
  for (const code of [fixture, fixture.replaceAll("} catch {", "}\n    catch {")]) {
    const result = instrumentQueueFailures(code);
    assert.equal(result.split("console.error(").length - 1, 4);
    assert.equal(result.split("this.#fail(").length - 1, 4);
  }
});
test("missing, duplicate or drifted queue failure sites reject", () => {
  for (const source of ["", fixture.replace("executor_threw", "changed"), fixture + fixture]) {
    assert.throws(() => instrumentQueueFailures(source), /queue diagnostic catch sites changed/u);
  }
});
test("logging preserves success and terminal failure, including hostile diagnostics", () => {
  for (const error of [new TypeError("synthetic boundary"), {toString() {throw new Error("no string");}}]) {
    for (const throws of [false, true]) {
      const messages = [];
      const Queue = new Function("console", `${instrumentQueueFailures(fixture)}; return Queue;`)({error(...args) {
        messages.push(args); if (throws) throw new Error("logger");
      }});
      const queue = new Queue();
      assert.equal(queue.executor(() => 42, 1n), 42);
      assert.deepEqual(queue.executor(() => {throw error;}, 2n), {code: "command_queue.executor_threw", sequence: 2n});
      assert.deepEqual(queue.observer(() => {throw error;}, 3n), {code: "command_queue.observer_threw", sequence: 3n});
      assert.equal(queue.drainExecutor(() => {throw error;}, {sequence: 4n}), undefined);
      assert.equal(queue.drainObserver(() => {throw error;}, {sequence: 5n}), undefined);
      assert.equal(messages.length, 4);
      if (!(error instanceof Error)) assert.equal(messages[0][1], "<unprintable>");
    }
  }
});
test("caught exception text is bounded without changing the failed result", () => {
  const messages = [];
  const Queue = new Function("console", `${instrumentQueueFailures(fixture)}; return Queue;`)({error(...args) {messages.push(args);}});
  const queue = new Queue();
  assert.deepEqual(queue.executor(() => {throw "x".repeat(4096);}, 7n), {code: "command_queue.executor_threw", sequence: 7n});
  assert.equal(messages[0][1], "x".repeat(1024));
  assert.equal(messages[0][2], "<unavailable>");
});
test("caught stack is bounded and independent of hostile string conversion", () => {
  const messages = [];
  const Queue = new Function("console", `${instrumentQueueFailures(fixture)}; return Queue;`)({error(...args) {messages.push(args);}});
  const error = {stack: "s".repeat(8192), toString() {throw new Error("no string");}};
  assert.deepEqual(new Queue().executor(() => {throw error;}, 8n), {code: "command_queue.executor_threw", sequence: 8n});
  assert.deepEqual(messages[0], ["breditor queue failure: executor", "<unprintable>", "s".repeat(4096)]);
});
test("hostile stack access cannot suppress the message or terminal failure", () => {
  const messages = [];
  const Queue = new Function("console", `${instrumentQueueFailures(fixture)}; return Queue;`)({error(...args) {messages.push(args);}});
  let reads = 0;
  const error = {toString() {return "synthetic";}, get stack() {reads++; throw new Error("no stack");}};
  assert.deepEqual(new Queue().observer(() => {throw error;}, 9n), {code: "command_queue.observer_threw", sequence: 9n});
  assert.equal(reads, 1);
  assert.deepEqual(messages[0], ["breditor queue failure: observer", "synthetic", "<unavailable>"]);
});
test("engine-created exceptions are captured at the catch site", () => {
  const messages = [];
  const Queue = new Function("console", `${instrumentQueueFailures(fixture)}; return Queue;`)({error(...args) {messages.push(args);}});
  function syntheticEngineTypeError() {return undefined.missing;}
  assert.deepEqual(new Queue().executor(syntheticEngineTypeError, 10n), {code: "command_queue.executor_threw", sequence: 10n});
  assert.match(messages[0][1], /^TypeError:/u);
  assert.match(messages[0][2], /syntheticEngineTypeError/u);
});
test("owner stress changes only the bounded loop and rejects drift", () => {
  const code = "for(let repetition = 0; repetition < 3; repetition++) { verify(); dispose(); yieldTask(); }";
  assert.equal(repeatPerformanceOwners(code, 3), code);
  assert.equal(repeatPerformanceOwners(code, 100), code.replace("< 3", "< 100"));
  for(const count of [0, 2, 101, -1, 3.5, NaN, Infinity, "10"]) assert.throws(() => repeatPerformanceOwners(code, count), /owner repetitions/u);
  for(const source of ["", code+code]) assert.throws(() => repeatPerformanceOwners(source, 10), /owner loop changed/u);
});

test("selection scheduling transforms the real fixture without removing correctness checks", async () => {
  const source = await readFile(new URL("./fixtures/flat-list-performance/main.ts", import.meta.url), "utf8");
  const start = source.indexOf('    measured("selectionMs",');
  const end = source.indexOf('    const original =', start);
  for (const mode of ["focus-task", "native-selection"]) {
    const transformed = schedulePerformanceSelection(source, mode);
    assert.equal(transformed.slice(0, start), source.slice(0, start));
    assert.equal(transformed.slice(transformed.indexOf('    const original =')), source.slice(end));
    const section = transformed.slice(start, transformed.indexOf('    const original ='));
    const {code: js} = await transform("selection.ts", section, {lang: "ts", target: "es2022"});
    const calls = [];
    const document = new EventTarget();
    document.createRange = () => ({selectNodeContents() {}, collapse() {}});
    const selection = {removeAllRanges() {}, addRange() {
      calls.push("range");
      if (mode === "native-selection") {
        document.dispatchEvent(new Event("selectionchange"));
        setTimeout(() => {
          const event = new Event("selectionchange");
          Object.defineProperty(event, "isTrusted", {value: true});
          document.dispatchEvent(event);
        }, 0);
      }
    }};
    document.addEventListener("selectionchange", event => calls.push(event.isTrusted ? "native" : "synthetic"));
    const owner = {focus() {calls.push("focus"); queueMicrotask(() => calls.push("focus-drained"));}, getStatus() {return {phase: "live"};}};
    const host = {querySelectorAll() {return [{firstElementChild: {}}];}, getBoundingClientRect() {calls.push("layout");}};
    const run = new Function("owner", "host", "document", "getSelection", "equal", `return (async () => {
      let progress; const items = 1, repetition = 0, middle = 0, metrics = {};
      ${js}
      return {progress, metrics};
    })();`);
    const result = await run(owner, host, document, () => selection, assert.equal);
    assert.deepEqual(calls, ["focus", "focus-drained", "range", "synthetic", ...(mode === "native-selection" ? ["native"] : []), "layout"]);
    assert.match(result.progress, new RegExp(mode));
    assert.ok(Number.isFinite(result.metrics.selectionMs));
  }
  assert.throws(() => schedulePerformanceSelection(source, "unknown"), /invalid selection/u);
  for (const code of ["", source + source, source.replace('measured("selectionMs"', 'measured("drift"')]) {
    assert.throws(() => schedulePerformanceSelection(code, "focus-task"), /anchor changed/u);
  }
});

test("native selection diagnosis times out and removes its listener without a synthetic fallback", async () => {
  const source = await readFile(new URL("./fixtures/flat-list-performance/main.ts", import.meta.url), "utf8");
  const transformed = schedulePerformanceSelection(source, "native-selection");
  const start = transformed.indexOf('    progress = `${items} items, repetition ${repetition}: selectionMs');
  const section = transformed.slice(start, transformed.indexOf('    const original =', start));
  const {code} = await transform("selection.ts", section, {lang: "ts", target: "es2022"});
  const listeners = new Set();
  let syntheticDispatches = 0;
  const document = {
    createRange: () => ({selectNodeContents() {}, collapse() {}}),
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    dispatchEvent: () => {syntheticDispatches++;},
  };
  const timeouts = [];
  const schedule = (callback, ms) => {timeouts.push(ms); queueMicrotask(callback); return timeouts.length;};
  const run = new Function("document", "setTimeout", "equal", `return (async () => {
    let progress; const items = 1, repetition = 0, middle = 0, metrics = {};
    const owner = {focus() {}, getStatus() {return {phase: "live"};}};
    const host = {querySelectorAll() {return [{firstElementChild: {}}];}};
    const getSelection = () => ({removeAllRanges() {}, addRange() {}});
    ${code}
  })();`);
  await assert.rejects(run(document, schedule, assert.equal), /Native selectionchange did not arrive/u);
  assert.deepEqual(timeouts, [0, 5000]);
  assert.equal(listeners.size, 0);
  assert.equal(syntheticDispatches, 0);
});

// Explicit opt-in: ordinary helper tests do not launch a browser. This positive
// control proves capture in WebKit, not reproduction of the editor's fault.
test("WebKit captures engine exceptions at every diagnostic catch site", {
  skip: process.env["BREDITOR_QUEUE_DIAGNOSTIC_BROWSER"] !== "1",
}, async () => {
  const {webkit} = await import("playwright-core");
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(code => {
      const messages = [];
      const Queue = new Function("console", `${code}; return Queue;`)({error(...args) {messages.push(args);}});
      const queue = new Queue();
      function syntheticEngineTypeError() {return undefined.missing;}
      const executor = queue.executor(syntheticEngineTypeError, "1");
      const observer = queue.observer(syntheticEngineTypeError, "2");
      queue.drainExecutor(syntheticEngineTypeError, {sequence: "3"});
      queue.drainObserver(syntheticEngineTypeError, {sequence: "4"});
      // Even failure of the diagnostic logger must not escape the queue catch.
      const HostileLoggerQueue = new Function("console", `${code}; return Queue;`)({error() {throw new Error("logger");}});
      const hostile = new HostileLoggerQueue().executor(syntheticEngineTypeError, "5");
      return {messages, executor, observer, hostile};
    }, instrumentQueueFailures(fixture));
    assert.equal(result.messages.length, 4);
    for (const [index, message] of result.messages.entries()) {
      assert.equal(message[0], `breditor queue failure: ${index % 2 === 0 ? "executor" : "observer"}`);
      assert.match(message[1], /^TypeError:/u);
      assert.match(message[2], /syntheticEngineTypeError/u);
      assert.ok(message[1].length <= 1024 && message[2].length <= 4096);
    }
    assert.deepEqual(result.executor, {code: "command_queue.executor_threw", sequence: "1"});
    assert.deepEqual(result.observer, {code: "command_queue.observer_threw", sequence: "2"});
    assert.deepEqual(result.hostile, {code: "command_queue.executor_threw", sequence: "5"});
  } finally {
    await browser.close();
  }
});
