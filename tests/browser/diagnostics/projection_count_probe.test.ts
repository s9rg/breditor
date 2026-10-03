import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps the count reduction independent of history, selection and browser adapters", () => {
  const source = readFileSync(new URL("../harness/projection_count_probe.ts", import.meta.url), "utf8");
  expect([...source.matchAll(/from "([^"]+)"/g)].map(match => match[1])).toEqual(["@breditor/wasm"]);
  for (const call of [".undo(", ".redo(", ".setRangeSelection(", ".executeStringAction(", ".executeNoInputAction("]) {
    expect(source).not.toContain(call);
  }
  expect(source).toContain('if (kind !== expectedKind) rejected = "kind"');
  expect(source).toContain('else if (count !== expectedCount[index]) rejected = "count"');
  expect(source).toContain("Object.is(count, expectedCount[index])");
});
