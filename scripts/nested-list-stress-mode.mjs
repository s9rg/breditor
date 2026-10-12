import assert from "node:assert/strict";
import {join} from "node:path";
import {repeatPerformanceOwners} from "./queue-failure-diagnostics.mjs";

/** Bounded correctness stress is distinct from instrumentation and timing. */
export function nestedListStressMode({flag = "0", owners = "3", browser, diagnostics = false, otherInstrumentation = false}) {
  assert.ok(["0", "1"].includes(flag), "invalid BREDITOR_PERF_STRESS mode");
  const enabled = flag === "1", count = Number(owners);
  assert.ok(Number.isSafeInteger(count) && count >= 3 && count <= 30, "owner repetitions must be 3..30");
  assert.ok(!enabled || (browser === "webkit" && !diagnostics && !otherInstrumentation && count > 3),
    "uninstrumented stress requires WebKit, more than three owners and no instrumentation");
  assert.ok(count === 3 || diagnostics || enabled, "nondefault owners require diagnostics or explicit uninstrumented stress");
  return {enabled, count};
}

/** Only expand the fixture loop. Installed browser/Wasm code is untouched. */
export function uninstrumentedNestedStressPlugin(fixture, owners, onTransform) {
  return {name: "nested-list-uninstrumented-owner-churn", enforce: "pre", transform(code, id) {
    if (id !== join(fixture, "main.ts")) return undefined;
    const result = repeatPerformanceOwners(code, owners);
    onTransform();
    return result;
  }};
}
