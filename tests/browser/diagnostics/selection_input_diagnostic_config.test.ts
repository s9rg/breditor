import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import diagnostic from "../../../vite.selection-input-diagnostic.config";
import ordinary from "../../../vite.adapter-reduction.config";

it("only the explicit Rust diagnostic configuration redirects the package", () => {
  expect(ordinary.resolve).toBeUndefined();
  const aliases = diagnostic.resolve?.alias;
  expect(Array.isArray(aliases)).toBe(true);
  if (!Array.isArray(aliases)) throw new Error("expected exact alias list");
  expect(aliases).toHaveLength(1);
  const alias = aliases[0]!;
  expect(alias.find).toEqual(/^@breditor\/wasm$/);
  expect(alias.replacement).toMatch(/\/target\/selection-input-diagnostic\/pkg\/breditor_wasm\.js$/);
});

it("the opt-in build does not replace distribution files", () => {
  const script = readFileSync(new URL("../../../scripts/build-selection-input-diagnostic.sh", import.meta.url), "utf8");
  expect(script).toContain('task_features="diagnostic-selection-inputs"');
  expect(script).toContain('--features "${task_features}"');
  expect(script).toContain('CARGO_TARGET_DIR="${task_root}/target/selection-input-diagnostic/cargo"');
  expect(script.split("\n").filter(line => !line.startsWith("#")).join("\n")).not.toContain("packages/breditor-wasm/dist");
});
