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
test("focused churn changes only fixture sizes/owner count and is explicitly diagnostic",()=>{
  const owner='class Owner{#fault(reason){return reason;}run(){return this.#fault("toolbarDispatchFailed");}}';
  const workload='function cases(){let values=[];for(const items of [10,100,500]){for(let repetition=0;repetition<30;repetition++){values.push([items,repetition]);}}return values;}';
  const traced=traceRetainedBootstrapFailures(source+owner+workload,{ownerFaults:true,smallRestoreChurn:true});
  const run=Function("error","console",traced.code+";return cases;")(code=>({code}),{error(){}});
  const cases=run();assert.equal(cases.length,300);assert.ok(cases.every(([size])=>size===10));
  assert.deepEqual(traced.diagnosticWorkload,{variant:"small-restore-churn",sizes:[10],owners:300,expectedCases:300,warmupPreserved:true});
  assert.throws(()=>traceRetainedBootstrapFailures(source+owner+workload,{smallRestoreChurn:true}),/requires owner/u);
  const shortControl=traceRetainedBootstrapFailures(source+owner+workload.replace("<30","<3"),{ownerFaults:true,smallRestoreChurn:true});
  assert.deepEqual(shortControl.diagnosticWorkload,traced.diagnosticWorkload);
  const shortRun=Function("error","console",shortControl.code+";return cases;")(code=>({code}),{error(){}});
  assert.equal(shortRun().length,300);
  assert.ok(shortRun().every(([size])=>size===10));
  assert.throws(()=>traceRetainedBootstrapFailures(source+owner+workload.replace("<30","<4"),{ownerFaults:true,smallRestoreChurn:true}),/owner loop changed/u);
});

test("checkpoint trace distinguishes reader rejection and snapshot mismatch without logging success",()=>{
  const boundary='function fail(error){return {ok:false,error};}function same(a,b){return a.revision===b.revision;}function checkpointExport(result,before,after){if(!result.ok)return fail(result.error);let exported=result.checkpoint;return !same(before,after)||!same(exported.snapshot,before)?fail("mismatch"):Object.freeze({ok:true,value:exported.checkpointJson});}';
  const traced=traceRetainedBootstrapFailures(source+boundary,{checkpointExports:true}),logs=[];
  const run=Function("error","console",traced.code+";return checkpointExport;")(code=>({code}),{error:(...args)=>logs.push(args)});
  const snapshot={lineage:"fixture",revision:"1"};
  let getters=0;
  const checkpoint={snapshot,checkpointJson:"owned JSON",get projection(){getters++;throw Error("no accessor reads");}};
  assert.deepEqual(run({ok:true,checkpoint},snapshot,snapshot),{ok:true,value:"owned JSON"});
  assert.equal(logs.length,0);
  const error={kind:"boundary",code:"session_checkpoint.invalid_wasm_view"};
  assert.equal(run({ok:false,error},snapshot,snapshot).error,error);
  assert.equal(JSON.parse(logs[0][1]).code,"checkpoint-reader");
  assert.equal(JSON.parse(logs[0][1]).bindings.result.fields.error.fields.code.value,"session_checkpoint.invalid_wasm_view");
  assert.equal(run({ok:true,checkpoint},snapshot,{revision:"2"}).error,"mismatch");
  const captured=JSON.parse(logs[1][1]);
  assert.equal(captured.code,"checkpoint-snapshot");
  assert.equal(captured.bindings.before.fields.revision.value,"1");
  assert.equal(captured.bindings.after.fields.revision.value,"2");
  assert.equal(getters,0);
  assert.equal(logs[1][1].includes("owned JSON"),false);
  assert.throws(()=>traceRetainedBootstrapFailures(source,{checkpointExports:true}),/boundary missing/u);
  assert.throws(()=>traceRetainedBootstrapFailures(source+boundary+boundary.replaceAll("checkpointExport","otherExport"),{checkpointExports:true}),/ambiguous/u);
  assert.throws(()=>traceRetainedBootstrapFailures(source+boundary,{checkpointExports:"yes"}));
});

