import test from "node:test";
import assert from "node:assert/strict";
import {compileRichProfile,compileStructuralRichProfileV2,compileStandardStructuralRichProfileV2} from "../packages/breditor-experimental-rich-content/index.js";
function fixture(extra={}){
 const descriptor={kind:"rich",abiVersion:1,schema:{name:"example/contracts",version:1},schemaFingerprint:`sha256:${"0".repeat(64)}`,...extra},frees={factory:0,descriptor:0,owner:0};
 const raw={descriptorJson:()=>({status:"value",takeValue:()=>JSON.stringify(descriptor),free:()=>frees.descriptor++}),free:()=>frees.owner++};
 const create=()=>({status:"profile",takeProfile:()=>raw,free:()=>frees.factory++});
 return {wasm:{BreditorRichProfile:{fromBootstrapJson:create,fromStructuralBootstrapJsonV2:create,fromStandardStructuralBootstrapJsonV2:create}},descriptor,frees};
}
test("V1 descriptor and ordinary factory remain unchanged without task capability metadata",()=>{
 const t=fixture(),profile=compileRichProfile(t.wasm,"{}");assert.deepEqual(profile.descriptor(),t.descriptor);profile.dispose();profile.dispose();assert.deepEqual(t.frees,{factory:1,descriptor:1,owner:1});
});
test("both explicit structural factories admit matching task structure capability without changing schema identity",()=>{
 for(const compile of [compileStructuralRichProfileV2,compileStandardStructuralRichProfileV2]){
  const t=fixture({richLanguageVersion:2,taskStructureVersion:1}),profile=compile(t.wasm,"{}");assert.deepEqual(profile.descriptor(),t.descriptor);profile.dispose();assert.deepEqual(t.frees,{factory:1,descriptor:1,owner:1});
 }
});
test("older or incompatible V2 task runtimes reject and release the acquired profile before owner creation",()=>{
 for(const compile of [compileStructuralRichProfileV2,compileStandardStructuralRichProfileV2])for(const taskStructureVersion of [undefined,null,0,2,"1",true,{}]){
  const t=fixture({richLanguageVersion:2,taskStructureVersion});assert.throws(()=>compile(t.wasm,"{}"),error=>error.code==="breditor_rich.structural_runtime");assert.deepEqual(t.frees,{factory:1,descriptor:1,owner:1});
 }
});
