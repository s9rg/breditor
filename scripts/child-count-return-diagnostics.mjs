import assert from "node:assert/strict";

/** Minimal private capture: primitive assignments only on the getter hot path.
 * Formatting happens only when the fixture fails. One original Wasm call.
 */
export function captureLastChildCountReturn(code) {
  const expression=/childCount\(([\w$]+)\)\{let ([\w$]+)=([\w$]+)\.breditorprojection_childCount\(this\.__wbg_ptr,\1\);return \2===2\*\*53-1\?void 0:\2\}/gu;
  assert.equal([...code.matchAll(expression)].length,1,"generated childCount capture wrapper changed");
  assert.ok(!code.includes("breditorChildCountTrace"),"child count already instrumented");
  const changed=code.replace(expression,(_,index,raw,wasm)=>`childCount(${index}){let ${raw}=${wasm}.breditorprojection_childCount(this.__wbg_ptr,${index});let returned=${raw}===2**53-1?void 0:${raw};breditorLastIndex=${index};breditorLastHandle=this.__wbg_ptr;breditorLastRaw=${raw};breditorLastReturned=returned;return returned}`);
  return `let breditorLastIndex,breditorLastHandle,breditorLastRaw,breditorLastReturned;export function breditorChildCountTrace(){return {index:String(breditorLastIndex),handle:String(breditorLastHandle),raw:String(breditorLastRaw),returnedType:typeof breditorLastReturned,returned:String(breditorLastReturned)}}\n`+changed;
}

/** Experimental comparison-only treatment, not a qualified production fix.
 * For this positive finite sentinel, SameValue and strict equality have the
 * same specified result for every possible getter value (including NaN/-0).
 */
export function childCountSentinelSameValue(code) {
  const expression=/childCount\(([\w$]+)\)\{let ([\w$]+)=([\w$]+)\.breditorprojection_childCount\(this\.__wbg_ptr,\1\);return \2===2\*\*53-1\?void 0:\2\}/gu;
  assert.equal([...code.matchAll(expression)].length,1,"generated childCount treatment wrapper changed");
  return code.replace(expression,(_,index,raw,wasm)=>`childCount(${index}){let ${raw}=${wasm}.breditorprojection_childCount(this.__wbg_ptr,${index});return Object.is(${raw},2**53-1)?void 0:${raw}}`);
}

/** Disposable generated-glue transform: one Wasm call and original predicate.
 * Capture after predicate evaluation; never reread or retry a Wasm getter.
 */
export function instrumentChildCountReturn(code) {
  const expression = /childCount\(([\w$]+)\)\{let ([\w$]+)=([\w$]+)\.breditorprojection_childCount\(this\.__wbg_ptr,\1\);return \2===2\*\*53-1\?void 0:\2\}/gu;
  assert.equal([...code.matchAll(expression)].length,1,"generated childCount wrapper changed");
  assert.ok(!code.includes("breditorChildCountTrace"),"child count already instrumented");
  const changed=code.replace(expression,(_,index,raw,wasm)=>`childCount(${index}){let ${raw}=${wasm}.breditorprojection_childCount(this.__wbg_ptr,${index});let breditorReturned=${raw}===2**53-1?void 0:${raw};try{breditorChildCountCalls.push({index:String(${index}),handle:String(this.__wbg_ptr),raw:String(${raw}),returnedType:typeof breditorReturned,returned:typeof breditorReturned==="number"?String(breditorReturned):undefined});if(breditorChildCountCalls.length>16)breditorChildCountCalls.shift()}catch{}return breditorReturned}`);
  return `const breditorChildCountCalls=[];export function breditorChildCountTrace(){return breditorChildCountCalls.map(value=>({...value}))}\n`+changed;
}
