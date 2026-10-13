import assert from "node:assert/strict";

/** U32-only diagnostic oracle, never a replacement for signed-property checks.
 * Reject unsupported combinations before creating a fixture or launching a
 * browser. Disabled mode leaves the original SameValueZero oracle selected.
 */
export function getterU32ComparisonMode({flag, sequence, tree, integerProperties}) {
  assert.ok(["0", "1"].includes(flag), "u32 key comparison must be 0 or 1");
  assert.equal(typeof integerProperties, "boolean");
  const enabled = flag === "1";
  assert.ok(!enabled || (sequence === "child-count" && tree === "paragraphs" && !integerProperties),
    "u32 key comparison requires paragraph child-count-only coverage without signed properties");
  return enabled;
}
