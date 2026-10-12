import assert from "node:assert/strict";
import test from "node:test";
import {DIRECT_GETTER_BRIDGE} from "./direct-getter-bridge.mjs";

test("direct getter experiment retains receiver, arguments, primitive result and one call",()=>{
  const bridge=new Function("Ph",DIRECT_GETTER_BRIDGE+";return z;")(value=>value!==null&&typeof value==="object");
  const receiver={owner:17};
  for(const args of [[488],[488,1]])for(const result of [undefined,0,-0,1,"element"]){
    const calls=[];
    function getter(...received){calls.push({receiver:this,args:received});return result;}
    assert.ok(Object.is(bridge(getter,receiver,...args),result));
    assert.deepEqual(calls,[{receiver,args}]);
  }
  let calls=0;function getter(){calls++;return 1;}
  assert.throws(()=>bridge(getter,receiver),/arity/);
  assert.throws(()=>bridge(getter,receiver,1,2,3),/arity/);
  assert.equal(calls,0);
  const error=new Error("getter failure");
  assert.throws(()=>bridge(function(){throw error;},receiver,1),value=>value===error);
  assert.throws(()=>bridge(()=>({then(){}}),receiver,1),TypeError);
});
