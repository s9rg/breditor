import assert from "node:assert/strict";
import test from "node:test";
import {getterU32ComparisonMode} from "./getter-u32-comparison-mode.mjs";

test("u32 oracle is explicitly opted in for the exact reduced domain", () => {
  assert.equal(getterU32ComparisonMode({flag:"0",sequence:"all",tree:"nested",integerProperties:true}),false);
  assert.equal(getterU32ComparisonMode({flag:"1",sequence:"child-count",tree:"paragraphs",integerProperties:false}),true);
});
test("u32 oracle rejects other getter/shape domains and signed properties", () => {
  for (const change of [{sequence:"all"},{sequence:"shape"},{tree:"nested"},{tree:"flat-list"},{integerProperties:true}]) {
    assert.throws(() => getterU32ComparisonMode({flag:"1",sequence:"child-count",tree:"paragraphs",integerProperties:false,...change}), /requires paragraph child-count-only/u);
  }
});
test("u32 oracle rejects unknown flags rather than coercing them", () => {
  for (const flag of ["", "2", true, false, 1, null, undefined, {}]) {
    assert.throws(() => getterU32ComparisonMode({flag,sequence:"child-count",tree:"paragraphs",integerProperties:false}), /must be 0 or 1/u);
  }
  assert.throws(() => getterU32ComparisonMode({flag:"1",sequence:"child-count",tree:"paragraphs",integerProperties:"false"}));
});
