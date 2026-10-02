import { expect, it, vi } from "vitest";
import { snapshotImpactRejection } from "./impact_rejection_snapshot";
import { createLinkFaultRecorder } from "./link_fault_recorder";

const valid = { impact: "textContainers", affectedParagraphCount: 1,
  oldChildStart: undefined, oldChildEnd: undefined, newChildStart: undefined, newChildEnd: undefined };

it("distinguishes zero counts, absent ranges, and present zero-valued ranges", () => {
  expect(snapshotImpactRejection(valid, 1)).toMatchObject({ impact: "textContainers",
    affectedParagraphCount: { decimal: "1", bits: "3ff0000000000000" },
    snapshotCount: { field: "data", decimal: "1" },
    ranges: { oldChildStart: { field: "data", type: "undefined" } } });
  expect(snapshotImpactRejection({ ...valid, oldChildStart: 0 }, 0)).toMatchObject({
    affectedParagraphCount: { decimal: "0", bits: "0000000000000000" },
    ranges: { oldChildStart: { field: "data", decimal: "0" } } });
});

it("does not invoke accessors or stringify input payloads, and contains descriptor traps", () => {
  const get = vi.fn(() => { throw new Error("getter called"); });
  const value = Object.defineProperty({ impact: "private payload", oldChildEnd: "private payload" }, "oldChildStart", { get });
  const snapshot = snapshotImpactRejection(value, { toString: get });
  expect(snapshot).toMatchObject({ impact: "unknown", affectedParagraphCount: { type: "object" },
    ranges: { oldChildStart: { field: "accessor" }, oldChildEnd: { type: "string" }, newChildStart: { field: "missing" } } });
  expect(JSON.stringify(snapshot)).not.toContain("private payload");
  expect(get).not.toHaveBeenCalled();
  expect(snapshotImpactRejection(new Proxy({}, { getOwnPropertyDescriptor: get }), 1)).toEqual({ unreadable: true });
});

it("bounds retained observations, isolates nested snapshots, and preserves rejection on emission errors", () => {
  const emit = vi.fn((value: { ranges: { oldChildStart: { type: string } } }) => {
    value.ranges.oldChildStart.type = "changed";
    throw new Error("sink failed");
  });
  const recorder = createLinkFaultRecorder(undefined, undefined, undefined, undefined, undefined, undefined, emit);
  for (let i = 0; i < 20; i++) expect(recorder.impactRejection("wasm_projection_adapter:impact:505", null, valid, 1)).toBeNull();
  expect(emit).toHaveBeenCalledTimes(8);
  expect(recorder.snapshot().impacts).toHaveLength(8);
  expect(recorder.snapshot().impacts[0]).toMatchObject({ ranges: { oldChildStart: { type: "undefined" } } });
  (recorder.snapshot().impacts[0] as { ranges: { oldChildStart: { type: string } } }).ranges.oldChildStart.type = "changed";
  expect(recorder.snapshot().impacts[0]).toMatchObject({ ranges: { oldChildStart: { type: "undefined" } } });
});
