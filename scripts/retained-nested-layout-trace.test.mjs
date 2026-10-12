import assert from "node:assert/strict";
import test from "node:test";
import {traceRetainedNestedLayout} from "./retained-nested-layout-trace.mjs";

const source = `const outsideBefore="untouched";
function layout(view,methods,rootCount,nodeCount){
  if(rootCount>64)return null;
  const bullet="breditor/bullet-list",item="breditor/list-item";
  let next=1;
  const runs=17;
  const block=index=>{
    if(index!==next)return false;
    const runs=methods.count(index);
    return runs<0?false:(next+=runs+1,true);
  };
  if(!block(methods.child(0)))return null;
  return next===nodeCount?{shapes:[],textBlocks:[]}:null;
}
const outsideAfter="untouched";`;

test("retained trace patches only the selected function and preserves literal returns and getter order", () => {
  const transformed = traceRetainedNestedLayout(source);
  assert.ok(transformed.code.startsWith(source.slice(0, transformed.layout.start)));
  assert.ok(transformed.code.endsWith(source.slice(transformed.layout.end)));
  assert.ok(transformed.patches.every(patch => patch.start >= transformed.layout.start && patch.end <= transformed.layout.end));
  for (const failure of [null, "index", "runs", "coverage", "early", "objectIndex"]) for (const hostile of [false, true]) {
    const outcomes = [];
    for (const code of [source, transformed.code]) {
      const calls = [], logs = [];
      let serialized = 0;
      const run = new Function("console", code + "; return layout;")({error(...args) {if(hostile)throw Error("logger");logs.push(args);}});
      const result = run({}, {
        child(index) {calls.push(["child",index]);return failure==="index"?2:failure==="objectIndex"?{toJSON(){serialized++;throw Error("serialization");}}:1;},
        count(index) {calls.push(["count",index]);return failure==="runs"?-1:1;},
      }, failure==="early"?65:1, failure==="coverage"?4:3);
      assert.equal(serialized, 0);
      outcomes.push({result,calls});
      if(code===transformed.code && failure!==null && !hostile) {
        assert.ok(logs.length > 0, "early rejection must not trigger a TDZ error in tracing");
        const detail = JSON.parse(logs[0][1]);
        assert.equal(typeof detail.stage,"string");
        if(failure==="early")assert.equal(detail.bindings.next,undefined);
        if(failure==="index")assert.equal(detail.bindings.runs,undefined);
      }
    }
    assert.deepEqual(outcomes[0],outcomes[1]);
  }
});

test("retained trace rejects malformed, ambiguous and previously traced sources", () => {
  for(const code of ["broken {", source+source, source.replace("breditor/list-item","different/item"),traceRetainedNestedLayout(source).code]) {
    assert.throws(()=>traceRetainedNestedLayout(code));
  }
});
