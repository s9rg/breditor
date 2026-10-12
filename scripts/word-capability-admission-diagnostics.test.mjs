import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {transformSync} from "rolldown/utils";
import {instrumentWordCapabilityAdmission,instrumentBootstrapFailureSites} from "./word-capability-admission-diagnostics.mjs";

const source=transformSync("helper.ts",readFileSync(new URL("../packages/breditor-browser/src/wasm_projection_word_facade.ts",import.meta.url),"utf8")).code;
function diagnosed(){
  const state={},logs=[];
  const run=Function("globalThis","console",instrumentWordCapabilityAdmission(source).replace("export function","function")+";return snapshotNestedProjectionWordFacade;")(
    state,{error:(...args)=>logs.push(args)});
  return {state,logs,run};
}
const names=["childCountWords","childAtWords","formatCountWords","formatPropertyCountWords","headingLevelWords","orderedListStartWords"];
test("valid word admission preserves receiver, exact record and single reads/guards",()=>{
  const {state,logs,run}=diagnosed();let reads=0,guards=0,calls=0;
  const record=new Uint32Array([1,7]);const raw={};
  Object.defineProperty(raw,"projectionScalarWordsVersion",{get(){reads++;return 1;}});
  Object.defineProperty(raw,"projectionIntegerWordsVersion",{get(){reads++;return undefined;}});
  for(const name of names)raw[name]=function(...args){assert.equal(this,raw);assert.deepEqual(args,[4]);calls++;return record;};
  const facade=run(raw,()=>{guards++;return false;});
  assert.equal(reads,2);assert.equal(guards,9);assert.equal(logs.length,0);
  assert.equal(facade.childCountWords(4),record);assert.equal(calls,1);
  assert.equal(state.__breditorLastWordCapability.outcome,"accepted");
  assert.equal(state.__breditorLastWordCapability.scalarNumber,1);
  const first=state.__breditorLastWordCapability.identity;run(raw,()=>false);
  assert.equal(state.__breditorLastWordCapability.identity,first);
  run({...raw},()=>false);assert.notEqual(state.__breditorLastWordCapability.identity,first);
});
test("legacy, orphan, unknown, partial and throwing reads retain outcomes",()=>{
  for(const raw of [{},{childCountWords(){}},{projectionScalarWordsVersion:2},
    {projectionScalarWordsVersion:1}]) {
    const {state,logs,run}=diagnosed();
    const result=run(raw,()=>false);
    assert.equal(result===null,Object.keys(raw).length>0);
    assert.equal(logs.length,result===null?1:0);
    assert.equal(state.__breditorLastWordCapability.outcome,result===null?"rejected":"accepted");
  }
  const {state,logs,run}=diagnosed();const sentinel=Error("getter failure");
  const raw={get projectionScalarWordsVersion(){throw sentinel;}};
  assert.throws(()=>run(raw,()=>false),error=>error===sentinel);
  assert.equal(state.__breditorLastWordCapability.stage,"scalar-read");
  assert.equal(state.__breditorLastWordCapability.outcome,"threw");assert.equal(logs.length,1);
});
test("bootstrap trace does not repeat checks or replace returned errors",()=>{
  const source='function check(ok) {\n if(!ok) {\n return Object.freeze({ ok: false, error: INVALID_VIEW });\n }\n return Object.freeze({ ok: false, error: INVALID_PROJECTION });\n}';
  const view={},projection={},logs=[];
  const run=Function("INVALID_VIEW","INVALID_PROJECTION","console","globalThis",instrumentBootstrapFailureSites(source)+";return check;")(view,projection,{error:(...args)=>logs.push(args)},{});
  assert.equal(run(false).error,view);assert.equal(run(true).error,projection);assert.equal(logs.length,2);
  const inline='function check(ok) { if(!ok) return Object.freeze({ok:false,error:INVALID_VIEW}); return Object.freeze({ok:false,error:INVALID_PROJECTION}); }';
  const inlineRun=Function("INVALID_VIEW","INVALID_PROJECTION","console","globalThis",instrumentBootstrapFailureSites(inline)+";return check;")(view,projection,{error(){}},{});
  assert.equal(inlineRun(false).error,view);assert.equal(inlineRun(true).error,projection);
  const current=transformSync("bootstrap.ts",readFileSync(new URL("../packages/breditor-browser/src/wasm_engine_bootstrap.ts",import.meta.url),"utf8")).code;
  assert.ok(instrumentBootstrapFailureSites(current).includes("breditor bootstrap rejection"));
});
test("unknown or already instrumented source rejects before execution",()=>{
  assert.throws(()=>instrumentWordCapabilityAdmission("export function other(){}"));
  assert.throws(()=>instrumentWordCapabilityAdmission(instrumentWordCapabilityAdmission(source)),/duplicate/u);
  assert.throws(()=>instrumentBootstrapFailureSites("export function other(){}"));
  assert.throws(()=>instrumentBootstrapFailureSites(instrumentBootstrapFailureSites(
    'function check() {return Object.freeze({ok:false,error:INVALID_VIEW});}\nfunction other(){return Object.freeze({ok:false,error:INVALID_PROJECTION});}')),/duplicate/u);
});
