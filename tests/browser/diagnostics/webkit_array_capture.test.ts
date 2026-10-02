import { expect, it } from "vitest";
// @ts-expect-error Node diagnostic CLI is intentionally JavaScript.
import { readBrowserArrayCapture } from "../../../scripts/debug-webkit-array-repro.mjs";
const child = (capture: unknown) => ({ stdout: "BREDITOR_ARRAY_CAPTURE=" + JSON.stringify(capture), status: 0, signal: null });
const complete = { result: { iterations: "10000", checks: "150000" } };
it("requires the full browser result and a clean exited post-store guard", () => {
  const c = { guard: { variant: "probe", placement: "post-store" }, stopped: false, exited: true, exitStatus: 0 };
  expect(readBrowserArrayCapture(child(c), "probe", complete).outcome).toBe("browser-probe-passed");
  expect(readBrowserArrayCapture(child(c), "probe", { error: "page crashed" }).outcome).toBe("browser-probe-failed");
  expect(readBrowserArrayCapture(child({ ...c, stopped: true }), "probe", complete).outcome).toBe("incomplete-native-run");
  expect(readBrowserArrayCapture(child(c), "probe", { result: { iterations: "10000", checks: "149999" } }).outcome).toBe("browser-probe-failed");
});
it("keeps an unpatched baseline distinct from native fault evidence", () => {
  expect(readBrowserArrayCapture(child({ guard: null, stopped: false, exited: true, exitStatus: 0 }), "baseline", complete).outcome).toBe("browser-baseline-passed");
});
it("requires the explicitly requested guard placement", () => {
  const c = { guard: { variant: "probe", placement: "post-conversion" }, stopped: false, exited: true, exitStatus: 0 };
  expect(readBrowserArrayCapture(child(c), "probe", complete).outcome).toBe("unexpected-guard-placement");
  expect(readBrowserArrayCapture(child(c), "probe", complete, "post-conversion").outcome).toBe("browser-probe-passed");
});
it.each(["post-store-near", "post-store-pattern", "select-relocated", "select-branch", "select-entry-control", "select-allocation-control"])("keeps %s results tied to their exact instrumentation", placement => {
  const c = { guard: { variant: "probe", placement }, stopped: false, exited: true, exitStatus: 0 };
  expect(readBrowserArrayCapture(child(c), "probe", complete, placement).outcome).toBe("browser-probe-passed");
  expect(readBrowserArrayCapture(child(c), "probe", complete).outcome).toBe("unexpected-guard-placement");
});
it("captures the raw array pattern even if zero arrived as the initializer input", () => {
  const c = { guard: { variant: "probe", placement: "post-store-pattern" }, stopped: true, guardStop: true,
    registers: { x2: "0x4", x3: "0xfffe000000000000", x9: "0xfffdffffffffffff", x10: "0x0", x11: "0x40a0000000000000", x12: "0x0" },
    storedArray: { littleEndianHex: "000000000000a040".repeat(4) + "0000000000000000" },
    storedSlot: { littleEndianHex: "0000000000000000" } };
  const read = (capture: unknown) => readBrowserArrayCapture(child(capture), "probe", { error: "killed after capture" }, "post-store-pattern");
  expect(read(c).outcome).toBe("native-array-pattern-captured");
  expect(read({ ...c, storedArray: { littleEndianHex: "0000000000000000".repeat(5) } }).outcome).toBe("native-pattern-stop-needs-inspection");
  expect(read({ ...c, registers: { ...c.registers, x2: "0x3" } }).outcome).toBe("native-pattern-stop-needs-inspection");
  expect(read({ ...c, storedSlot: undefined }).outcome).toBe("native-pattern-stop-needs-inspection");
  expect(readBrowserArrayCapture({ ...child(c), status: 1 }, "probe", complete, "post-store-pattern").outcome).toBe("debugger-error");
});
it("requires intact real storage for the pattern guard's deliberate control", () => {
  const c = { guard: { variant: "control", placement: "post-store-pattern" }, stopped: true, guardStop: true,
    registers: { x2: "0x4", x3: "0x40a2000000000000", x9: "0xfffdffffffffffff", x10: "0x0", x11: "0x40a0000000000000", x12: "0x0" },
    storedArray: { littleEndianHex: "000000000000a040".repeat(5) }, storedSlot: { littleEndianHex: "000000000000a040" } };
  expect(readBrowserArrayCapture(child(c), "control", {}, "post-store-pattern").outcome).toBe("control-confirmed");
  expect(readBrowserArrayCapture(child(c), "probe", {}, "post-store-pattern").outcome).toBe("missing-or-invalid-guard");
});
it("preserves native mismatch evidence even when killing the child rejects page evaluation", () => {
  const c = { guard: { variant: "probe", placement: "post-store" }, stopped: true, guardStop: true,
    registers: { x3: "0x40a2000000000000", x9: "0xfffdffffffffffff", x10: "0x0", x11: "0x40a0000000000000", x12: "0x0" } };
  expect(readBrowserArrayCapture(child(c), "probe", { error: "page crashed" }).outcome).toBe("native-conversion-mismatch");
  expect(readBrowserArrayCapture({ ...child(c), signal: "SIGKILL" }, "probe", complete).outcome).toBe("debugger-error");
});
it("does not accept completed page counters as proof of a clean native run", () => {
  const c = { guard: { variant: "probe", placement: "post-store" }, stopped: false, exited: true, exitStatus: 9 };
  expect(readBrowserArrayCapture(child(c), "probe", complete).outcome).toBe("incomplete-native-run");
  expect(readBrowserArrayCapture({ ...child(c), stdout: "" }, "probe", complete).outcome).toBe("missing-or-invalid-guard");
  expect(readBrowserArrayCapture({ ...child(c), stdout: child(c).stdout + "\n" + child(c).stdout }, "probe", complete).outcome).toBe("missing-or-invalid-guard");
  expect(readBrowserArrayCapture({ ...child(c), status: 1 }, "probe", complete).outcome).toBe("debugger-error");
});
it("keeps an errored page result failed even if it also contains complete counters", () => {
  const c = { guard: null, stopped: false, exited: true, exitStatus: 0 };
  expect(readBrowserArrayCapture(child(c), "baseline", { ...complete, error: "late rejection" }).outcome).toBe("browser-baseline-failed");
});
