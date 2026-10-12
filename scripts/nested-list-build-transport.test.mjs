import assert from "node:assert/strict";
import test from "node:test";
import {nestedListBuildTransport} from "./nested-list-build-transport.mjs";

test("ordinary nested mode selects complete word transport without mutating environment", () => {
  const env={}; const result=nestedListBuildTransport(env);
  assert.deepEqual(result,{privateScalarWords:true,privateWordBindings:true,privateIntegerWords:true});
  assert(Object.isFrozen(result)); assert.deepEqual(env,{});
});
test("diagnostic names and explicit legacy scalar flag retain legacy mode", () => {
  const legacy={privateScalarWords:false,privateWordBindings:false,privateIntegerWords:false};
  assert.deepEqual(nestedListBuildTransport({}, {diagnosticNames:true}),legacy);
  assert.deepEqual(nestedListBuildTransport({BREDITOR_NESTED_WORD_CANDIDATE:"0"}),legacy);
});
test("explicit historical comparisons remain available", () => {
  assert.deepEqual(nestedListBuildTransport({BREDITOR_NESTED_WORD_CANDIDATE:"1",
    BREDITOR_NESTED_WORD_BINDINGS:"0",BREDITOR_NESTED_INTEGER_WORDS:"0"}),
  {privateScalarWords:true,privateWordBindings:false,privateIntegerWords:false});
});
for(const name of ["BREDITOR_NESTED_WORD_CANDIDATE","BREDITOR_NESTED_WORD_BINDINGS","BREDITOR_NESTED_INTEGER_WORDS"])
  for(const value of ["", "2",true,null,1]) test(`rejects invalid ${name} ${JSON.stringify(value)}`,()=>{
    assert.throws(()=>nestedListBuildTransport({[name]:value}),/must be 0 or 1/u);
  });
test("rejects word methods without scalar transport and words with diagnostic names",()=>{
  assert.throws(()=>nestedListBuildTransport({BREDITOR_NESTED_WORD_CANDIDATE:"0",BREDITOR_NESTED_WORD_BINDINGS:"1"}),/bindings require/u);
  assert.throws(()=>nestedListBuildTransport({BREDITOR_NESTED_WORD_CANDIDATE:"0",BREDITOR_NESTED_INTEGER_WORDS:"1"}),/integer words require/u);
  assert.throws(()=>nestedListBuildTransport({BREDITOR_NESTED_WORD_CANDIDATE:"1"},{diagnosticNames:true}),/cannot add diagnostic names/u);
});
