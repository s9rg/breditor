import assert from "node:assert/strict";
import {test} from "node:test";
import {instrumentElementTypeReturn} from "./element-type-return-diagnostics.mjs";

test("raw absence trace preserves calls, decoding, cleanup and hostile logging", () => {
  const source = `class View {__wbg_ptr=7; elementType(e){try{let r=w.__wbindgen_add_to_stack_pointer(-16);w.breditorprojection_elementType(r,this.__wbg_ptr,e);var t=R().getInt32(r+0,!0),n=R().getInt32(r+4,!0);let i;return t!==0&&(i=z(t,n),w.__wbindgen_export(t,n*1,1)),i}finally{w.__wbindgen_add_to_stack_pointer(16)}}}`;
  for (const pointer of [0, 42]) for (const hostile of [false, true]) {
    const traces = [];
    for (const code of [source, instrumentElementTypeReturn(source)]) {
      const calls = [], logs = [];
      const w = {__wbindgen_add_to_stack_pointer(n) {calls.push(["stack",n]);return 100;},
        breditorprojection_elementType(...args) {calls.push(["wasm",...args]);},
        __wbindgen_export(...args) {calls.push(["free",...args]);}};
      const View = new Function("w","R","z","console",`${code}; return View;`)(w,
        () => ({getInt32(offset) {calls.push(["read",offset]);return offset===100?pointer:4;}}),
        (...args) => {calls.push(["decode",...args]);return "name";},
        {error(...args) {logs.push(args);if(hostile)throw 1;}});
      traces.push({value:new View().elementType(1587),calls});
      if(code!==source) assert.equal(logs.length,pointer===0?1:0);
    }
    assert.deepEqual(traces[0],traces[1]);
  }
  for (const code of ["",source+source]) assert.throws(()=>instrumentElementTypeReturn(code));
});
