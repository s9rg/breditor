import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {transform} from "rolldown/utils";
import {instrumentQueueFailures, instrumentRouterFailures, instrumentProjectionUpdateFailures, instrumentProjectionValidationSites, repeatPerformanceOwners, schedulePerformanceSelection} from "./queue-failure-diagnostics.mjs";

test("flat impact diagnostics preserve rejection and bound mismatch context", () => {
  const source = `function verifyImpact(a, b, input) {
    const oldIndex = 0, newIndex = 0;
    if (a === undefined || b === undefined || !flatListRootsEqual(a, b))
            return false;
    return true;
  }
  function rejected() { return projectionFailure("projection.invalid_update"); }`;
  const transformed = instrumentProjectionValidationSites(source, "flat_list_projection_update");
  for (const hostile of [false, true]) {
    const logs = [];
    const run = new Function("flatListRootsEqual", "console", `${transformed}; return verifyImpact;`)(
      (a, b) => a === b, {error(...args) {if (hostile) throw new Error("logger"); logs.push(args);}});
    const before = {text: "x".repeat(20000) + "a"}, after = {text: "x".repeat(20000) + "b"};
    assert.equal(run(before, before, {kind: "none"}), true);
    assert.equal(logs.length, 0);
    assert.equal(run(before, after, {kind: "none"}), false);
    if (!hostile) {
      assert.ok(logs[0][1].length <= 4096);
      const detail = JSON.parse(logs[0][1]);
      assert.ok(detail.offset > 20000);
      assert.match(detail.before, /a/);
      assert.match(detail.after, /b/);
    }
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