test("input route trace preserves receivers, call counts and result identity without extra getters",()=>{
  const route='class Router{#composition;#clipboard;#ordinary;#baseValue;constructor(c,p,o,b){this.#composition=c;this.#clipboard=p;this.#ordinary=o;this.#baseValue=b;}#base(){return this.#baseValue;}#after(value,route){return value;}run(event){return this.#route(event);}#route(event){const c=this.#composition.handleBeforeInput(event);if(c.kind!=="ordinary")return c;const p=this.#clipboard.handleBeforeInput(event);if(p.kind!=="ordinary")return p;const b=this.#base();if(b===null)return;return this.#after(this.#ordinary.handleBeforeInput(event,b.rendered,b.delivery),"beforeinput");}}';
  const traced=traceRetainedBootstrapFailures(source+route,{inputRoutes:true}),logs=[];
  const Router=Function("error","console",traced.code+";return Router;")(code=>({code}),{error:(...args)=>logs.push(args)});
  let calls=0,getters=0;const event={},rendered={},delivery={};
  const ordinary={kind:"handled",defaultPrevented:true,submission:{status:"completed"},get projection(){getters++;throw Error("no extra read");}};
  // Each port checks its actual receiver independently.
  function port(value){const p={handleBeforeInput(e,...rest){assert.equal(this,p);assert.equal(e,event);calls++;if(value===ordinary)assert.deepEqual(rest,[rendered,delivery]);return value;}};return p;}
  const router=new Router(port({kind:"ordinary"}),port({kind:"ordinary"}),port(ordinary),{rendered,delivery});
  assert.equal(router.run(event),ordinary);assert.equal(calls,3);assert.equal(logs.length,4);assert.equal(getters,0);
  const blocked={kind:"blocked",reason:"selectionUnavailable",defaultPrevented:true};
  const stopped=new Router(port(blocked),port({kind:"ordinary"}),port(ordinary),null);
  assert.equal(stopped.run(event),blocked);assert.equal(calls,4);assert.equal(logs.length,5);
  const captured=JSON.parse(logs.at(-1)[1]);assert.equal(captured.bindings.result.fields.reason.value,"selectionUnavailable");
  assert.throws(()=>traceRetainedBootstrapFailures(source,{inputRoutes:true}),/route missing/u);
  assert.throws(()=>traceRetainedBootstrapFailures(source+route,{inputRoutes:"yes"}));
});

test("checkpoint reader trace logs rejected guards without checkpoint text or repeat reads",()=>{
  const reader='const invalid=Object.freeze({code:"session_checkpoint.invalid_wasm_view"});function own(x){return x;}function reject(){return own(Object.freeze({ok:false,error:invalid}));}function reader(e,t,n,r,i){if(n.invalid)return reject();let a=e;if(!a)return reject();let o=t.status;if(o==="bad")return reject();let s=t.takeValue;if(!s)return reject();let c=t.error;if(c)return reject();let u=Reflect.apply(s,t,[]);if(u==null)return reject();if(typeof u!=="string")return reject();if(u==="secret checkpoint")return reject();return {checkpointJson:u};}';
  const traced=traceRetainedBootstrapFailures(source+reader,{checkpointReader:true}),logs=[];
  const run=Function("error","console",traced.code+";return reader;")(code=>({code}),{error:(...args)=>logs.push(args)});
  let statusReads=0,takes=0;const view={get status(){statusReads++;return "value";},takeValue(){assert.equal(this,view);takes++;return "secret checkpoint";},error:undefined};
  assert.equal(run({lineage:"fixture",revision:"3"},view,{invalid:false},{},{}).ok,false);
  assert.equal(statusReads,1);assert.equal(takes,1);assert.equal(logs.length,1);
  const capture=JSON.parse(logs[0][1]);assert.equal(capture.code,"checkpoint-read-rejection");
  assert.equal(capture.bindings.rawValueType.value,"string");assert.equal(capture.bindings.rawValueUtf16Length.value,17);
  assert.equal(logs[0][1].includes("secret checkpoint"),false);
  const good={status:"value",error:undefined,takeValue(){return "valid";}};
  assert.deepEqual(run({},good,{invalid:false},{},{}),{checkpointJson:"valid"});assert.equal(logs.length,1);
  assert.throws(()=>traceRetainedBootstrapFailures(source,{checkpointReader:true}),/reader missing/u);
  assert.throws(()=>traceRetainedBootstrapFailures(source+reader,{checkpointReader:"yes"}));
});

