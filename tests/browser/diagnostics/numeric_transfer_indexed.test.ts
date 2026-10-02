import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { probeNumericRange } from "../harness/numeric_transfer_indexed_probe";

it("changes only array allocation and writes compared with the staged control", () => {
  const staged = readFileSync(new URL("../harness/numeric_transfer_staged_probe.ts", import.meta.url), "utf8");
  const indexed = readFileSync(new URL("../harness/numeric_transfer_indexed_probe.ts", import.meta.url), "utf8");
  const body = (source: string) => source.slice(source.indexOf("function originalPositiveU32"));
  expect(body(indexed)).toBe(body(staged).replace(
    "    const values = [literalValue, typedValue, parsedValue, convertedValue, selectedValue];",
    `    // Seed double storage separately, then exercise ordinary indexed writes.
    // This changes allocation/code shape; it is not a proposed editor fix.
    const values = [0.5, 0.5, 0.5, 0.5, 0.5];
    values[0] = literalValue;
    values[1] = typedValue;
    values[2] = parsedValue;
    values[3] = convertedValue;
    values[4] = selectedValue;`));
});
it("overwrites every fractional placeholder and checks all five numeric values", async () => {
  expect(await probeNumericRange(20)).toEqual({ iterations: "20", checks: "300" });
});
it.each([0, -1, 100001, 1.5, NaN, Infinity])("rejects invalid budget %s", async budget => {
  await expect(probeNumericRange(budget)).rejects.toThrow("invalid diagnostic budget");
});
