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
      if (error instanceof Error) assert.equal(messages.length, 4);
    }
  }
});
test("caught exception text is bounded without changing the failed result", () => {
  const messages = [];
  const Queue = new Function("console", `${instrumentQueueFailures(fixture)}; return Queue;`)({error(...args) {messages.push(args);}});
  const queue = new Queue();
  assert.deepEqual(queue.executor(() => {throw "x".repeat(4096);}, 7n), {code: "command_queue.executor_threw", sequence: 7n});
  assert.equal(messages[0][1], "x".repeat(1024));
});
test("owner stress changes only the bounded loop and rejects drift", () => {
  const code = "for(let repetition = 0; repetition < 3; repetition++) { verify(); dispose(); yieldTask(); }";
  assert.equal(repeatPerformanceOwners(code, 3), code);
  assert.equal(repeatPerformanceOwners(code, 100), code.replace("< 3", "< 100"));
  for(const count of [0, 2, 101, -1, 3.5, NaN, Infinity, "10"]) assert.throws(() => repeatPerformanceOwners(code, count), /owner repetitions/u);
  for(const source of ["", code+code]) assert.throws(() => repeatPerformanceOwners(source, 10), /owner loop changed/u);
});
