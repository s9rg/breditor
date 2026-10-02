import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { probeNumericRange } from "../harness/numeric_transfer_storage_capture_probe";
it("adds only a cold-path storage observation to the staged control body", () => {
  const staged = readFileSync(new URL("../harness/numeric_transfer_staged_probe.ts", import.meta.url), "utf8");
  const capture = readFileSync(new URL("../harness/numeric_transfer_storage_capture_probe.ts", import.meta.url), "utf8");
  const body = (s: string) => s.slice(s.indexOf("function originalPositiveU32"));
  expect(body(capture)).toBe(body(staged).replace("          value: snapshot(value), maximum: snapshot(4_294_967_295),", "          value: snapshot(value), maximum: snapshot(4_294_967_295),\n          storage: (globalThis as typeof globalThis & { $vm?: { indexingMode(value: unknown): string } }).$vm?.indexingMode(values) ?? \"unavailable\","));
});
it("never invokes native inspection on a successful probe", async () => {
  const inspect = vi.fn(() => "ArrayWithDouble");
  vi.stubGlobal("$vm", { indexingMode: inspect });
  try {
    expect(await probeNumericRange(20)).toEqual({ iterations: "20", checks: "300" });
    expect(inspect).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
it("records storage only after a deliberately rejected predicate", async () => {
  const inspect = vi.fn(() => "ArrayWithDouble");
  vi.stubGlobal("$vm", { indexingMode: inspect });
  vi.spyOn(Number, "isInteger").mockReturnValue(false);
  vi.spyOn(console, "debug").mockImplementation(() => {});
  try {
    await expect(probeNumericRange(1)).rejects.toThrow('"storage":"ArrayWithDouble"');
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(inspect).toHaveBeenCalledWith([1, 1, 1, 1, 1]);
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