test("checkpoint validation trace separates envelope and revision guards and redacts strings",()=>{
  const fixture='const invalid=Object.freeze({code:"session_checkpoint.invalid_wasm_view"});function own(x){return x;}function reject(){return own(Object.freeze({ok:false,error:invalid}));}function reader(e,t,n,r,i){if(n.invalid)return reject();let a=e;if(!a)return reject();let o=t.status;if(o==="bad")return reject();let s=t.takeValue;if(!s)return reject();let c=t.error;if(c)return reject();let u=Reflect.apply(s,t,[]);if(u==null)return reject();if(typeof u!=="string")return reject();let d=bytes(u,a,i);if(d===null)return reject();return {checkpointJson:u};}function bytes(e,t,n){let r=envelope(e,n);if(r===null)return null;if(r.envelope.currentRevision!==t.revision)return null;return r.historyBase.snapshot.lineage!==t.lineage?null:r.utf8Bytes;}function envelope(e,n){let count=e.length;if(count===0)return null;const parsed=JSON.parse(e);if(parsed.invalid)return null;if(n.mode!=="v7")return null;return {utf8Bytes:count,envelope:parsed,historyBase:parsed.historyBase};}';
  const traced=traceRetainedBootstrapFailures(source+fixture,{checkpointReader:true,checkpointValidation:true}),logs=[];
  let parses=0,takes=0;
  const run=Function("error","console","JSON",traced.code+";return reader;")(code=>({code}),{error:(...args)=>logs.push(args)},
    {parse(value){parses++;return JSON.parse(value);},stringify:JSON.stringify});
  const execute=(revision,invalid=false)=>{
    const value=JSON.stringify({currentRevision:revision,invalid,secret:"never log this payload",historyBase:{snapshot:{lineage:"fixture"}}});
    const view={status:"value",error:undefined,takeValue(){assert.equal(this,view);takes++;return value;}};
    return run({lineage:"fixture",revision:"1"},view,{invalid:false},{},{mode:"v7"});
  };
  assert.equal(execute("99").ok,false);
  assert.equal(JSON.parse(logs[0][1]).code,"checkpoint-correlation");
  assert.equal(parses,1);assert.equal(takes,1);
  const first=JSON.parse(logs[0][1]);assert.equal(first.bindings.r.fields.envelope.fields.currentRevision.value,"99");
  const before=logs.length;assert.equal(execute("1",true).ok,false);
  assert.equal(JSON.parse(logs[before][1]).code,"checkpoint-envelope");
  const after=logs.length;assert.equal(typeof execute("1").checkpointJson,"string");assert.equal(logs.length,after);
  assert.equal(parses,3);assert.equal(takes,3);
  assert.equal(logs.some(log=>log[1].includes("never log this payload")),false);
  assert.throws(()=>traceRetainedBootstrapFailures(source+fixture,{checkpointValidation:true}),/requires reader/u);
});

