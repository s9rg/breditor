import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("isolates admission from numeric projection getters, adapters and history", () => {
  const source = readFileSync(new URL("../harness/selection_token_probe.ts", import.meta.url), "utf8");
  expect([...source.matchAll(/from "([^"]+)"/g)].map(match => match[1])).toEqual(["@breditor/wasm"]);
  for (const call of [".projection(", ".selection(", ".undo(", ".redo(", ".executeStringAction(", ".executeNoInputAction("]) {
    expect(source).not.toContain(call);
  }
  expect(source).toContain("engine.stateJson()");
  expect(source).toContain("actual !== expected[index]");
});
