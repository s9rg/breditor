import assert from "node:assert/strict";
import test from "node:test";
import {traceRetainedBootstrapFailures} from "./retained-bootstrap-failure-trace.mjs";

const bootstrap='const a=error("engine_bootstrap.invalid_wasm_view"),b=error("engine_bootstrap.invalid_initial_projection");function bootstrap(x){if(x)return Object.freeze({ok:false,error:a});return Object.freeze({ok:false,error:b});}';
// Match the retained immediate-delivery boundary, including catches and the
// compact conditional exits produced by the bundler. Each failure stays cold.
const owner=`class Owner {
  #ports; #status={phase:"live"};
  constructor(ports){this.#ports=ports;}
  run(buildRequest){return this.#immediate(buildRequest);}
  #immediate(buildRequest){
    if(this.#status.phase!=="live")return Object.freeze({status:"unavailable"});
    try {
      if(!this.#ports.canonical())return Object.freeze({status:"failed"});
      let state=this.#ports.adapter.state;
      if(state==="composition")return Object.freeze({status:"busy"});
      if(state!=="live")return Object.freeze({status:"unavailable"});
      if(this.#ports.queue.failure()!==undefined)return Object.freeze({status:"failed"});
    }catch{return Object.freeze({status:"failed"});}
    let lease;
    try{lease=this.#ports.queue.acquireLease();}catch{return Object.freeze({status:"failed"});}
    if(lease===undefined)try{
      return this.#ports.queue.failure()===undefined?Object.freeze({status:"busy"}):Object.freeze({status:"failed"});
    }catch{return Object.freeze({status:"failed"});}
    let submission,released=false;
    try{let request=buildRequest();submission=this.#ports.queue.submitLeased(lease,request);}
    catch{submission=undefined;}
    finally{try{released=this.#ports.queue.releaseLease(lease);}catch{released=false;}}
    return submission?.status==="completed"
      ?!released&&this.#status.phase==="live"?Object.freeze({status:"failed"}):Object.freeze({status:"completed",submission})
      :submission?.status==="failed"?Object.freeze({status:"failed"})
      :submission?.status==="rejected"&&submission.reason==="disposed"?Object.freeze({status:"unavailable"})
      :Object.freeze({status:"failed"});
  }
}`;
const source=bootstrap+owner;
const compile=(code,console)=>Function("error","console",code+";return Owner;")(code=>({code}),console);

function exercise(code,mode,log=()=>{}) {
  const calls=[],lease={},request={},completion={status:"completed",result:{status:"delivered"}};
  let reads=0,accessors=0;
  Object.defineProperty(completion,"projection",{get(){accessors++;throw Error("extra projection read");}});
  const queue={
    failure(){assert.equal(this,queue);calls.push("failure");reads++;
      if(mode==="failureThrow"||mode==="noLeaseThrow"&&reads===2)throw Error("fixture");
      return mode==="queueFault"||mode==="noLeaseFault"&&reads===2?{code:"fixture"}:undefined;},
    acquireLease(){assert.equal(this,queue);calls.push("acquire");
      if(mode==="acquireThrow")throw Error("fixture");
      return mode.startsWith("noLease")?undefined:lease;},
    submitLeased(l,r){assert.equal(this,queue);assert.equal(l,lease);assert.equal(r,request);calls.push("submit");
      if(mode==="submitThrow")throw Error("fixture");
      return mode==="submitFailed"?{status:"failed"}:mode==="submitAbsent"?undefined:
        mode==="submitRejected"?{status:"rejected",reason:"other"}:
        mode==="submitDisposed"?{status:"rejected",reason:"disposed"}:completion;},
    releaseLease(l){assert.equal(this,queue);assert.equal(l,lease);calls.push("release");
      if(mode==="releaseThrow")throw Error("fixture");
      return mode!=="releaseFalse";},
  };
  const ports={queue,
    canonical(){assert.equal(this,ports);calls.push("canonical");if(mode==="canonicalThrow")throw Error("fixture");return mode!=="notCanonical";},
    adapter:{get state(){calls.push("state");if(mode==="stateThrow")throw Error("fixture");return mode==="composition"?"composition":mode==="unavailable"?"disposed":"live";}},
  };
  const result=new (compile(code,{error:log}))(ports).run(()=>{calls.push("build");if(mode==="buildThrow")throw Error("fixture");return request;});
  if(result.status==="completed")assert.equal(result.submission,completion);
  return {result,calls,accessors};
}

