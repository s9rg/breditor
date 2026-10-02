import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { instrumentQueueFaults } from "./queue_fault_instrumentation";
import { createQueueFaultRecorder } from "./queue_fault_recorder";

const id = "/repo/packages/breditor-browser/dist/command_queue.js";
const fixture = `class Queue {
  #fail(code) { return code; }
  run(execute) { try { return execute(); } catch { return this.#fail("command_queue.executor_threw"); } }
  leased(execute) { try { return execute(); } catch { return this.#fail("command_queue.executor_threw"); } }
  observe(execute) { try { return execute(); } catch { return this.#fail("command_queue.observer_threw"); } }
  leasedObserve(execute) { try { return execute(); } catch { return this.#fail("command_queue.observer_threw"); } }
}`;

it("leaves successful calls untouched and observes the original caught identity once", () => {
  const output = instrumentQueueFaults(fixture, id, "/recorder.js")!;
  const record = vi.fn();
  const queue = new Function("__breditorQueueFault", output.code.split("\n").slice(1).join("\n") + ";return new Queue();")(record);
  const original = new Error("Wasm semantic selection is invalid");
  const execute = vi.fn(() => 42);
  expect(queue.run(execute)).toBe(42);
  expect(execute).toHaveBeenCalledOnce();
  expect(record).not.toHaveBeenCalled();
  for (const [method, kind] of [["run", "executor"], ["leased", "executor"], ["observe", "observer"], ["leasedObserve", "observer"]]) {
    record.mockClear();
    expect(queue[method!](() => { throw original; })).toBe(`command_queue.${kind}_threw`);
    expect(record).toHaveBeenCalledOnce();
    expect(record.mock.calls[0]?.[1]).toBe(original);
  }
});

it("only inserts an import, catch bindings and cold recorder calls in the real module", () => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/command_queue.js", import.meta.url), "utf8");
  const output = instrumentQueueFaults(source, id, "/recorder.js")!;
  expect(output.sites).toHaveLength(4);
  const restored = output.code.split("\n").slice(1).join("\n")
    .replaceAll("catch (__breditorQueueError)", "catch")
    .replace(/\n__breditorQueueFault\("command_queue:(?:executor|observer):[0-9]+", __breditorQueueError\);/g, "");
  expect(restored).toBe(source);
  expect(instrumentQueueFaults(source, id.replace("command_queue", "wasm_selection_adapter"), "/recorder.js")).toBeNull();
  expect(() => instrumentQueueFaults(output.code, id, "/recorder.js")).toThrow("already installed");
  expect(() => instrumentQueueFaults("function x() {}", id, "/recorder.js")).toThrow("four queue catches");
});

it("stop-only mode leaves the entire drain, leased execution and catch bodies byte-identical", () => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/command_queue.js", import.meta.url), "utf8");
  const output = instrumentQueueFaults(source, id, "/recorder.js", "stop")!;
  expect(output.sites).toHaveLength(1);
  expect(output.code).not.toContain("catch (__breditorQueueError)");
  expect(output.code.split("\n").slice(1).join("\n")
    .replace(/\n__breditorQueueFault\("command_queue:stop:[0-9]+", code\);/, "")).toBe(source);
  const fixtureOutput = instrumentQueueFaults(fixture, id, "/recorder.js", "stop")!;
  const recorder = createQueueFaultRecorder();
  const queue = new Function("__breditorQueueFault", fixtureOutput.code.split("\n").slice(1).join("\n") + ";return new Queue();")(recorder.record);
  expect(queue.run(() => { throw 1; })).toBe("command_queue.executor_threw");
  expect(queue.observe(() => { throw 2; })).toBe("command_queue.observer_threw");
  expect(recorder.snapshot().events.map(event => event.reason)).toEqual(["command_queue.executor_threw", "command_queue.observer_threw"]);
});

it("records only closed reasons and package coordinates, with bounded detached snapshots", () => {
  const recorder = createQueueFaultRecorder();
  const error = { message: "Wasm semantic selection is invalid",
    stack: "private payload\nf@http://localhost:4218/@fs/private/breditor-browser/dist/wasm_command_adapter.js:1321:17\nsecret@other.js:1:2" };
  for (let i = 0; i < 20; i++) recorder.record("command_queue:executor:1", error);
  expect(recorder.snapshot().events).toHaveLength(8);
  expect(recorder.snapshot().events[0]).toEqual({ stage: "command_queue:executor:1",
    reason: "Wasm semantic selection is invalid", frames: ["wasm_command_adapter.js:1321:17"] });
  recorder.snapshot().events[0]!.frames.length = 0;
  expect(recorder.snapshot().events[0]!.frames).toHaveLength(1);
  expect(JSON.stringify(recorder.snapshot())).not.toMatch(/private|secret|http/);
});

it("never reads accessors, retains unknown messages, or propagates observer failures", () => {
  const getter = vi.fn(() => { throw new Error("private"); });
  const recorder = createQueueFaultRecorder(() => { throw new Error("sink failed"); });
  recorder.record("command_queue:observer:1", { get message() { return getter(); }, get stack() { return getter(); } });
  recorder.record("command_queue:executor:2", { message: "private document text" });
  recorder.record("command_queue:executor:3", new Proxy({}, { getOwnPropertyDescriptor: getter }));
  expect(recorder.snapshot().events).toHaveLength(2);
  expect(recorder.snapshot().events.every(event => event.reason === "unclassified")).toBe(true);
  expect(getter).toHaveBeenCalledOnce(); // Only the hostile proxy's descriptor trap.
  expect(JSON.stringify(recorder.snapshot())).not.toContain("private");
});
