import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { exposeSelectionValidators } from "./selection_validator_export";

const id = "/repo/packages/breditor-browser/dist/wasm_selection_adapter.js";
it("exposes the actual selection predicates without rewriting any source byte", () => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/wasm_selection_adapter.js", import.meta.url), "utf8");
  const result = exposeSelectionValidators(source, id)!;
  expect(result.code.slice(0, -result.suffix.length)).toBe(source);
  expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(() => exposeSelectionValidators(result.code, id)).toThrow("already exposed");
});
it("refuses missing predicates and syntax drift, and ignores unrelated modules", () => {
  expect(exposeSelectionValidators("", "/other.js")).toBeNull();
  expect(() => exposeSelectionValidators("function isU32() {}", id)).toThrow("source drift");
  expect(() => exposeSelectionValidators("function readPoint() {}", id)).toThrow("source drift");
  expect(() => exposeSelectionValidators("function {", id)).toThrow();
});
