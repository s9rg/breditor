import assert from "node:assert/strict";
import test from "node:test";
import {traceRetainedBootstrapFailures} from "./retained-bootstrap-failure-trace.mjs";

const bootstrap='const first=error("engine_bootstrap.invalid_wasm_view"),second=error("engine_bootstrap.invalid_initial_projection");function boot(x){return x?Object.freeze({ok:false,error:first}):Object.freeze({ok:false,error:second});}';
const fixture=`
const invalid=Object.freeze({code:"session_checkpoint.invalid_wasm_view"});
function own(x){return x;}
function reject(){return own(Object.freeze({ok:false,error:invalid}));}
function reader(e,t,n,r,i){if(n.invalid)return reject();let a=e;if(!a)return reject();let o=t.status;if(o==="bad")return reject();let s=t.takeValue;if(!s)return reject();let c=t.error;if(c)return reject();let u=Reflect.apply(s,t,[]);if(u==null)return reject();if(typeof u!=="string")return reject();let d=bytes(u,a,i);if(d===null)return reject();return {checkpointJson:u};}
function bytes(e,t,n){let r=envelope(e,n);if(r===null)return null;if(r.envelope.currentRevision!==t.revision)return null;return r.historyBase.snapshot.lineage!==t.lineage?null:r.utf8Bytes;}
function envelope(e,n){let count=e.length;if(count===0)return null;const parsed=JSON.parse(e);if(parsed.invalid)return null;if(n.mode!=="v7")return null;let base=parsed.historyBase,counter={propertyValues:0};if(!account(base.document,n,counter)||!state(base,n,counter)||!history(parsed,n,counter))return null;return {utf8Bytes:count,envelope:parsed,historyBase:base};}
function account(d,c,p){seen.push("account");if(branch===0)return false;const visit=value=>{seen.push("visit");if(!value)return !1;return true;};if(!visit(branch!==1))return false;return true;}
function state(d,c,p){seen.push("state");return true;}
function history(d,c,p){seen.push("history");return branch===2?false:!0;}
`;
const options={checkpointReader:true,checkpointValidation:true,checkpointPredicates:true};

test("checkpoint false-exit tracing is opt-in and dependency-closed",()=>{
  const code=bootstrap+fixture;
  assert.equal(traceRetainedBootstrapFailures(code,options).code,
    traceRetainedBootstrapFailures(code,{...options,checkpointPredicateExits:false}).code);
  assert.throws(()=>traceRetainedBootstrapFailures(code,{checkpointPredicateExits:true}),/require predicate/u);
  assert.throws(()=>traceRetainedBootstrapFailures(code,{...options,checkpointPredicateExits:1}));
  assert.throws(()=>traceRetainedBootstrapFailures(code.replace('return branch===2?false:!0','return branch!==2'),
    {...options,checkpointPredicateExits:true}),/false exit shape changed/u);
});

for(const branch of [0,1,2,3])test(`checkpoint branch ${branch} retains evaluation, short circuiting and return`,()=>{
  const traced=traceRetainedBootstrapFailures(bootstrap+fixture,{...options,checkpointPredicateExits:true});
  assert.equal(traced.sites.filter(site=>site.code==="checkpoint-accounting-exit").length,3);
  assert.equal(traced.sites.filter(site=>site.code==="checkpoint-history-exit").length,1);
  const raw=JSON.stringify({currentRevision:"1",historyBase:{snapshot:{lineage:"fixture"},document:{text:"private synthetic text"}}});
  for(const throws of [false,true]) {
    const seen=[],logs=[];
    const execute=Function("error","console","seen","branch",traced.code+";return reader;")(
      code=>({code}),{error(...args){if(throws)throw new Error("logger unavailable");logs.push(JSON.parse(args[1]));}},seen,branch);
    let takes=0;const view={status:"value",takeValue(){takes++;assert.equal(this,view);return raw;}};
    const result=execute({lineage:"fixture",revision:"1"},view,{invalid:false},{},{mode:"v7"});
    assert.equal(takes,1);
    assert.deepEqual(seen,["account","visit","state","history"].slice(0,branch===0?1:branch===1?2:4));
    if(branch===3){assert.equal(result.checkpointJson,raw);assert.deepEqual(logs,[]);}
    else {
      assert.equal(result.ok,false);
      if(!throws) {
        const exits=logs.filter(log=>log.code.endsWith("-exit"));
        assert.equal(exits.length,branch===1?2:1);
        assert.ok(exits.every(log=>log.code===(branch===2?"checkpoint-history-exit":"checkpoint-accounting-exit")));
        assert.equal(new Set(exits.map(log=>log.stage)).size,exits.length);
      }
    }
    assert.equal(JSON.stringify(logs).includes("private synthetic text"),false);
  }
});
