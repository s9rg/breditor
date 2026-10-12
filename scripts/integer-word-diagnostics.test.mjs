import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {transformSync} from "rolldown/utils";
import {instrumentIntegerWordDecode,instrumentProjectedIntegerTuple} from "./integer-word-diagnostics.mjs";

test("captures existing conversion operands without retry or replacement", () => {
  for(const [low,decoded,expectedLogs] of [[1193046,1193046,0],[0,0,1],[1193046,0,1]]) {
    let calls=0;const logs=[];
    const run=Function("numberFromInteger","console","globalThis",instrumentIntegerWordDecode(
      `const presence=1, low=${low}, high=0, value=BigInt(low); return numberFromInteger(value);`));
    const state={};
    assert.equal(run(()=>{calls++;return decoded;},{error:(...args)=>logs.push(args)},state),decoded);
    assert.equal(state.__breditorLastIntegerWords.decoded,decoded);
    assert.equal(calls,1);assert.equal(logs.length,expectedLogs);
    if(expectedLogs){const captured=JSON.parse(logs[0][1]);
      assert.equal(captured.low,low);assert.equal(captured.integerSpelling,String(low));assert.equal(captured.decoded,decoded);}
  }
});
test("tuple capture observes an existing mismatch without another native call", () => {
  const source=`const [name,kind,booleanValue,integerValue,stringValue]=methods.map(method=>method(view, nodeIndex, formatIndex, propertyIndex)); return integerValue;`;
  let calls=0;const logs=[],state={__breditorLastIntegerWords:{low:1193046,decoded:1193046}};
  const run=Function("methods","view","nodeIndex","formatIndex","propertyIndex","console","globalThis",instrumentProjectedIntegerTuple(source));
  const result=run(["example/rgb24","integer",undefined,0,undefined].map(value=>()=>{calls++;return value;}),{},4,0,0,
    {error:(...args)=>logs.push(args)},state);
  assert.equal(result,0);assert.equal(calls,5);assert.equal(logs.length,1);
  assert.equal(JSON.parse(logs[0][1]).lastWords.decoded,1193046);
  const current=readFileSync(new URL("../packages/breditor-browser/src/wasm_projection_adapter.ts",import.meta.url),"utf8");
  assert.ok(instrumentProjectedIntegerTuple(transformSync("wasm_projection_adapter.ts",current).code).includes("tuple deviation"));
});
test("explicit capture preserves call count and snapshots before final string call", () => {
  const source=`const name="example/rgb24",kind="integer";
    const integerValue = invokeGenerated(methods.formatPropertyInteger, view, nodeIndex, formatIndex, propertyIndex);
    const stringValue = invokeGenerated(methods.formatPropertyString, view, nodeIndex, formatIndex, propertyIndex);
    return {integerValue,stringValue};`;
  let calls=0;const state={},logs=[];
  const run=Function("invokeGenerated","methods","view","nodeIndex","formatIndex","propertyIndex","console","globalThis",
    instrumentProjectedIntegerTuple(source,{captureBeforeString:true}));
  const methods={formatPropertyInteger:()=>0,formatPropertyString:()=>undefined};
  const result=run((method,...args)=>{calls++;return method(...args);},methods,{},4,2,0,{error:(...args)=>logs.push(args)},state);
  assert.deepEqual(result,{integerValue:0,stringValue:undefined});assert.equal(calls,2);
  assert.deepEqual(state.__breditorIntegerBeforeString,{nodeIndex:4,formatIndex:2,propertyIndex:0,integerValue:0,words:null});
  assert.equal(JSON.parse(logs[0][1]).beforeString.integerValue,0);
  assert.throws(()=>instrumentProjectedIntegerTuple(source,{captureBeforeString:"true"}));
});
test("current decoder site is exact and unknown code rejects", () => {
  const source=readFileSync(new URL("../packages/breditor-browser/src/projection_scalar_words.ts",import.meta.url),"utf8");
  assert.ok(instrumentIntegerWordDecode(transformSync("projection_scalar_words.ts",source).code).includes("decode deviation"));
  assert.throws(()=>instrumentIntegerWordDecode("return 0;"));
});
