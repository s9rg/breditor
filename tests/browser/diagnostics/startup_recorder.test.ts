import { describe, expect, it, vi } from "vitest";
import { createStartupDiagnosticRecorder } from "./startup_recorder";

describe("startup rejection recorder", () => {
  it("starts empty and returns immutable detached snapshots", () => {
    const recorder = createStartupDiagnosticRecorder();
    const initial = recorder.snapshot();
    recorder.record("bootstrap:readSource:1", { bytes: 3 });
    expect(initial.events).toEqual([]);
    const snapshot = recorder.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.events)).toBe(true);
    expect(Object.isFrozen(snapshot.events[0])).toBe(true);
    expect(Object.isFrozen(snapshot.events[0]?.counters)).toBe(true);
    expect(snapshot.events).toEqual([{ stage: "bootstrap:readSource:1", counters: { bytes: "3" } }]);
  });

  it("retains only allowlisted numeric counters, never payloads or getters", () => {
    const getter = vi.fn(() => "secret document");
    const coerce = vi.fn(() => "secret coerced payload");
    const recorder = createStartupDiagnosticRecorder();
    recorder.record("checkpoint:wellFormedUtf8Length:20", {
      get bytes() { return getter(); },
      index: { [Symbol.toPrimitive]: coerce }, maximum: "secret", length: 9,
      document: "secret document", checkpointJson: "secret checkpoint", error: new Error("secret"),
    });
    expect(recorder.snapshot().events).toEqual([
      { stage: "checkpoint:wellFormedUtf8Length:20", counters: { length: "9" } },
    ]);
    expect(getter).not.toHaveBeenCalled();
    expect(coerce).not.toHaveBeenCalled();
    expect(JSON.stringify(recorder.snapshot())).not.toContain("secret");
  });

  it("bounds retained events and counts omitted records", () => {
    const recorder = createStartupDiagnosticRecorder();
    for (let index = 0; index < 100; index++) recorder.record("bootstrap:readSource:1", { index });
    expect(recorder.snapshot().events).toHaveLength(16);
    expect(recorder.snapshot().omitted).toBe(84);
  });

  it("preserves non-finite numeric evidence without JSON null conversion", () => {
    const recorder = createStartupDiagnosticRecorder();
    recorder.record("document:wellFormedUtf8Length:1", { index: NaN, bytes: Infinity, maximum: -Infinity, length: 0.5 });
    expect(recorder.snapshot().events[0]?.counters).toEqual({ index: "NaN", bytes: "Infinity", maximum: "-Infinity", length: "0.5" });
  });

  it("retains signed zero in property bounds and omits nonnumeric bound values", () => {
    const recorder = createStartupDiagnosticRecorder();
    recorder.record("descriptor:readFormatPropertyValueType:244", {
      kindTag: 2, integerMinimum: -0, integerMaximum: 0,
      stringMinimum: "private value", stringMaximum: undefined,
      integerMinimumType: 1, integerMaximumType: 1, stringMinimumType: 2, stringMaximumType: 0,
    });
    expect(recorder.snapshot().events[0]?.counters).toEqual({
      kindTag: "2", integerMinimum: "-0", integerMaximum: "0",
      integerMinimumType: "1", integerMaximumType: "1", stringMinimumType: "2", stringMaximumType: "0",
    });
  });

  it("contains throwing metadata inspection and rejects arbitrary stage text", () => {
    const recorder = createStartupDiagnosticRecorder();
    expect(() => recorder.record("bootstrap:readSource:1", new Proxy({}, {
      getOwnPropertyDescriptor() { throw new Error("private exception"); },
    }))).not.toThrow();
    recorder.record("secret document");
    expect(recorder.snapshot().events).toEqual([]);
  });

  it("does not coerce stage objects and bounds stage length", () => {
    const recorder = createStartupDiagnosticRecorder();
    const coerce = vi.fn(() => "bootstrap:readSource:1");
    recorder.record({ [Symbol.toPrimitive]: coerce } as unknown as string);
    recorder.record(`bootstrap:${"x".repeat(200)}:1`);
    expect(coerce).not.toHaveBeenCalled();
    expect(recorder.snapshot().events).toEqual([]);
  });
});
