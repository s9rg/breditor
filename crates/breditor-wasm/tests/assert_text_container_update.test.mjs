import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTextContainerUpdate } from "./assert_text_container_update.mjs";

function fixture(overrides = {}) {
  let childFrees = 0;
  let updateFrees = 0;
  let taken = false;
  const update = {
    impact: "textContainers", affectedParagraphCount: 1,
    oldChildStart: undefined, oldChildEnd: undefined, newChildStart: undefined, newChildEnd: undefined,
    affectedParagraphIndex: index => index === 0 ? 0 : undefined,
    takeProjection: () => {
      if (taken) return undefined;
      taken = true;
      return { free: () => { childFrees++; } };
    },
    free: () => { updateFrees++; },
    ...overrides,
  };
  return { command: { projectionUpdate: () => update }, update,
    frees: () => ({ child: childFrees, update: updateFrees }) };
}

test("accepts canonical raw metadata and cleans up both transferred handles", () => {
  const value = fixture();
  assertTextContainerUpdate(value.command, "valid");
  assert.deepEqual(value.frees(), { child: 1, update: 1 });
});

for (const [key, invalid] of [
  ["affectedParagraphCount", 0], ["oldChildStart", 0], ["oldChildEnd", 2 ** 53 - 1],
  ["newChildStart", null], ["newChildEnd", NaN],
]) {
  test(`rejects invalid ${key} without transferring the child`, () => {
    const value = fixture({ [key]: invalid });
    assert.throws(() => assertTextContainerUpdate(value.command, "invalid"), assert.AssertionError);
    assert.deepEqual(value.frees(), { child: 0, update: 1 });
  });
}

test("detects metadata changes after child transfer and frees both handles", () => {
  const value = fixture();
  const take = value.update.takeProjection;
  value.update.takeProjection = () => {
    const child = take();
    value.update.oldChildStart = 0;
    return child;
  };
  assert.throws(() => assertTextContainerUpdate(value.command, "changed"), /after-take: oldChildStart/);
  assert.deepEqual(value.frees(), { child: 1, update: 1 });
});
