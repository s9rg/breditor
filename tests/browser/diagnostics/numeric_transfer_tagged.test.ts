import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { probeNumericRange } from "../harness/numeric_transfer_tagged_probe";

it("keeps validators, sources, scheduling and failure snapshots identical to the staged control", () => {
  const staged = readFileSync(new URL("../harness/numeric_transfer_staged_probe.ts", import.meta.url), "utf8");
  const tagged = readFileSync(new URL("../harness/numeric_transfer_tagged_probe.ts", import.meta.url), "utf8");
  const body = (source: string) => source.slice(source.indexOf("function originalPositiveU32"));
  const replacement = `    // Use a non-number sentinel during construction, then preserve the exact
    // five-element numeric sequence used by the unchanged staged probe.
    const taggedValues = [literalValue, typedValue, parsedValue, convertedValue, selectedValue, {}];
    taggedValues.length = 5;
    const values = taggedValues as number[];`;
  expect(body(tagged)).toBe(body(staged).replace(
    "    const values = [literalValue, typedValue, parsedValue, convertedValue, selectedValue];", replacement));
});

it("validates exactly five numbers per iteration after removing the sentinel", async () => {
  expect(await probeNumericRange(20)).toEqual({ iterations: "20", checks: "300" });
});

it.each([0, -1, 100001, 1.5, NaN, Infinity])("rejects an invalid diagnostic budget %s", async budget => {
  await expect(probeNumericRange(budget)).rejects.toThrow("invalid diagnostic budget");
});
