import assert from "node:assert/strict";
import test from "node:test";
import {traceRetainedBootstrapFailures} from "./retained-bootstrap-failure-trace.mjs";

const source='const a=error(`engine_bootstrap.invalid_wasm_view`),b=error("engine_bootstrap.invalid_initial_projection");function run(x){if(x===0)return Object.freeze({ok:!1,error:a});return x===1?Object.freeze({ok:true}):Object.freeze({ok:false,error:b});}';
test("only cold error expressions log, including ternary and inline branches",()=>{
  const traced=traceRetainedBootstrapFailures(source),logs=[];
  const run=Function("error","console",traced.code+";return run;")(
    code=>({code}),{error:(...args)=>logs.push(args)});
  assert.equal(run(1).ok,true);assert.equal(logs.length,0);
  assert.equal(run(0).error.code,"engine_bootstrap.invalid_wasm_view");
  assert.equal(run(2).error.code,"engine_bootstrap.invalid_initial_projection");
  assert.equal(logs.length,2);assert.equal(traced.sites.length,2);
  let restored=traced.code;
  // Reverse only the recorded edits; all surrounding retained bytes survive.
  const forward=[...traced.edits].sort((a,b)=>a.start-b.start);
  let shift=0;const spans=forward.map(edit=>{
    const start=edit.start+shift;shift+=edit.replacement.length-(edit.end-edit.start);
    return {...edit,tracedStart:start,tracedEnd:start+edit.replacement.length};
  });
  for(const edit of spans.reverse())restored=restored.slice(0,edit.tracedStart)+edit.original+restored.slice(edit.tracedEnd);
  assert.equal(restored,source);
});
test("shadowed parameters, locals, catch and var bindings are not labeled as module errors",()=>{
  const shadows='function local(a){return Object.freeze({ok:false,error:a});}function lexical(){const a={};return Object.freeze({ok:false,error:a});}function hoisted(){if(true){var a={};}return Object.freeze({ok:false,error:a});}function caught(){try{throw 1;}catch(a){return Object.freeze({ok:false,error:a});}}';
  const traced=traceRetainedBootstrapFailures(source+shadows);
  assert.equal(traced.sites.length,2);
});
test("rejects unknown, duplicate and already traced bindings",()=>{
  assert.throws(()=>traceRetainedBootstrapFailures("function other(){}"));
  assert.throws(()=>traceRetainedBootstrapFailures(source+'a=error("engine_bootstrap.invalid_wasm_view");'));
  assert.throws(()=>traceRetainedBootstrapFailures(source+'a={};'),/reassigned/u);
  assert.throws(()=>traceRetainedBootstrapFailures(traceRetainedBootstrapFailures(source).code),/already traced/u);
});
test("owner cold trace preserves calls and captures data fields without invoking accessors",()=>{
  const owner='class Owner {#fault(reason){return reason;}run(delivery){const completed=true;return this.#fault("toolbarDispatchFailed");}later(){const before=1;this.#fault("toolbarDispatchFailed");let after=2;}}';
  const traced=traceRetainedBootstrapFailures(source+owner,{ownerFaults:true}),logs=[];
  const instance=Function("error","console",traced.code+";return new Owner;")(
    code=>({code}),{error:(...args)=>logs.push(args)});
  let getterCalls=0;
  const delivery={status:"completed",submission:{result:{status:"delivered",command:{status:"committed",eventKind:"undo"}}},
    get projection(){getterCalls++;throw Error("must not invoke accessor");},__wbg_ptr:1234};
  assert.equal(instance.run(delivery),"toolbarDispatchFailed");assert.equal(getterCalls,0);
  const captured=JSON.parse(logs[0][1]);
  assert.equal(captured.bindings.delivery.fields.status.value,"completed");
  assert.equal(captured.bindings.delivery.fields.submission.fields.result.fields.status.value,"delivered");
  assert.equal(captured.bindings.delivery.fields.submission.fields.result.fields.command.fields.eventKind.value,"undo");
  assert.equal(captured.bindings.completed.value,true);
  assert.equal(logs[0][1].includes("__wbg_ptr"),false);
  instance.later();assert.equal(JSON.parse(logs[1][1]).bindings.after,undefined);
  assert.equal(traced.sites.filter(site=>site.code==="toolbarDispatchFailed").length,2);
  assert.throws(()=>traceRetainedBootstrapFailures(source,{ownerFaults:true}),/owner fault sites missing/u);
});
