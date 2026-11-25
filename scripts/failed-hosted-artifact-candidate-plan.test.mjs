import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync,mkdtempSync,readFileSync,rmSync,statSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {fileEvidence,sourceEvidence} from "./candidate-release/evidence.mjs";
import {verifyFailedHostedCandidateArtifact} from "./check-hosted-candidate-artifact.mjs";

test("failed hosted evidence binds the stage records and setup-only runs to exact archived bytes",async t=>{
 const directory=mkdtempSync(join(tmpdir(),"breditor-failed-hosted-proof-"));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const root=join(directory,"candidate"),repository="s9rg/breditor",profile="default-matrix";
 mkdirSync(root);
 const git=args=>execFileSync("git",args,{cwd:root,stdio:"ignore"});
 git(["init","-q"]);
 writeFileSync(join(root,"source.txt"),"source fixture\n");
 git(["add","source.txt"]);
 git(["-c","user.name=Candidate Fixture","-c","user.email=fixture@example.test","commit","-qm","Candidate source"]);
 const source=sourceEvidence(root);
 const runRepository={id:42,full_name:repository},workflowPath=".github/workflows/candidate-qualification.yml";
 const run={id:521,run_attempt:2,repository:runRepository,head_repository:runRepository,head_sha:source.commit,
  path:workflowPath,event:"workflow_dispatch",status:"completed",conclusion:"failure"};
 const context={format:"1",repository,workflow:`${repository}/${workflowPath}@refs/heads/main`,
  event:"workflow_dispatch",runId:String(run.id),runAttempt:String(run.run_attempt),revision:source.commit,
  profile,shard:"none",os:"Linux",arch:"X64",checkout:"success",node:"success",rust:"success",npm:"success",
  cargo:"success",browsers:"success",candidate:"failure"};
 const log="run-fixture/01-default-package-release-matrix.log",manifest="run-fixture/result.json";
 function fixture(name,{setup=false,resultSource=source,attempt=run}={}){
  const extracted=join(directory,name),archive=join(directory,`${name}.zip`);
  mkdirSync(extracted);
  const runner=setup?{...context,npm:"failure",cargo:"skipped",browsers:"skipped",candidate:"skipped"}:context;
  writeFileSync(join(extracted,"runner-context.tsv"),Object.entries(runner).map(([key,value])=>`${key}\t${value}\n`).join(""));
  const members=["runner-context.tsv"];
  if(!setup){
   mkdirSync(join(extracted,"run-fixture"));
   writeFileSync(join(extracted,log),"Default browser suite failed.\n");
   writeFileSync(join(extracted,manifest),JSON.stringify({
    format:"breditor/candidate-qualification",formatVersion:1,source:resultSource,profile,status:"failed",selectedChecksPassed:false,
    hostedRun:{runId:runner.runId,runAttempt:runner.runAttempt},stages:[{id:"default-package-release-matrix",status:"failed",
     exitCode:1,signal:null,log:fileEvidence(extracted,log)}],
   }));
   members.push("run-fixture");
  }
  execFileSync("zip",["-qr",archive,...members],{cwd:extracted});
  const artifactMetadata=join(directory,`${name}-artifact.json`),runMetadata=join(directory,`${name}-attempt.json`);
  writeFileSync(runMetadata,JSON.stringify(attempt));
  writeFileSync(artifactMetadata,JSON.stringify({id:789,expired:false,url:`https://api.github.com/repos/${repository}/actions/artifacts/789`,
   name:`candidate-${source.commit}-${profile}-${context.runAttempt}`,size_in_bytes:statSync(archive).size,
   digest:"sha256:"+createHash("sha256").update(readFileSync(archive)).digest("hex"),
   workflow_run:{id:run.id,repository_id:42,head_repository_id:42,head_sha:source.commit},
  }));
  return {repository,artifactMetadata,runMetadata,archive,extracted};
 }
 const failed=fixture("failed"),report=await verifyFailedHostedCandidateArtifact(root,failed);
 assert.equal(report.format,"breditor/hosted-candidate-failure");
 assert.equal(report.failureStep,"candidate");
 assert.deepEqual(report.result.lastStage,{id:"default-package-release-matrix",status:"failed",exitCode:1,signal:null});
 assert.equal(report.result.logs[0].path,log);
 assert.equal(report.coveredStages,undefined);
 const setup=await verifyFailedHostedCandidateArtifact(root,fixture("setup",{setup:true}));
 assert.equal(setup.failureStep,"npm");
 assert.equal(setup.result,undefined);
 await assert.rejects(verifyFailedHostedCandidateArtifact(root,fixture("success",{attempt:{...run,conclusion:"success"}})),
  /did not record a candidate workflow failure/);
 await assert.rejects(verifyFailedHostedCandidateArtifact(root,fixture("wrong-source",{resultSource:{...source,commit:"0".repeat(40)}})),
  /Failed result belongs to another candidate/);
 writeFileSync(join(failed.extracted,log),Buffer.alloc(statSync(join(failed.extracted,log)).size,0x61));
 await assert.rejects(verifyFailedHostedCandidateArtifact(root,failed),/Retained log hash differs/);
});
