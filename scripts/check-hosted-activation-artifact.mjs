/** Authenticate the final whole-room workflow result and recheck its six shards locally. */
import assert from "node:assert/strict";
import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {checkActivationBundle} from "./candidate-release/activation-inputs.mjs";
import {verifyActivationShards} from "./candidate-release/activation-results.mjs";
import {sourceEvidence} from "./candidate-release/evidence.mjs";
import {
 githubRepositoryName,readGitHubMetadata,verifiedGitHubArchive,verifyGitHubArtifactMetadata,verifyGitHubRunSource,
} from "./candidate-release/github-artifact.mjs";
import {repository as candidateRoot} from "./candidate-release/plan.mjs";

const workflow=".github/workflows/activation-qualification.yml";

export async function verifyHostedActivationArtifact(root,{repository,artifactMetadata,runMetadata,archive,inputs,reports}){
 assert.match(repository,githubRepositoryName,"Specify the expected GitHub repository as owner/name");
 const source=sourceEvidence(root);
 assert.ok(source.commit&&!source.dirty,"Check out one clean candidate before reviewing its activation evidence");
 const artifact=readGitHubMetadata(artifactMetadata),run=readGitHubMetadata(runMetadata);
 verifyGitHubRunSource(repository,run,source);
 assert.ok(run.status==="completed"&&run.conclusion==="success"&&run.event==="workflow_dispatch"&&run.path===workflow,
  "GitHub run attempt did not succeed in the whole-room activation workflow");
 verifyGitHubArtifactMetadata(repository,run,artifact,`activation-qualification-${run.run_attempt}`);
 const {readEntry,verifyUnchanged}=await verifiedGitHubArchive(archive,artifact);
 const aggregate=JSON.parse(readEntry("activation-qualification.json",1024*1024));
 assert.deepEqual(aggregate.source,source,"Archived activation aggregate belongs to another candidate");
 assert.match(aggregate.inputSha256,/^[a-f0-9]{64}$/u,"Missing archived activation input digest");
 const bundle=checkActivationBundle(root,inputs,aggregate.inputSha256);
 const qualification=verifyActivationShards(reports,bundle);
 assert.deepEqual(qualification,aggregate,"Verified activation shards differ from the archived aggregate");
 await verifyUnchanged();
 assert.deepEqual(sourceEvidence(root),source,"Candidate source changed during hosted activation review");
 return {format:"breditor/hosted-activation-qualification",formatVersion:1,qualification,repository,workflow,
  runId:run.id,runAttempt:run.run_attempt,githubArtifact:{id:artifact.id,name:artifact.name,digest:artifact.digest}};
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 try{
  assert.equal(args.length,6,"Usage: node scripts/check-hosted-activation-artifact.mjs <owner/repo> <artifact.json> <run-attempt.json> <aggregate.zip> <inputs-directory> <reports-directory>");
  const [repository,artifactMetadata,runMetadata,archive,inputs,reports]=args;
  const result=await verifyHostedActivationArtifact(candidateRoot,{repository,artifactMetadata,runMetadata,archive,inputs,reports});
  console.log(JSON.stringify(result,null,2));
 }catch(error){
  console.error(`check-hosted-activation-artifact: ${error.message}`);
  process.exitCode=2;
 }
}
