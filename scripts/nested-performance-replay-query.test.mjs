import assert from "node:assert/strict";
import test from "node:test";
import {nestedPerformanceReplayQuery} from "./nested-performance-replay-query.mjs";

test("replay preserves exact recorded formatting and target, including legacy records", () => {
  assert.equal(String(nestedPerformanceReplayQuery({})), "editTarget=root");
  assert.equal(String(nestedPerformanceReplayQuery({editTarget: "grandchild", formatted: true})),
    "editTarget=grandchild&formatted=1");
  assert.equal(String(nestedPerformanceReplayQuery({editTarget: "root", formatted: false})), "editTarget=root");
  for (const formatted of [null, "1", "true", 0, 1, {}]) {
    assert.throws(() => nestedPerformanceReplayQuery({formatted}));
  }
  for (const editTarget of [null, "child", "ROOT", 1, {}]) {
    assert.throws(() => nestedPerformanceReplayQuery({editTarget}));
  }
});
