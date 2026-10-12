import assert from "node:assert/strict";
import test from "node:test";
import {stringKeyHeadingComparison} from "./heading-comparison-trial.mjs";
import {readFile} from "node:fs/promises";
import {transform} from "rolldown/utils";
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

test("trial preserves current paragraph text, format and missing-run rejection", async () => {
  const ts = await readFile(new URL("../packages/breditor-browser/src/projection.ts", import.meta.url), "utf8");
  const compiled = (await transform("projection.ts", ts, {lang: "ts"})).code;
  const start = compiled.indexOf("export function paragraphsEqual(left, right) {");
  assert.ok(start >= 0);
  const source = compiled.slice(start, compiled.indexOf("\n}", start) + 2);
  const helperStart = compiled.indexOf("function ownedHeadingLevelsEqual(left, right) {");
  assert.ok(helperStart >= 0);
  const helper = compiled.slice(helperStart, compiled.indexOf("\n}", helperStart) + 2);
  // Retain the former SameValue comparator as an independent baseline.
  const baseline = source.replace("!ownedHeadingLevelsEqual(left.headingLevel, right.headingLevel)", "!Object.is(left.headingLevel, right.headingLevel)");
  const make = code => new Function("formatDetailsEqual", `${code.replace("export function", "function")}; return paragraphsEqual;`)(
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  );
  const original = make(baseline), trial = make(stringKeyHeadingComparison(baseline));
  const current = make(source + "\n" + helper);
  const run = {text: "A🙂", strong: false, formatDetails: []};
  for (const leftRank of [undefined, 1, 2, 3, 4, 5, 6]) for (const rightRank of [undefined, 1, 2, 3, 4, 5, 6]) {
    const left = {headingLevel: leftRank, runs: [run]};
    for (const runs of [[{...run}], [], [undefined], [{...run, text: "B"}],
      [{...run, strong: true}], [{...run, formatDetails: [{type: "breditor/strong", properties: []}]}]]) {
      const right = {headingLevel: rightRank, runs};
      assert.equal(trial(left, right), original(left, right));
      assert.equal(current(left, right), original(left, right));
    }
  }
  let leftReads = 0, rightReads = 0;
  assert.equal(trial({get headingLevel() {leftReads++; return 2;}, runs: [run]},
    {get headingLevel() {rightReads++; return 2;}, runs: [{...run}]}), true);
  assert.equal(leftReads, 1); assert.equal(rightReads, 1);
});