test("checkpoint predicate trace preserves single evaluation and short circuit order",()=>{
  const fixture='const invalid=Object.freeze({code:"session_checkpoint.invalid_wasm_view"});function own(x){return x;}function reject(){return own(Object.freeze({ok:false,error:invalid}));}function reader(e,t,n,r,i){if(n.invalid)return reject();let a=e;if(!a)return reject();let o=t.status;if(o==="bad")return reject();let s=t.takeValue;if(!s)return reject();let c=t.error;if(c)return reject();let u=Reflect.apply(s,t,[]);if(u==null)return reject();if(typeof u!=="string")return reject();let d=bytes(u,a,i);if(d===null)return reject();return {checkpointJson:u};}function bytes(e,t,n){let r=envelope(e,n);if(r===null)return null;if(r.envelope.currentRevision!==t.revision)return null;return r.historyBase.snapshot.lineage!==t.lineage?null:r.utf8Bytes;}function envelope(e,n){let count=e.length;if(count===0)return null;const parsed=JSON.parse(e);if(parsed.invalid)return null;if(n.mode!=="v7")return null;let base=parsed.historyBase,counter={propertyValues:0};if(!account(base.document,n,counter)||!state(base,n,counter)||!history(parsed,n,counter))return null;return {utf8Bytes:count,envelope:parsed,historyBase:base};}function account(d,c,p){seen.push("account");return flags[0];}function state(d,c,p){seen.push("state");return flags[1];}function history(d,c,p){seen.push("history");return flags[2];}';
  for(const capture of [false,true]) {
  const traced=traceRetainedBootstrapFailures(source+fixture,{checkpointReader:true,checkpointValidation:true,checkpointPredicates:true,checkpointCapture:capture,checkpointContractCapture:capture});
  for(const failure of [0,1,2,-1]) {
    const logs=[],seen=[],flags=[true,true,true];if(failure>=0)flags[failure]=false;
    const global={},contract={mode:"v7"};
    const run=Function("error","console","flags","seen","globalThis",traced.code+";return reader;")(code=>({code}),{error:(...args)=>logs.push(args)},flags,seen,global);
    const raw=JSON.stringify({currentRevision:"1",historyBase:{snapshot:{lineage:"fixture"},document:{text:"private fixture"}}});
    let takes=0;const view={status:"value",error:undefined,takeValue(){takes++;return raw;}};
    const result=run({lineage:"fixture",revision:"1"},view,{invalid:false},{},contract);
    assert.equal(takes,1);assert.deepEqual(seen,["account","state","history"].slice(0,failure<0?3:failure+1));
    const rejected=logs.map(log=>JSON.parse(log[1])).filter(log=>log.code==="checkpoint-predicate-rejection");
    if(failure<0){assert.equal(result.checkpointJson,raw);assert.equal(logs.length,0);}
    else{assert.equal(result.ok,false);assert.equal(rejected.length,1);assert.ok(rejected[0].stage.startsWith(["checkpoint-property-accounting:","checkpoint-base-state:","checkpoint-history:"][failure]));assert.equal(rejected[0].bindings.result.value,false);}
    assert.equal(logs.some(log=>log[1].includes("private fixture")),false);
    if(capture&&failure>=0) {
      assert.equal(global.__breditorRejectedCheckpointInput.checkpointJson,raw);
      assert.equal(JSON.stringify(global.__breditorRejectedCheckpointInput.contract),JSON.stringify(contract));
      assert.notEqual(global.__breditorRejectedCheckpointInput.contract,contract);
      assert.ok(Object.isFrozen(global.__breditorRejectedCheckpointInput.contract));
    } else assert.equal(Object.hasOwn(global,"__breditorRejectedCheckpointInput"),false);
  }
  }
  assert.throws(()=>traceRetainedBootstrapFailures(source+fixture,{checkpointPredicates:true}),/require validation/u);
});

test("rejected checkpoint capture owns existing text without rereading or changing outcomes",()=>{
  const reader='const invalid=Object.freeze({code:"session_checkpoint.invalid_wasm_view"});function own(x){return x;}function reject(){return own(Object.freeze({ok:false,error:invalid}));}function reader(e,t,n,r,i){if(n.invalid)return reject();let a=e;if(!a)return reject();let o=t.status;if(o==="bad")return reject();let s=t.takeValue;if(!s)return reject();let c=t.error;if(c)return reject();let u=Reflect.apply(s,t,[]);if(u==null)return reject();if(typeof u!=="string")return reject();if(u!=="valid")return reject();return {checkpointJson:u};}';
  const traced=traceRetainedBootstrapFailures(source+reader,{checkpointReader:true,checkpointCapture:true});
  const global={},logs=[];
  const run=Function("error","console","globalThis",traced.code+";return reader;")(code=>({code}),{error:(...args)=>logs.push(args)},global);
  const snapshot={lineage:"fixture",revision:"3"};let takes=0;
  const invoke=text=>{const view={status:"value",error:undefined,takeValue(){assert.equal(this,view);takes++;return text;}};return run(snapshot,view,{invalid:false},{},{});};
  assert.deepEqual(invoke("valid"),{checkpointJson:"valid"});assert.equal(Object.hasOwn(global,"__breditorRejectedCheckpointInput"),false);
  assert.equal(invoke("private checkpoint text").ok,false);assert.equal(takes,2);
  const capture=Object.getOwnPropertyDescriptor(global,"__breditorRejectedCheckpointInput").value;
  assert.equal(capture.checkpointJson,"private checkpoint text");assert.deepEqual(capture.snapshot,snapshot);
  assert.ok(Object.isFrozen(capture));assert.ok(Object.isFrozen(capture.snapshot));
  assert.equal(logs.some(log=>log[1].includes("private checkpoint text")),false);
  invoke("later rejected text");assert.equal(global.__breditorRejectedCheckpointInput,capture);
  const frozenRun=Function("error","console","globalThis",traced.code+";return reader;")(code=>({code}),{error(){}},Object.freeze({}));
  assert.equal(frozenRun(snapshot,{status:"value",takeValue(){return "bad";}},{invalid:false},{},{}).ok,false);
  assert.throws(()=>traceRetainedBootstrapFailures(source+reader,{checkpointCapture:true}),/requires reader/u);
});

