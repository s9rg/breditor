import { expect, it } from "vitest";
// @ts-expect-error Node diagnostic runner is intentionally JavaScript.
import { readJscRangeOutcome } from "../../../scripts/run-jsc-range-repro.mjs";

function valid() {
  return { format: "breditor/jsc-range", outcome: "passed", error: null,
    result: { iterations: "10000", checks: "150000" }, events: [],
    initialEngineOptions: { useJIT: 1 }, finalEngineOptions: { useJIT: 1 } };
}
const child = (report: unknown) => ({ stdout: JSON.stringify(report), status: 0, signal: null });
it("requires the requested larger budget in both iteration and check counters", () => {
  const report = valid();
  report.result = { iterations: "100000", checks: "1500000" };
  expect(readJscRangeOutcome(child(report), "normal", 100000).passed).toBe(true);
  expect(readJscRangeOutcome(child(report), "normal").passed).toBe(false);
  expect(readJscRangeOutcome(child(valid()), "normal", 100000).passed).toBe(false);
  expect(readJscRangeOutcome(child(report), "normal", 100001).passed).toBe(false);
  report.result.checks = "150000";
  expect(readJscRangeOutcome(child(report), "normal", 100000).passed).toBe(false);
});
it("requires complete evidence and the requested engine mode, not only exit zero", () => {
  expect(readJscRangeOutcome(child(valid()), "normal").passed).toBe(true);
  expect(readJscRangeOutcome(child(valid()), "no-jit").passed).toBe(false);
  expect(readJscRangeOutcome(child(valid()), "unknown").passed).toBe(false);
  const interpreted = valid();
  interpreted.initialEngineOptions.useJIT = interpreted.finalEngineOptions.useJIT = 0;
  expect(readJscRangeOutcome(child(interpreted), "no-jit").passed).toBe(true);
});
it.each([
  { outcome: "failed" }, { error: "unexpected zero" }, { result: { iterations: "9999", checks: "149985" } },
  { events: ["BREDITOR_RANGE_REJECTION=unexpected"] }, { finalEngineOptions: { useJIT: 0 } },
])("rejects incomplete or contradictory result %j", (patch) => {
  expect(readJscRangeOutcome(child({ ...valid(), ...patch }), "normal").passed).toBe(false);
});
it("does not classify timeout, signal, bad output or nonzero exit as success", () => {
  for (const patch of [{ error: new Error("timeout") }, { status: 1 }, { signal: "SIGKILL" }, { stdout: "" }]) {
    expect(readJscRangeOutcome({ ...child(valid()), ...patch }, "normal").passed).toBe(false);
  }
});
