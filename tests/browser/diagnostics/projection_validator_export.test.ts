import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { exposeProjectionValidator } from "./projection_validator_export";

const id = "/repo/packages/breditor-browser/dist/projection.js";
it("exposes the built validator without changing any existing source byte", () => {
  const source = readFileSync(new URL("../../../packages/breditor-browser/dist/projection.js", import.meta.url), "utf8");
  const result = exposeProjectionValidator(source, id)!;
  expect(result.code.slice(0, -result.suffix.length)).toBe(source);
  expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(() => exposeProjectionValidator(result.code, id)).toThrow("already exposed");
});
it("rejects drift and ignores unrelated modules", () => {
  expect(exposeProjectionValidator("", "/other.js")).toBeNull();
  expect(() => exposeProjectionValidator("function other() {}", id)).toThrow("source drift");
  expect(() => exposeProjectionValidator("function {", id)).toThrow("source drift");
});
