import assert from "node:assert/strict";
import test from "node:test";
import {relayNoticePaths,selectRelayExecutable} from "./build-relay-notices.mjs";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";

test("the relay inventory binds only to the server executable Cargo reported",()=>{
 const target={name:"breditor-collab-relay",kind:["bin"]};
 const artifact={reason:"compiler-artifact",target,package_id:"locked relay",profile:{test:false},executable:"release/bin"};
 const unrelated=[
  {...artifact,package_id:"different source"},
  {...artifact,profile:{test:true},executable:"release/deps/bin"},
  {...artifact,target:{...target,kind:["example"]},executable:"release/examples/bin"},
  {...artifact,executable:null},
 ];
 assert.equal(selectRelayExecutable([...unrelated,artifact],"locked relay"),"release/bin");
 assert.throws(()=>selectRelayExecutable(unrelated,"locked relay"),/Expected one executable/);
 assert.throws(()=>selectRelayExecutable([artifact,{...artifact,executable:"another/bin"}],"locked relay"),/Expected one executable/);
});

test("both candidate profiles record fresh native dependency evidence after relay tests",()=>{
 for(const profile of ["full","functional"]){
  const {checks}=candidateReleasePlan({profile});
  const index=checks.findIndex(stage=>stage.id==="relay-native-dependency-notices");
  assert.ok(index>0);
  assert.equal(checks[index-1].id,"relay-native");
  assert.deepEqual(checks[index].args,["scripts/build-relay-notices.mjs"]);
  assert.equal(checks[index].env.CARGO_TARGET_DIR,checks[index-1].env.CARGO_TARGET_DIR);
  assert.deepEqual(checks[index].artifacts,relayNoticePaths.map(path=>({path,fresh:true})));
 }
});
