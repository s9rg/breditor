import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {chmodSync,mkdirSync,mkdtempSync,realpathSync,rmSync,utimesSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join,sep} from "node:path";
import {test} from "node:test";
import {saveEvidence,sourceEvidence} from "./candidate-release/evidence.mjs";
import {nativeSuggestionBuildReport,nativeSuggestionExecutable,retainNativeSuggestionBuild} from "./candidate-release/native-suggestion-build-evidence.mjs";
import {candidateReleasePlan,repository} from "./candidate-release/plan.mjs";
import {candidateShardPlan} from "./candidate-release/shards.mjs";
import {retainSharedRuntimeBuild,sharedRuntimeBuildReport} from "./candidate-release/shared-runtime-evidence.mjs";
import {candidateCoverage} from "./check-candidate-coverage.mjs";
import {runCandidateChecks} from "./verify-candidate.mjs";

test("direct Native coverage binds fixture use to the earlier producer artifact digest",async t=>{
 const root=realpathSync(mkdtempSync(join(tmpdir(),"breditor-native-receipt-coverage-")));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=args=>execFileSync("git",args,{cwd:root,stdio:"ignore"});
 git(["init","-q"]);
 writeFileSync(join(root,".gitignore"),"target/\ndist/\n");
 git(["add",".gitignore"]);
 git(["-c","user.name=Candidate Fixture","-c","user.email=fixture@example.test","commit","-qm","Candidate source"]);
 const plan=candidateShardPlan(candidateReleasePlan({environment:{}}),"metadata-reconciliation-source");
 const relocate=value=>value.startsWith(repository+sep)?root+value.slice(repository.length):value;
 const checks=plan.checks.map(check=>({...check,args:check.args.map(relocate),
  env:Object.fromEntries(Object.entries(check.env).map(([key,value])=>[key,relocate(value)]))}));
 const write=(path,contents)=>{
  const file=join(root,path);
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,contents);
 };
 const run=await runCandidateChecks({...plan,checks},{root,report:()=>{},execute:async(check,{logPath})=>{
  writeFileSync(logPath,check.id);
  for(const artifact of check.artifacts)write(artifact.path,check.id);
  if(check.id==="paired-shared-runtime"){
   for(const directory of ["target/promoted-shared-web","packages/breditor-collaboration/dist/runtime"]){
    for(const file of ["breditor_shared.js","breditor_shared.d.ts","breditor_shared_bg.wasm","breditor_shared_bg.wasm.d.ts"]){
     write(`${directory}/${file}`,file);
    }
   }
   retainSharedRuntimeBuild(root,sourceEvidence(root));
  }
  if(check.id==="native-suggestion-room-host"){
   const executable=join(root,nativeSuggestionExecutable);
   chmodSync(executable,0o755);
   retainNativeSuggestionBuild(root,sourceEvidence(root),executable);
  }
  const now=Date.now()/1000;
  for(const artifact of check.artifacts)utimesSync(join(root,artifact.path),now+2,now+2);
  return {status:"passed",exitCode:0,signal:null};
 }});
 assert.equal(run.exitCode,0,run.result.error);
 const stages=run.result.stages,producer=stages.find(stage=>stage.id==="native-suggestion-room-host");
 const artifact=producer.artifacts.find(item=>item.path===nativeSuggestionBuildReport);
 assert.equal(artifact.retainedPath,undefined);
 assert.ok(stages.find(stage=>stage.id==="paired-shared-runtime").artifacts.find(item=>item.path===sharedRuntimeBuildReport).retainedPath);
 assert.equal(candidateCoverage(root,[run.manifest]).coveredStages,checks.length);
 const consumer=stages.find(stage=>stage.id==="metadata-reconciliation-native");
 assert.equal(consumer.nativeHostBuildReceiptSha256,artifact.sha256);
 for(const value of ["0".repeat(64),undefined]){
  consumer.nativeHostBuildReceiptSha256=value;
  saveEvidence(run.manifest,run.result);
  assert.throws(()=>candidateCoverage(root,[run.manifest]),/Native host build receipt differs for metadata-reconciliation-native/);
 }
 consumer.nativeHostBuildReceiptSha256=artifact.sha256;
 const earlier=stages.indexOf(producer),later=stages.indexOf(consumer);
 [stages[earlier],stages[later]]=[consumer,producer];
 saveEvidence(run.manifest,run.result);
 assert.throws(()=>candidateCoverage(root,[run.manifest]),/Stage sequence differs/);
});
