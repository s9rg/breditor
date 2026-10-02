import assert from "node:assert/strict";

/** Check the actual generated Wasm metadata, including Option<u32> absence.
 * Taking the owned child must not change the update's retained impact fields.
 * This is a boundary-contract test, not a browser-engine qualification.
 */
export function assertTextContainerUpdate(command, label) {
  const update = command.projectionUpdate();
  assert.notEqual(update, undefined, `${label}: missing projection update`);
  let child;
  function checkMetadata(phase) {
    const context = `${label}/${phase}`;
    assert.equal(update.impact, "textContainers", `${context}: impact`);
    assert.equal(update.affectedParagraphCount, 1, `${context}: count`);
    assert.equal(update.affectedParagraphIndex(0), 0, `${context}: paragraph`);
    assert.equal(update.affectedParagraphIndex(1), undefined, `${context}: paragraph sentinel`);
    for (const key of ["oldChildStart", "oldChildEnd", "newChildStart", "newChildEnd"]) {
      assert.equal(update[key], undefined, `${context}: ${key} must be absent, not zero or an ABI sentinel`);
    }
  }
  try {
    checkMetadata("before-take");
    child = update.takeProjection();
    assert.notEqual(child, undefined, `${label}: missing owned child`);
    assert.equal(update.takeProjection(), undefined, `${label}: child must transfer once`);
    checkMetadata("after-take");
  } finally {
    try { child?.free(); } finally { update.free(); }
  }
}
