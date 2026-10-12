import assert from "node:assert/strict";

/** Preserve the recorded workload exactly; legacy records omit both options. */
export function nestedPerformanceReplayQuery(source) {
  const editTarget = source.editTarget === undefined ? "root" : source.editTarget;
  assert.ok(["root", "grandchild"].includes(editTarget), "invalid retained edit target");
  assert.ok(source.formatted === undefined || typeof source.formatted === "boolean",
    "invalid retained formatted mode");
  const query = new URLSearchParams({editTarget});
  if (source.formatted === true) query.set("formatted", "1");
  return query;
}
