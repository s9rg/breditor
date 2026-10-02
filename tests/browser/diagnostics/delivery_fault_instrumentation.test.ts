import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { instrumentDeliveryFaults } from "./delivery_fault_instrumentation";
import { createDeliveryFaultRecorder } from "./delivery_fault_recorder";

const id = "/repo/packages/breditor-browser/dist/browser_editor.js";
const source = readFileSync(new URL("../../../packages/breditor-browser/dist/browser_editor.js", import.meta.url), "utf8");

it("inserts only failed-delivery and terminal toolbar breadcrumbs in the emitted owner", () => {
  const output = instrumentDeliveryFaults(source, id, "/recorder.js")!;
  expect(output.sites).toHaveLength(10);
  const restored = output.code.split("\n").slice(1).join("\n")
    .replace(/\(__breditorDeliveryFault\("browser_editor:delivery:[0-9]+"\), (Object\.freeze\(\{ status: "failed" \}\))\)/g, "$1")
    .replace(/__breditorDeliveryFault\("browser_editor:toolbar:[0-9]+", delivery, invocation\);\n/g, "");
  expect(restored).toBe(source);
  expect(instrumentDeliveryFaults(source, id.replace("browser_editor", "wasm_selection_adapter"), "/recorder.js")).toBeNull();
  expect(() => instrumentDeliveryFaults(output.code, id, "/recorder.js")).toThrow("already installed");
  expect(() => instrumentDeliveryFaults("class Owner {}", id, "/recorder.js")).toThrow("shape drift");
});

it("preserves success/failure values and predicates with no success-path recording", () => {
  const fixture = `class Owner {
    #submitImmediate(flag) {
      ${Array.from({ length: 9 }, (_, i) => `if(flag() === ${i}) return Object.freeze({ status: "failed" });`).join("\n")}
      return Object.freeze({status:"completed"});
    }
    #fault(reason) { this.reason = reason; }
    #dispatchToolbar(invocation) {
      const delivery = this.#submitImmediate(invocation.flag);
      if(delivery.status === "completed") return delivery;
      this.#fault("toolbarDispatchFailed");
      return delivery;
    }
    run(invocation) { return this.#dispatchToolbar(invocation); }
  }`;
  const output = instrumentDeliveryFaults(fixture, id, "/recorder.js")!;
  const record = vi.fn();
  const owner = new Function("__breditorDeliveryFault", output.code.split("\n").slice(1).join("\n") + ";return new Owner();")(record);
  const success = vi.fn(() => 10);
  expect(owner.run({ flag: success })).toEqual({ status: "completed" });
  expect(success).toHaveBeenCalledTimes(9);
  expect(record).not.toHaveBeenCalled();
  for (let i = 0; i < 9; i++) {
    record.mockClear();
    const failure = vi.fn(() => i);
    expect(owner.run({ flag: failure })).toEqual({ status: "failed" });
    expect(failure).toHaveBeenCalledTimes(i + 1);
    expect(record).toHaveBeenCalledTimes(2);
    expect(owner.reason).toBe("toolbarDispatchFailed");
  }
});

it("records only allowlisted delivery tags, never document text or arbitrary identifiers", () => {
  const recorder = createDeliveryFaultRecorder();
  recorder.record("browser_editor:toolbar:1", {
    status: "completed", submission: { status: "completed", result: { status: "delivered",
      command: { status: "committed", eventKind: "undo", intentId: "private" }, rendered: "private" } },
  }, { command: { kind: "history", operation: "undo", inputJson: "private" } });
  expect(recorder.snapshot()).toEqual([{ stage: "browser_editor:toolbar:1", delivery: "completed", submission: "completed",
    sequence: "delivered", outcome: "committed", eventKind: "undo", command: "history", operation: "undo" }]);
  recorder.record("browser_editor:toolbar:2", { status: "private" });
  expect(recorder.snapshot()[1]?.["delivery"]).toBe("unknown");
  expect(JSON.stringify(recorder.snapshot())).not.toContain("private");
});

it("bounds snapshots and contains getters, proxy inspection and emitter failure", () => {
  const getter = vi.fn(() => { throw new Error("private"); });
  const recorder = createDeliveryFaultRecorder(() => { throw new Error("emitter failed"); });
  recorder.record("browser_editor:toolbar:1", { get status() { return getter(); } });
  expect(getter).not.toHaveBeenCalled();
  recorder.record("browser_editor:toolbar:1", new Proxy({}, { getOwnPropertyDescriptor: getter }));
  expect(getter).toHaveBeenCalledOnce();
  recorder.record("private");
  for (let i = 0; i < 100; i++) recorder.record("browser_editor:delivery:1");
  expect(recorder.snapshot()).toHaveLength(16);
  recorder.snapshot()[0]!["stage"] = "mutated";
  expect(recorder.snapshot()[0]?.["stage"]).toBe("browser_editor:toolbar:1");
});
