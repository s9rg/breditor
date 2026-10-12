import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {nestedListStressMode, uninstrumentedNestedStressPlugin} from "./nested-list-stress-mode.mjs";

test("uninstrumented owner churn requires explicit bounded WebKit-only intent", () => {
  assert.deepEqual(nestedListStressMode({browser: "webkit"}), {enabled: false, count: 3});
  assert.deepEqual(nestedListStressMode({browser: "webkit", diagnostics: true, owners: "30"}), {enabled: false, count: 30});
  assert.deepEqual(nestedListStressMode({browser: "webkit", flag: "1", owners: "30"}), {enabled: true, count: 30});
  for (const patch of [{owners: "3"}, {owners: "31"}, {owners: "2"}, {owners: "4.1"},
    {browser: "chromium"}, {browser: "all"}, {diagnostics: true}, {otherInstrumentation: true}, {flag: "yes"}]) {
    assert.throws(() => nestedListStressMode({browser: "webkit", flag: "1", owners: "30", ...patch}));
  }
  assert.throws(() => nestedListStressMode({browser: "webkit", owners: "30"}));
});

test("stress plugin changes only the real fixture owner bound and leaves package code untouched", async () => {
  const source = await readFile(new URL("./fixtures/nested-list-performance/main.ts", import.meta.url), "utf8");
  let transformed = 0;
  const plugin = uninstrumentedNestedStressPlugin("/fixture", 30, () => transformed++);
  const changed = plugin.transform(source, "/fixture/main.ts");
  assert.equal(changed.replace("repetition < 30", "repetition < 3"), source);
  for (const id of ["/fixture/main-other.ts", "/consumer/node_modules/@breditor/browser/dist/wasm_projection_adapter.js",
    "/consumer/node_modules/@breditor/wasm/dist/breditor_wasm.js"]) {
    assert.equal(plugin.transform("opaque installed bytes", id), undefined);
  }
  assert.equal(transformed, 1);
  assert.throws(() => plugin.transform(source.replace("repetition < 3", "repetition < 4"), "/fixture/main.ts"));
});
