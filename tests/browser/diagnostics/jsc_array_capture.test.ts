import { expect, it } from "vitest";
// @ts-expect-error The native controller is intentionally a Node JavaScript CLI.
import { readArrayCapture } from "../../../scripts/debug-jsc-array-repro.mjs";

function snapshot(variant = "probe") {
  return { guard: { variant }, stopped: true, guardStop: true,
    registers: { x3: "0x40a2000000000000", x9: "0xfffdffffffffffff",
      x10: "0x0000000000000000", x11: "0x40a0000000000000", x12: "0x0000000000000000" } };
}
const child = (capture: unknown) => ({ stdout: "BREDITOR_ARRAY_CAPTURE=" + JSON.stringify(capture), status: 0, signal: null });
it("recognizes a double conversion mismatch from raw bits", () => {
  expect(readArrayCapture(child(snapshot()), "probe")).toMatchObject({
    outcome: "native-conversion-mismatch", expectedBits: "0x40a0000000000000", actualBits: "0x0000000000000000" });
});
it("never labels the deliberately altered control snapshot as a real mismatch", () => {
  expect(readArrayCapture(child(snapshot("control")), "control").outcome).toBe("control-confirmed");
  expect(readArrayCapture(child(snapshot("control")), "probe").outcome).toBe("missing-or-invalid-guard");
  expect(readArrayCapture(child(snapshot()), "control").outcome).toBe("missing-or-invalid-guard");
});
it.each([
  { x3: "0xfffe000000000800" }, { x9: "0x0000000000000000" },
  { x11: "0x40a0000000000001" }, { x10: "0x40a0000000000000" },
])("requires a consistent double input, decoded candidate and mismatch: %j", patch => {
  const capture = snapshot();
  Object.assign(capture.registers, patch);
  expect(readArrayCapture(child(capture), "probe").outcome).toBe("native-stop-needs-inspection");
});
it("does not treat missing capture, malformed registers or process failure as evidence", () => {
  expect(readArrayCapture({ stdout: "", status: 0, signal: null }, "probe").outcome).toBe("missing-or-invalid-guard");
  const capture = snapshot();
  capture.registers.x10 = "not bits";
  expect(readArrayCapture(child(capture), "probe").outcome).toBe("invalid-registers");
  expect(readArrayCapture({ ...child(snapshot()), signal: "SIGKILL" }, "probe").outcome).toBe("debugger-error");
  expect(readArrayCapture({ ...child(snapshot()), error: new Error("timeout") }, "probe").outcome).toBe("debugger-error");
});

const completeReport = () => ({ format: "breditor/jsc-range", outcome: "passed",
  result: { iterations: "10000", checks: "150000" }, error: null, events: [],
  initialEngineOptions: { useJIT: 0 }, finalEngineOptions: { useJIT: 0 } });
function completedChild(report = completeReport()) {
  return { ...child({ guard: { variant: "probe" }, stopped: false, exited: true, exitStatus: 0 }),
    stdout: JSON.stringify(report) + "\n" + child({ guard: { variant: "probe" }, stopped: false, exited: true, exitStatus: 0 }).stdout };
}
it("does not accept a short guarded or debugger-baseline run for a larger budget", () => {
  expect(readArrayCapture(completedChild(), "probe", 100000).outcome).toBe("probe-failed-without-native-stop");
  const long = completeReport();
  long.result = { iterations: "100000", checks: "1500000" };
  expect(readArrayCapture(completedChild(long), "probe", 100000).outcome).toBe("probe-passed-no-native-stop");
  const native = child({ guard: null, stopped: false, exited: true, exitStatus: 0 });
  native.stdout += "\n" + JSON.stringify(completeReport());
  expect(readArrayCapture(native, "baseline", 100000).outcome).toBe("baseline-failed");
});
it("requires the complete probe result, not just a clean native exit", () => {
  expect(readArrayCapture(completedChild(), "probe").outcome).toBe("probe-passed-no-native-stop");
  expect(readArrayCapture(child({ guard: { variant: "probe" }, stopped: false, exited: true, exitStatus: 0 }), "probe").outcome).toBe("incomplete-native-run");
  const incomplete = completeReport();
  incomplete.result.checks = "149999";
  expect(readArrayCapture(completedChild(incomplete), "probe").outcome).toBe("probe-failed-without-native-stop");
});
it("does not turn a JS rejection, enabled JIT, or duplicate reports into a native conversion finding", () => {
  const rejected = completeReport();
  rejected.outcome = "failed";
  expect(readArrayCapture(completedChild(rejected), "probe").outcome).toBe("probe-failed-without-native-stop");
  const jit = completeReport();
  jit.finalEngineOptions.useJIT = 1;
  expect(readArrayCapture(completedChild(jit), "probe").outcome).toBe("probe-failed-without-native-stop");
  const duplicate = completedChild();
  duplicate.stdout += "\n" + JSON.stringify(completeReport());
  expect(readArrayCapture(duplicate, "probe").outcome).toBe("incomplete-native-run");
});
it("keeps the unpatched debugger baseline distinct from a guarded run", () => {
  const native = child({ guard: null, stopped: false, exited: true, exitStatus: 0 });
  native.stdout += "\n" + JSON.stringify(completeReport());
  expect(readArrayCapture(native, "baseline").outcome).toBe("baseline-passed");
  expect(readArrayCapture(native, "probe").outcome).toBe("missing-or-invalid-guard");
  expect(readArrayCapture(completedChild(), "baseline").outcome).toBe("incomplete-baseline-run");
  const failed = completeReport();
  failed.outcome = "failed";
  native.stdout = child({ guard: null, stopped: false, exited: true, exitStatus: 0 }).stdout + "\n" + JSON.stringify(failed);
  expect(readArrayCapture(native, "baseline").outcome).toBe("baseline-failed");
});
