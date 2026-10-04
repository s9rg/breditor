import assert from "node:assert/strict";
import test from "node:test";
import {instrumentQueueFailures, repeatPerformanceOwners} from "./queue-failure-diagnostics.mjs";

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