test("optional rejection contract capture is bounded, handle-free and never reads accessors",()=>{
  const reader='const invalid=Object.freeze({code:"session_checkpoint.invalid_wasm_view"});function own(x){return x;}function reject(){return own(Object.freeze({ok:false,error:invalid}));}function reader(e,t,n,r,i){if(n.invalid)return reject();let a=e;if(!a)return reject();let o=t.status;if(o==="bad")return reject();let s=t.takeValue;if(!s)return reject();let c=t.error;if(c)return reject();let u=Reflect.apply(s,t,[]);if(u==null)return reject();if(typeof u!=="string")return reject();if(u!=="valid")return reject();return {checkpointJson:u};}';
  const options={checkpointReader:true,checkpointCapture:true,checkpointContractCapture:true};
  const traced=traceRetainedBootstrapFailures(source+reader,options);
  const contract={mode:"v7",schema:{name:"fixture",version:1,fingerprint:"4".repeat(64)},formats:[{kind:"example/color",revision:1,properties:[{name:"example/rgb",presence:"required",valueType:{kind:"integer",minimum:0,maximum:16777215}}]}]};
  const invoke=(value,binding)=>{const global={},logs=[];let takes=0;const run=Function("error","console","globalThis",traced.code+";return reader;")(code=>({code}),{error:(...args)=>logs.push(args)},global);const result=run({lineage:"fixture",revision:"3"},{status:"value",takeValue(){takes++;return value;}},{invalid:false},{},binding);assert.equal(takes,1);return {result,capture:global.__breditorRejectedCheckpointInput,logs};};
  const valid=invoke("valid",contract);assert.equal(valid.capture,undefined);assert.equal(valid.logs.length,0);
  const failed=invoke("bad",contract);assert.equal(failed.result.ok,false);assert.equal(JSON.stringify(failed.capture.contract),JSON.stringify(contract));assert.ok(Object.isFrozen(failed.capture.contract.formats[0].properties[0].valueType));assert.notEqual(failed.capture.contract,contract);
  let reads=0;const accessor={mode:"v7",get formats(){reads++;throw Error();}};assert.equal(invoke("bad",accessor).capture.contract,undefined);assert.equal(reads,0);
  for(const invalid of [{__wbg_ptr:1},{mode:"x".repeat(65537)},Object.assign({},contract,{self:null})]){if(Object.hasOwn(invalid,"self"))invalid.self=invalid;assert.equal(invoke("bad",invalid).capture.contract,undefined);}
  assert.throws(()=>traceRetainedBootstrapFailures(source+reader,{checkpointContractCapture:true}),/requires checkpoint capture/u);
  assert.equal(traceRetainedBootstrapFailures(source+reader,{checkpointReader:true,checkpointCapture:true,checkpointContractCapture:false}).code,traceRetainedBootstrapFailures(source+reader,{checkpointReader:true,checkpointCapture:true}).code);
});

test("owner reason trace observes the first live fault without extra state reads or altered return",()=>{
  for(const body of ['if(this.#status.phase!=="live")return;this.#status=Object.freeze({phase:"faulted",reason});',
    'this.#status.phase==="live"&&(this.#status=Object.freeze({phase:"faulted",reason}),void 0);']) {
  const owner=`class Owner{#status={phase:"live"};#fault(reason){${body}}run(reason){return this.#fault(reason);}get status(){return this.#status;}}`;
  const traced=traceRetainedBootstrapFailures(source+owner,{ownerReasons:true}),logs=[];
  const instance=Function("error","console",traced.code+";return new Owner;")(code=>({code}),{error:(...args)=>logs.push(args)});
  assert.equal(instance.run("eventRouterFaulted"),undefined);assert.deepEqual(instance.status,{phase:"faulted",reason:"eventRouterFaulted"});
  assert.equal(logs.length,1);assert.equal(JSON.parse(logs[0][1]).bindings.reason.value,"eventRouterFaulted");
  instance.run("ignored later fault");assert.equal(logs.length,1);assert.equal(instance.status.reason,"eventRouterFaulted");
  assert.throws(()=>traceRetainedBootstrapFailures(source,{ownerReasons:true}),/boundary missing/u);
  assert.throws(()=>traceRetainedBootstrapFailures(source+owner,{ownerReasons:"yes"}));
  }
});
