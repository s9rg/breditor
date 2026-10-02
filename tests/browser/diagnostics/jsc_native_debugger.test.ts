import { expect, it } from "vitest";
import { analyzeSelectSnapshot, decodeNativeNumber, readNativeOutcome } from "../../../scripts/debug-jsc-number-repro.mjs";

it("decodes the pinned numeric representation without treating pointers as numbers", () => {
  expect(decodeNativeNumber("0xfffe000000000800")).toBe(2048);
  expect(decodeNativeNumber("0x40a2000000000000")).toBe(2048);
  expect(decodeNativeNumber("0x40a2020000000000")).toBe(2049);
  expect(decodeNativeNumber("0x0000000123456000")).toBeNull();
  expect(decodeNativeNumber("bad")).toBeNull();
});
const capture = { stopped: true, breakpointStop: true, breakpointHits: 1,
  registers: { x0: "0x40a2020000000000", x2: "0xfffe000000000800" } };
const child = (value: object) => ({ status: 0, signal: null, stdout: `BREDITOR_NATIVE_CAPTURE=${JSON.stringify(value)}\n` });
it("requires the intentional unequal operands to confirm the negative control", () => {
  expect(readNativeOutcome(child(capture), "negative-control", "baseline").outcome).toBe("negative-control-confirmed");
  expect(readNativeOutcome(child(capture), "probe", "baseline").outcome).toBe("native-stop-needs-inspection");
  expect(readNativeOutcome(child({ ...capture, registers: {} }), "negative-control", "baseline").outcome).not.toBe("negative-control-confirmed");
});
it("never counts a launch failure or debugger interruption as a pass", () => {
  expect(readNativeOutcome({ status: 0, stdout: "attach denied" }, "probe", "baseline").outcome).toBe("incomplete-debugger-run");
  expect(readNativeOutcome({ ...child(capture), error: new Error("timeout") }, "negative-control", "baseline").outcome).toBe("debugger-error");
  expect(readNativeOutcome(child({ ...capture, breakpointStop: false }), "probe", "baseline").outcome).toBe("unconfirmed-control-or-stop");
  expect(readNativeOutcome({ status: 0, stdout: "BREDITOR_NATIVE_CAPTURE=null\n" }, "probe", "baseline").outcome).toBe("invalid-debugger-output");
});
it("confirms the conversion control only at the expected instruction with equal decoded registers", () => {
  const value = { ...capture, fileAddress: "0x112ce9c", registers: { x0: "0x40a2000000000000", x2: "0xfffe000000000800", d0: "2048", d1: "2048" } };
  expect(readNativeOutcome(child(value), "conversion-control", "baseline").outcome).toBe("conversion-control-confirmed");
  expect(readNativeOutcome(child({ ...value, registers: { ...value.registers, d0: "0" } }), "conversion-control", "baseline").outcome).toBe("native-stop-needs-inspection");
});

const completed = { stopped: false, exited: true, exitStatus: 0, breakpointHits: 0 };
const options = { useJIT: 1, useDFGJIT: 0, useFTLJIT: 0 };
const report = { outcome: "passed", result: { mode: "tiny-wasm", iterations: 10000, reads: 20000 },
  diagnostic: { events: [], omitted: 0 }, initialEngineOptions: options, finalEngineOptions: options };
const completedChild = (value: object) => ({ ...child(completed),
  stdout: JSON.stringify(value) + "\n" + child(completed).stdout });
it("requires a complete verified probe, not just a clean debugger exit", () => {
  expect(readNativeOutcome(completedChild(report), "probe", "baseline").outcome).toBe("probe-passed-no-native-stop");
  expect(readNativeOutcome(completedChild(report), "probe", "no-jit").outcome).toBe("probe-failed-without-native-stop");
  expect(readNativeOutcome(child(completed), "probe", "baseline").outcome).toBe("unconfirmed-control-or-stop");
});
it("separates debugger-induced timeouts from arithmetic counterexamples", () => {
  const value = { ...report, outcome: "failed", error: "Standalone probe exceeded 30 seconds" };
  expect(readNativeOutcome(completedChild(value), "probe-conversion", "baseline").outcome).toBe("probe-timeout-inconclusive");
  expect(readNativeOutcome(completedChild({ ...value, error: "Standalone probe exceeded 120 seconds" }),
    "probe-conversion-slow", "baseline").outcome).toBe("probe-timeout-inconclusive");
});

it("does not mistake a successful instruction replay for a successful original call", () => {
  const original = { ...capture, registers: { x0: "0x40a2000000000000", x2: "0xfffe000000000800" },
    replay: { outcome: "reached-true-return" } };
  expect(readNativeOutcome(child(original), "probe-replay", "baseline").outcome).toBe("native-stop-needs-inspection");
});

