import assert from "node:assert/strict";

/** Disposable candidate only: equivalent for admitted undefined/integer 1..6. */
export function stringKeyHeadingComparison(code) {
  const anchor = "!Object.is(left.headingLevel, right.headingLevel)";
  assert.equal(code.split(anchor).length, 2, "heading comparison site changed");
  return code.replace(anchor, "!trialHeadingKeysEqual(left.headingLevel, right.headingLevel)") + `
function trialHeadingKeysEqual(left, right) {
    const valid = value => value === undefined ||
        (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6);
    if (!valid(left) || !valid(right)) return false;
    return typeof left === typeof right && String(left) === String(right);
}
`;
}
