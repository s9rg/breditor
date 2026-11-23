import assert from "node:assert/strict";
import test from "node:test";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {sharedRuntimeBuildReport} from "./candidate-release/shared-runtime-evidence.mjs";

test("each candidate profile retains a fresh, source-bound shared runtime receipt",()=>{
 for(const profile of ["functional","full"]){
  const [{artifacts}]=candidateReleasePlan({profile}).checks.filter(check=>check.id==="paired-shared-runtime");
  assert.deepEqual(artifacts.filter(artifact=>artifact.path===sharedRuntimeBuildReport),[
   {path:sharedRuntimeBuildReport,fresh:true,retain:true},
  ],profile);
 }
});

test("each candidate profile retains fresh dependency and notice bytes from both Wasm packages",()=>{
 for(const profile of ["functional","full"]){
  const {checks}=candidateReleasePlan({profile});
  for(const [id,directory] of [
   ["paired-local-runtime","packages/breditor-experimental-rich-content/dist"],
   ["paired-shared-runtime","packages/breditor-collaboration/dist/runtime"],
  ]){
   const {artifacts}=checks.find(check=>check.id===id);
   for(const file of ["breditor_dependency_inventory.json","THIRD_PARTY_NOTICES.txt","RUST_COPYRIGHT-library.html"]){
    const path=`${directory}/${file}`;
    assert.deepEqual(artifacts.find(artifact=>artifact.path===path),{path,fresh:true,retain:true},`${profile} ${id}`);
   }
  }
 }
});
