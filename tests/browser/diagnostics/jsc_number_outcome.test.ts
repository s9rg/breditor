import { expect, it } from "vitest";
import { readJscOutcome } from "../../../scripts/run-jsc-number-repro.mjs";

const report = { outcome: "passed", result: { mode: "tiny-wasm", iterations: 10000, reads: 20000 }, diagnostic: { events: [], omitted: 0 } };
const child = (value: unknown) => ({ stdout: JSON.stringify(value), status: 0, signal: null });
it("requires a complete clean pass report", () => { expect(readJscOutcome(child(report)).passed).toBe(true); });
it("does not treat jsc's zero exit status as success", () => {
  expect(readJscOutcome(child({ outcome: "failed", error: "comparison rejected" })).passed).toBe(false);
  expect(readJscOutcome({ stdout: "", status: 0, signal: null }).passed).toBe(false);
});
it("requires the context-control flag before and after a complete pass", () => {
  for (const [mode, flag, value] of [
    ["no-jit-serial-gc", "useConcurrentGC", 0],
    ["no-jit-polling", "usePollingTraps", 1],
    ["no-jit-posix", "useMachForExceptions", 0],
    ["no-jit-no-gc", "useGC", 0],
  ] as const) {
    const options = { useJIT: 0, [flag]: value };
    const evidence = { ...report, initialEngineOptions: options, finalEngineOptions: options };
    expect(readJscOutcome(child(evidence), mode).passed).toBe(true);
    expect(readJscOutcome(child({ ...evidence, finalEngineOptions: { useJIT: 0 } }), mode).passed).toBe(false);
    expect(readJscOutcome(child({ ...evidence, initialEngineOptions: { ...options, [flag]: 1 - value } }), mode).passed).toBe(false);
  }
});
it("rejects interrupted, malformed, and incomplete results", () => {
  expect(readJscOutcome({ ...child(report), error: new Error("timeout") }).passed).toBe(false);
  expect(readJscOutcome({ ...child(report), signal: "SIGKILL" }).passed).toBe(false);
  expect(readJscOutcome({ ...child(report), status: 1 }).passed).toBe(false);
  expect(readJscOutcome(child({ ...report, result: { ...report.result, reads: 2 } })).passed).toBe(false);
  expect(readJscOutcome(child({ ...report, diagnostic: { events: [], omitted: 1 } })).passed).toBe(false);
  expect(readJscOutcome(child(null)).passed).toBe(false);
});
it("verifies requested compiler flags both before and after execution", () => {
  const disabled = { useJIT: 0, useDFGJIT: 0, useFTLJIT: 0 };
  const evidence = { ...report, initialEngineOptions: disabled, finalEngineOptions: disabled };
  expect(readJscOutcome(child(evidence), "no-jit").passed).toBe(true);
  expect(readJscOutcome(child(evidence), "normal").passed).toBe(false);
  expect(readJscOutcome(child(report), "no-jit").passed).toBe(false);
  expect(readJscOutcome(child({ ...evidence, finalEngineOptions: { useJIT: 1 } }), "no-jit").passed).toBe(false);
  expect(readJscOutcome(child({ ...evidence, initialEngineOptions: { useJIT: "false" } }), "no-jit").passed).toBe(false);
});
