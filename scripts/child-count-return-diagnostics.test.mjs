import assert from "node:assert/strict";
import test from "node:test";
import {instrumentChildCountReturn,childCountSentinelSameValue,captureLastChildCountReturn} from "./child-count-return-diagnostics.mjs";

test("last-value capture preserves one call and formats only when read",()=>{
  const source="class View{constructor(){this.__wbg_ptr=17}childCount(e){let t=$.breditorprojection_childCount(this.__wbg_ptr,e);return t===2**53-1?void 0:t}}";
  const changed=captureLastChildCountReturn(source).replace("export function","function");
  for(const raw of [0,-0,1,9007199254740991]){
    const calls=[];
    const {view,read}=new Function("$",changed+";return {view:new View(),read:breditorChildCountTrace};")({breditorprojection_childCount(...args){calls.push(args);return raw;}});
    assert.ok(Object.is(view.childCount(1185),raw===9007199254740991?undefined:raw));
    assert.deepEqual(calls,[[17,1185]]);
    assert.deepEqual(read(),{index:"1185",handle:"17",raw:String(raw),returnedType:raw===9007199254740991?"undefined":"number",returned:String(raw===9007199254740991?undefined:raw)});
  }
  assert.throws(()=>captureLastChildCountReturn(source+source));
});

test("positive sentinel SameValue treatment preserves all specified raw return values and calls",()=>{
  const source="class View{constructor(){this.__wbg_ptr=17}childCount(e){let t=w.breditorprojection_childCount(this.__wbg_ptr,e);return t===2**53-1?void 0:t}}";
  const changed=childCountSentinelSameValue(source);
  for(const raw of [undefined,null,false,true,"1",0,-0,1,-1,NaN,Infinity,9007199254740991,9007199254740991n,{}]){
    const outcomes=[];
    for(const code of [source,changed]){
      const calls=[];
      const view=new Function("w",code+";return new View();")({breditorprojection_childCount(...args){calls.push(args);return raw;}});
      outcomes.push({value:view.childCount(1185),calls});
    }
    assert.ok(Object.is(outcomes[0].value,outcomes[1].value));assert.deepEqual(outcomes[0].calls,outcomes[1].calls);
  }
  assert.throws(()=>childCountSentinelSameValue(changed));
});

test("childCount raw trace preserves sentinel, result and exact Wasm call count",()=>{
  const source="class View{constructor(){this.__wbg_ptr=17}childCount(e){let t=w.breditorprojection_childCount(this.__wbg_ptr,e);return t===2**53-1?void 0:t}}";
  const changed=instrumentChildCountReturn(source).replace("export function","function");
  for(const raw of [0,1,9007199254740991]){
    const outcomes=[];
    for(const code of [source,changed]){
      const calls=[];
      const view=new Function("w",code+";return new View();")({breditorprojection_childCount(...args){calls.push(args);return raw;}});
      outcomes.push({result:view.childCount(1185),calls});
    }
    assert.deepEqual(outcomes[0],outcomes[1]);
  }
  const read=new Function("w",changed+";const view=new View();for(let i=0;i<20;i++)view.childCount(i);return breditorChildCountTrace;")({breditorprojection_childCount(){return 1;}});
  const trace=read();assert.equal(trace.length,16);assert.equal(trace[0].index,"4");assert.equal(trace.at(-1).raw,"1");
  trace[0].raw="changed";assert.equal(read()[0].raw,"1");
  assert.throws(()=>instrumentChildCountReturn(source+source));
  assert.ok(instrumentChildCountReturn(source.replaceAll("w.","$." )).includes("$.breditorprojection_childCount"));
});