test("immediate tracing is explicitly opt-in and rejects missing or ambiguous boundaries",()=>{
  assert.equal(traceRetainedBootstrapFailures(source).code,traceRetainedBootstrapFailures(source,{ownerImmediateExits:false}).code);
  assert.throws(()=>traceRetainedBootstrapFailures(source,{ownerImmediateExits:"yes"}));
  assert.throws(()=>traceRetainedBootstrapFailures(bootstrap,{ownerImmediateExits:true}),/boundary missing/u);
  assert.throws(()=>traceRetainedBootstrapFailures(source+owner.replaceAll("Owner","Other"),{ownerImmediateExits:true}),/ambiguous/u);
  const traced=traceRetainedBootstrapFailures(source,{ownerImmediateExits:true});
  assert.equal(traced.sites.filter(site=>site.code==="owner-immediate-rejection").length,9);
});

test("success, busy and unavailable paths remain silent with identical port reads and result identity",()=>{
  const traced=traceRetainedBootstrapFailures(source,{ownerImmediateExits:true}),logs=[];
  for(const mode of ["success","composition","unavailable","noLeaseBusy","submitDisposed"]) {
    const actual=exercise(traced.code,mode,(...args)=>logs.push(args)),control=exercise(source,mode);
    assert.deepEqual(actual,control,mode);
  }
  assert.deepEqual(logs,[]);
});

test("all cold failure paths log once and preserve short circuiting, receivers and release counts",()=>{
  const traced=traceRetainedBootstrapFailures(source,{ownerImmediateExits:true}),stages=new Set();
  for(const mode of ["notCanonical","canonicalThrow","stateThrow","queueFault","failureThrow","acquireThrow",
    "noLeaseFault","noLeaseThrow","releaseFalse","releaseThrow","submitFailed","submitAbsent","submitRejected","buildThrow","submitThrow"]) {
    const logs=[],actual=exercise(traced.code,mode,(...args)=>logs.push(args)),control=exercise(source,mode);
    assert.deepEqual(actual,control,mode);assert.equal(actual.result.status,"failed");
    assert.equal(logs.length,1,mode);const captured=JSON.parse(logs[0][1]);
    assert.equal(captured.code,"owner-immediate-rejection");stages.add(captured.stage);
    assert.equal(actual.accessors,0);assert.equal(logs[0][1].includes("extra projection read"),false);
    if(mode==="releaseFalse"||mode==="releaseThrow") {
      assert.equal(captured.bindings.released.value,false);
      assert.equal(captured.bindings.submission.fields.status.value,"completed");
    }
    if(mode==="buildThrow"||mode==="submitThrow")assert.equal(captured.bindings.submission.type,"undefined");
  }
  assert.equal(stages.size,9);
});

test("logging exceptions cannot replace a failure or skip release",()=>{
  const traced=traceRetainedBootstrapFailures(source,{ownerImmediateExits:true});
  for(const mode of ["notCanonical","releaseFalse","submitFailed","buildThrow"]) {
    assert.deepEqual(exercise(traced.code,mode,()=>{throw Error("logger unavailable");}),exercise(source,mode));
  }
});

test("failed values inside nested functions are not mistaken for immediate exits",()=>{
  const nested=source.replace('let lease;', 'const unrelated=()=>Object.freeze({status:"failed"});let lease;');
  const traced=traceRetainedBootstrapFailures(nested,{ownerImmediateExits:true});
  assert.equal(traced.sites.filter(site=>site.code==="owner-immediate-rejection").length,9);
  assert.equal(traced.code.includes('const unrelated=()=>Object.freeze({status:"failed"})'),true);
});

test("non-returned failed values do not log on successful paths",()=>{
  const unrelated=source.replace('let lease;', 'const cached=Object.freeze({status:"failed"});let lease;');
  const traced=traceRetainedBootstrapFailures(unrelated,{ownerImmediateExits:true}),logs=[];
  assert.equal(traced.sites.filter(site=>site.code==="owner-immediate-rejection").length,9);
  assert.deepEqual(exercise(traced.code,"success",(...args)=>logs.push(args)),exercise(unrelated,"success"));
  assert.deepEqual(logs,[]);
});
