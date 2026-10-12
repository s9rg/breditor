import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {transformSync} from "rolldown/utils";
import {instrumentFormatPropertyComparison} from "./queue-failure-diagnostics.mjs";

test("captures typed property rejection without repeating getters or changing comparison", () => {
  const source = `function formatDetailsEqual(left, right) {
    const leftProperty=left,rightProperty=right,formatIndex=2,propertyIndex=3;
    return !(leftProperty.value !== rightProperty.value);
  }`;
  for (const [leftValue,rightValue,equal] of [[1193046,1193046,true],[1193046,0,false],
    [false,false,true],[false,0,false],[1,"1",false],["a","a",true]]) {
    let leftReads=0,rightReads=0;const state={};
    const compare=Function("globalThis",instrumentFormatPropertyComparison(source)+";return formatDetailsEqual;")(state);
    assert.equal(compare({get value(){leftReads++;return leftValue;}},
      {get value(){rightReads++;return rightValue;}}),equal);
    assert.equal(leftReads,1);assert.equal(rightReads,1);
    assert.equal(state.__breditorFormatPropertyMismatch!==undefined,!equal);
    if(!equal){const captured=JSON.parse(state.__breditorFormatPropertyMismatch);
      assert.equal(captured.left,leftValue);assert.equal(captured.right,rightValue);}
  }
});

test("current source has exact capture sites and drift is rejected", () => {
  const source=readFileSync(new URL("../packages/breditor-browser/src/projection.ts",import.meta.url),"utf8");
  assert.ok(instrumentFormatPropertyComparison(transformSync("projection.ts",source).code).includes("diagnosticPropertyMismatch"));
  assert.throws(()=>instrumentFormatPropertyComparison("return true;"));
});
