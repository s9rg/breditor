import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { probeNumericRange } from "../harness/numeric_transfer_int32_probe";

it("changes only the five array operands, preserving the staged control body", () => {
  const staged = readFileSync(new URL("../harness/numeric_transfer_staged_probe.ts", import.meta.url), "utf8");
  const int32 = readFileSync(new URL("../harness/numeric_transfer_int32_probe.ts", import.meta.url), "utf8");
  const body = (source: string) => source.slice(source.indexOf("function originalPositiveU32"));
  expect(body(int32)).toBe(body(staged).replace(
    "    const values = [literalValue, typedValue, parsedValue, convertedValue, selectedValue];",
    "    const values = [literalValue | 0, typedValue | 0, parsedValue | 0, convertedValue | 0, selectedValue | 0];"));
});
it("retains the diagnostic's small input values and exact check count", async () => {
  expect(await probeNumericRange(20)).toEqual({ iterations: "20", checks: "300" });
});
it("documents why this coercion cannot be used as an editor-wide fix", () => {
  expect(4294967295 | 0).toBe(-1);
  expect(1.5 | 0).toBe(1);
  expect(Object.is(-0 | 0, -0)).toBe(false);
});
