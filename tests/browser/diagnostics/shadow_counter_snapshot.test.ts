import { expect, it } from "vitest";
import { serializeShadowCounterSnapshot, SHADOW_COUNTER_FIELDS } from "../harness/shadow_counter_snapshot";

it.each([
  [0, "0", "0", "0000000000000000"],
  [-0, "0", "0", "8000000000000000"],
  [1, "1", "1", "3ff0000000000000"],
  [Infinity, "Infinity", "null", "7ff0000000000000"],
  [-Infinity, "-Infinity", "null", "fff0000000000000"],
] as const)("preserves counter evidence for %s without forcing expected zeros", (value, decimal, json, bits) => {
  const outcome = Object.freeze({ parentNodeShadowReads: value, isConnectedShadowReads: value,
    ownerDocumentShadowReads: value, focusShadowCalls: value, beforeHtml: "<p>control</p>" });
  const snapshot = JSON.parse(serializeShadowCounterSnapshot(outcome));
  expect(snapshot.frozen).toBe(true);
  expect(snapshot.outcome.beforeHtml).toBe("<p>control</p>");
  for (const key of SHADOW_COUNTER_FIELDS) {
    expect(snapshot.counters[key]).toEqual({ type: "number", decimal, json, bits });
    expect(snapshot.outcome[key]).toBe(JSON.parse(json));
  }
});

it("does not let JSON's NaN-to-null conversion hide a nonfinite counter", () => {
  const snapshot = JSON.parse(serializeShadowCounterSnapshot(Object.freeze({
    parentNodeShadowReads: NaN, isConnectedShadowReads: 0, ownerDocumentShadowReads: 0, focusShadowCalls: 0,
  })));
  expect(snapshot.outcome.parentNodeShadowReads).toBeNull();
  expect(snapshot.counters.parentNodeShadowReads).toMatchObject({ decimal: "NaN", json: "null" });
  expect(snapshot.counters.parentNodeShadowReads.bits).not.toBe("0000000000000000");
});
