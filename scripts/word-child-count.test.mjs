import assert from "node:assert/strict";
import test from "node:test";
import {runInNewContext} from "node:vm";
import {decodeChildCountWords} from "./fixtures/nested-getter-probe/word-count.js";
test("word count decoder preserves optional u32 values and rejects malformed records",()=>{
  assert.equal(decodeChildCountWords(new Uint32Array([0,0])),undefined);
  for(const value of [0,1,0xffffffff])assert.equal(decodeChildCountWords(new Uint32Array([1,value])),value);
  for(const value of [null,{},[1,1],new Int32Array([1,1]),new Uint32Array([]),new Uint32Array([1]),new Uint32Array([1,1,1]),new Uint32Array([0,1]),new Uint32Array([2,1]),new Proxy(new Uint32Array([1,1]),{})])assert.throws(()=>decodeChildCountWords(value),TypeError);
  assert.equal(decodeChildCountWords(runInNewContext("new Uint32Array([1,4294967295])")),4294967295);
  assert.throws(()=>decodeChildCountWords(runInNewContext("new Int32Array([1,1])")),TypeError);
  let touched=false;
  assert.throws(()=>decodeChildCountWords({get [Symbol.toStringTag](){touched=true;return "Uint32Array";}}),TypeError);
  assert.equal(touched,false);
});
