import assert from "node:assert/strict";
import test from "node:test";
import {stringKeyHeadingComparison} from "./heading-comparison-trial.mjs";
test("string-key trial is exact on every admitted heading pair and rejects invalid ranks", () => {
  const source = "function mismatch(left, right) { return !Object.is(left.headingLevel, right.headingLevel); }";
  const compare = new Function(`${stringKeyHeadingComparison(source)}; return mismatch;`)();
  for (const left of [undefined, 1, 2, 3, 4, 5, 6]) for (const right of [undefined, 1, 2, 3, 4, 5, 6]) {
    assert.equal(compare({headingLevel: left}, {headingLevel: right}), !Object.is(left, right));
  }
  for (const rank of [null, "2", 0, 7, NaN, Infinity, {}, 2.5]) {
    assert.equal(compare({headingLevel: rank}, {headingLevel: rank}), true);
  }
  assert.throws(() => stringKeyHeadingComparison("changed"));
});
