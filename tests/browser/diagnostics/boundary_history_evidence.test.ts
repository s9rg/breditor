import { expect, it } from "vitest";
import { assertCleanBoundaryHistoryEvidence } from "./boundary_history_evidence";
import { createLinkFaultRecorder } from "./link_fault_recorder";

it("accepts the complete empty recorder", () => {
  expect(() => assertCleanBoundaryHistoryEvidence(createLinkFaultRecorder().snapshot(), [])).not.toThrow();
});

it.each(["events", "points", "loops", "numeric", "children", "requiredProperties", "impacts", "textRuns"])(
  "rejects retained %s even when the history workload completed", field => {
    const snapshot = { ...createLinkFaultRecorder().snapshot(), [field]: [{}] };
    expect(() => assertCleanBoundaryHistoryEvidence(snapshot, [])).toThrow("recorded an adapter fault");
  },
);

it("rejects a real captured false predicate without re-evaluating it", () => {
  const recorder = createLinkFaultRecorder();
  recorder.numericPredicate("wasm_selection_adapter:numeric:265:operand:2", false, 6);
  expect(() => assertCleanBoundaryHistoryEvidence(recorder.snapshot(), [])).toThrow("recorded an adapter fault");
});

it("rejects missing evidence, omitted faults, and Rust rejections", () => {
  expect(() => assertCleanBoundaryHistoryEvidence(undefined, [])).toThrow("recorded an adapter fault");
  expect(() => assertCleanBoundaryHistoryEvidence(createLinkFaultRecorder().snapshot(), undefined))
    .toThrow("recorded a Rust selection rejection");
  expect(() => assertCleanBoundaryHistoryEvidence({ ...createLinkFaultRecorder().snapshot(), omitted: 1 }, []))
    .toThrow("recorded an adapter fault");
  expect(() => assertCleanBoundaryHistoryEvidence(createLinkFaultRecorder().snapshot(), ["BREDITOR_RUST_SELECTION={}"]))
    .toThrow("recorded a Rust selection rejection");
});
