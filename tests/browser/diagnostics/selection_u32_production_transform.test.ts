import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseSync } from "rolldown/utils";
import {
  selectionU32Original,
  selectionU32Production,
  transformSelectionU32Production,
} from "./selection_u32_production_transform";
import { selectionU32BitsCandidate } from "./selection_u32_bits_candidate";

const source = readFileSync(new URL("../../../packages/breditor-browser/dist/wasm_selection_adapter.js", import.meta.url), "utf8");

it("matches the exact shipping guard and keeps compact mode byte-identical", () => {
  expect(source.split(selectionU32Production)).toHaveLength(2);
  expect(transformSelectionU32Production(source, "compact")).toBe(source);
});

it.each([["original", selectionU32Original], ["bits", selectionU32BitsCandidate]] as const)(
  "%s control changes only the one shipping selection guard", (mode, replacement) => {
    const output = transformSelectionU32Production(source, mode);
    expect(output).not.toBe(source);
    expect(parseSync(`${mode}.js`, output).errors).toEqual([]);
    expect(output.replace(replacement, selectionU32Production)).toBe(source);
    expect(() => transformSelectionU32Production(output, mode)).toThrow("source differs");
  },
);

it("refuses missing or duplicate guard source", () => {
  expect(() => transformSelectionU32Production("", "compact")).toThrow("source differs");
  expect(() => transformSelectionU32Production(source + source, "compact")).toThrow("source differs");
});
