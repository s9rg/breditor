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