it("requires an installed non-control guard before accepting a guarded completion", () => {
  expect(readNativeOutcome(completedChild(report), "probe-guard", "baseline").outcome).toBe("missing-or-invalid-guard");
  const output = { ...completedChild(report), stdout: JSON.stringify(report) + "\n" +
    child({ ...completed, guard: { control: false } }).stdout };
  expect(readNativeOutcome(output, "probe-guard", "baseline").outcome).toBe("probe-passed-no-native-stop");
});

it("confirms the intentional guard mismatch only with the expected inputs and snapshots", () => {
  const stopped = { ...capture, guardStop: true, guardPhase: "first", guard: { control: true },
    registers: { x0: "0x40a2000000000000", x2: "0xfffe000000000800",
      x3: "0x0000000000000000", x4: "0x40a0000000000000" } };
  expect(readNativeOutcome(child(stopped), "guard-control", "no-jit").outcome).toBe("guard-control-confirmed");
  expect(readNativeOutcome(child({ ...stopped, guard: { control: false } }), "guard-control", "no-jit").outcome).not.toBe("guard-control-confirmed");
  expect(readNativeOutcome(child(stopped), "probe-guard", "no-jit").outcome).toBe("native-stop-needs-inspection");
});

it("requires the requested native instruction variant before counting completion", () => {
  expect(readNativeOutcome(completedChild(report), "probe-select-swap", "baseline").outcome).toBe("missing-or-invalid-select-variant");
  const output = { stdout: JSON.stringify(report) + "\n" + child({ ...completed, selectPatch: { variant: "swap" } }).stdout,
    status: 0, signal: null };
  expect(readNativeOutcome(output, "probe-select-swap", "baseline").outcome).toBe("probe-passed-no-native-stop");
  expect(readNativeOutcome(output, "probe-select-control", "baseline").outcome).toBe("missing-or-invalid-select-variant");
});

it("rejects stopped captures from a missing or different native experiment", () => {
  for (const scenario of ["probe-select-snapshot", "probe-select-branch", "probe-select-relocated"]) {
    expect(readNativeOutcome(child(capture), scenario, "no-jit").outcome)
      .toBe("missing-or-invalid-select-variant");
    expect(readNativeOutcome(child({ ...capture, selectPatch: { variant: "swap" } }), scenario, "no-jit").outcome)
      .toBe("missing-or-invalid-select-variant");
    expect(readNativeOutcome(child({ ...capture, selectPatch: { variant: scenario.slice("probe-select-".length) } }), scenario, "no-jit").outcome)
      .toBe("native-stop-needs-inspection");
  }
});

it("identifies a first-select mismatch only from complete before/after snapshots", () => {
  const snapshot = { selectPatch: { variant: "snapshot" }, registers: {
    x4: "0x40a0000000000000", x5: "0x0000000000000000", x7: "0x0000000000000000",
    x11: "0x0000000000000000", x12: "0x0000000000000000", x13: "0x40a0000000000000",
  } };
  expect(analyzeSelectSnapshot(snapshot)).toMatchObject({ conditionWasTrue: false,
    flagsUnchanged: true, doubleSourceUnchanged: true, resultMatchesCondition: false,
    expectedBits: "0x40a0000000000000" });
  expect(analyzeSelectSnapshot({ ...snapshot, registers: { ...snapshot.registers, x12: snapshot.registers.x4 } }))
    .toMatchObject({ resultMatchesCondition: true });
  expect(analyzeSelectSnapshot({ ...snapshot, registers: { ...snapshot.registers, x7: "0x20000000", x11: "0x20000000" } }))
    .toMatchObject({ conditionWasTrue: true, resultMatchesCondition: true });
  expect(analyzeSelectSnapshot({ ...snapshot, registers: { ...snapshot.registers, x7: "0x60000000" } }))
    .toMatchObject({ conditionWasTrue: false, flagsUnchanged: false });
  expect(analyzeSelectSnapshot({ ...snapshot, registers: {} })).toBeNull();
  expect(analyzeSelectSnapshot({ ...snapshot, selectPatch: { variant: "branch" } })).toBeNull();
});

it("requires all conformance checks, the native patch and matching engine options", () => {
  const evidence = { outcome: "passed", checks: 1300, initialEngineOptions: options, finalEngineOptions: options };
  const output = { stdout: JSON.stringify(evidence) + "\n" + child({ ...completed, selectPatch: { variant: "branch" } }).stdout,
    status: 0, signal: null };
  expect(readNativeOutcome(output, "select-branch-conformance", "baseline").outcome).toBe("select-branch-conformance-confirmed");
  expect(readNativeOutcome({ ...output, stdout: output.stdout.replace('"checks":1300', '"checks":1299') },
    "select-branch-conformance", "baseline").outcome).toBe("select-branch-conformance-failed");
  expect(readNativeOutcome(output, "select-branch-conformance", "no-jit").outcome).toBe("select-branch-conformance-failed");
});
