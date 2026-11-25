/** Check one hosted candidate against separately obtained GitHub API records. */
import assert from "node:assert/strict";
import {realpathSync} from "node:fs";
import {basename,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateCoverage} from "./check-candidate-coverage.mjs";
import {fileEvidence,sourceEvidence} from "./candidate-release/evidence.mjs";
import {
 githubRepositoryName,readGitHubMetadata,verifiedGitHubArchive,verifyGitHubArtifactMetadata,verifyGitHubRunSource,
} from "./candidate-release/github-artifact.mjs";
import {readHostedRunnerContext} from "./candidate-release/hosted-context.mjs";
import {candidateReleasePlan,repository as candidateRoot} from "./candidate-release/plan.mjs";
import {candidateShardPlan} from "./candidate-release/shards.mjs";
import {usesRichBrowserDiscovery} from "./candidate-release/rich-browser-report.mjs";

const workflowPath=".github/workflows/candidate-qualification.yml";
const failureConclusions=new Set(["failure","cancelled","timed_out"]);
const incompleteStages=new Set(["running","failed","interrupted","timeout","launch-failed","log-limit","log-write-failed"]);
const setupSteps=["checkout","node","rust","npm","cargo","browsers","candidate"];

function githubArtifactBinding(repository,run,artifact,source,{profile,shard,hosted},failed=false){
 assert.equal(hosted.repository.toLowerCase(),repository.toLowerCase(),"Hosted receipt belongs to a different repository");
 verifyGitHubRunSource(repository,run,source);
 assert.equal(String(run.id),hosted.runId,"GitHub run ID differs from the hosted receipt");
 assert.equal(String(run.run_attempt),hosted.runAttempt,"GitHub run attempt differs from the hosted receipt");
 const conclusion=failed?failureConclusions.has(run.conclusion):run.conclusion==="success";
 assert.ok(conclusion&&run.status==="completed"&&run.event==="workflow_dispatch"&&run.path===workflowPath,
  failed?"GitHub run attempt did not record a candidate workflow failure":"GitHub run attempt did not succeed in the candidate workflow");
 const name=`candidate-${source.commit}-${profile}${shard?`-${shard}`:""}-${hosted.runAttempt}`;
 verifyGitHubArtifactMetadata(repository,run,artifact,name);
}

export async function verifyHostedCandidateArtifact(root,{repository,artifactMetadata,runMetadata,archive,manifest}){
 assert.match(repository,githubRepositoryName,"Specify the expected GitHub repository as owner/name");
 const result=resolve(manifest),runDirectory=basename(dirname(result));
 assert.equal(basename(result),"result.json","Expected the candidate result.json name");
 assert.match(runDirectory,/^run-[a-z0-9]+$/i,"Expected the generated run directory for the archived manifest");
 const artifact=readGitHubMetadata(artifactMetadata),run=readGitHubMetadata(runMetadata);
 const coverage=candidateCoverage(root,[result],{requireHosted:true});
 const [evidence]=coverage.evidence;
 githubArtifactBinding(repository,run,artifact,coverage.source,evidence);
 const {verifyEntry,verifyUnchanged}=await verifiedGitHubArchive(archive,artifact);
 verifyEntry("runner-context.tsv",evidence.hosted.contextSha256,8192);
 const receipt=JSON.parse(verifyEntry(`${runDirectory}/result.json`,evidence.sha256,32*1024*1024));
 const profilePlan=candidateReleasePlan({profile:evidence.profile,environment:{},richBrowserDiscovery:usesRichBrowserDiscovery(root)});
 const plan=evidence.shard?candidateShardPlan(profilePlan,evidence.shard):profilePlan;
 // candidateCoverage already checked these records against the same plan and the extracted bytes.
 for(const [index,check] of plan.checks.entries()){
  const stage=receipt.stages[index],log=`${String(index+1).padStart(2,"0")}-${check.id}.log`;
  verifyEntry(`${runDirectory}/${log}`,stage.log.sha256,Math.max(1,stage.log.bytes));
  for(const [artifactIndex,artifact] of check.artifacts.entries()){
   if(!artifact.retain)continue;
   const record=stage.artifacts[artifactIndex],entry=`${runDirectory}/artifacts/${check.id}/${artifact.path}`;
   verifyEntry(entry,record.sha256,Math.max(1,record.bytes));
  }
 }
 await verifyUnchanged();
 return {...coverage,githubArtifact:{id:artifact.id,name:artifact.name,digest:artifact.digest}};
}

function failedManifest(directory,path,verifyEntry,source,context,plan){
 const record=fileEvidence(directory,path);
 const bytes=verifyEntry(path,record.sha256,32*1024*1024);
 const receipt=JSON.parse(bytes),runDirectory=dirname(path);
 assert.equal(receipt.format,"breditor/candidate-qualification");
 assert.equal(receipt.formatVersion,1);
 assert.ok(incompleteStages.has(receipt.status)&&receipt.selectedChecksPassed!==true,"Expected an incomplete candidate result");
 assert.equal(receipt.profile,plan.profile);
 assert.deepEqual(receipt.shard,plan.shard);
 if(receipt.hostedRun!==undefined)assert.deepEqual(receipt.hostedRun,{runId:context.runId,runAttempt:context.runAttempt});
 assert.ok(Array.isArray(receipt.stages),"Expected failed candidate stage records");
 if(receipt.source!==null||receipt.stages.length)assert.deepEqual(receipt.source,source,"Failed result belongs to another candidate");
 assert.deepEqual(receipt.stages.map(stage=>stage.id),plan.checks.slice(0,receipt.stages.length).map(check=>check.id),
  "Failed result differs from the selected plan prefix");
 const logs=[];
 for(const [index,stage] of receipt.stages.entries()){
  if(!stage.log)continue;
  const log=`${runDirectory}/${String(index+1).padStart(2,"0")}-${stage.id}.log`;
  const expected=fileEvidence(directory,log);
  assert.equal(expected.bytes,stage.log.bytes,`Retained log length differs for ${stage.id}`);
  assert.equal(expected.sha256,stage.log.sha256,`Retained log hash differs for ${stage.id}`);
  verifyEntry(log,expected.sha256,Math.max(1,expected.bytes));
  logs.push({path:log,sha256:expected.sha256});
 }
 const last=receipt.stages.at(-1);
 return {path,sha256:record.sha256,status:receipt.status,logs,
  ...(last?{lastStage:{id:last.id,status:last.status,exitCode:last.exitCode,signal:last.signal}}:{})};
}

export async function verifyFailedHostedCandidateArtifact(root,{repository,artifactMetadata,runMetadata,archive,extracted}){
 assert.match(repository,githubRepositoryName,"Specify the expected GitHub repository as owner/name");
 const source=sourceEvidence(root);
 assert.ok(source.commit&&!source.dirty,"Check out one clean candidate before reviewing its failure evidence");
 const directory=resolve(extracted),{context,sha256:contextSha256}=readHostedRunnerContext(directory);
 assert.equal(context.revision,source.commit,"Failed hosted context belongs to another candidate");
 const failureStep=setupSteps.find(step=>["failure","cancelled"].includes(context[step]));
 assert.ok(failureStep&&context.candidate!=="success","Hosted context did not record a qualification failure");
 const {profile}=context,shard=context.shard==="none"?undefined:context.shard;
 const profilePlan=candidateReleasePlan({profile,environment:{}});
 const plan=shard?candidateShardPlan(profilePlan,shard):profilePlan;
 const artifact=readGitHubMetadata(artifactMetadata),run=readGitHubMetadata(runMetadata),hosted={
  repository:context.repository,workflow:context.workflow,runId:context.runId,runAttempt:context.runAttempt,contextSha256,
 };
 githubArtifactBinding(repository,run,artifact,source,{profile,shard,hosted},true);
 const {entries,verifyEntry,verifyUnchanged}=await verifiedGitHubArchive(archive,artifact);
 verifyEntry("runner-context.tsv",contextSha256,8192);
 const manifests=[...entries.keys()].filter(path=>/^run-[a-z0-9]+\/result\.json$/iu.test(path));
 assert.ok(manifests.length<=1,"Hosted failure archive must identify one candidate result");
 const result=manifests.length?failedManifest(directory,manifests[0],verifyEntry,source,context,plan):undefined;
 await verifyUnchanged();
 assert.deepEqual(sourceEvidence(root),source,"Candidate source changed during hosted failure review");
 return {format:"breditor/hosted-candidate-failure",formatVersion:1,source,profile,shard,hosted,
  conclusion:run.conclusion,failureStep,result,githubArtifact:{id:artifact.id,name:artifact.name,digest:artifact.digest}};
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),failed=args[0]==="--failed";
 if(failed)args.shift();
 try{
  assert.equal(args.length,5,"Usage: node scripts/check-hosted-candidate-artifact.mjs [--failed] <owner/repo> <artifact.json> <run-attempt.json> <artifact.zip> <result.json or extracted-dir>");
  const [repository,artifactMetadata,runMetadata,archive,input]=args,options={repository,artifactMetadata,runMetadata,archive};
  const report=failed?await verifyFailedHostedCandidateArtifact(candidateRoot,{...options,extracted:input}):
   await verifyHostedCandidateArtifact(candidateRoot,{...options,manifest:input});
  console.log(JSON.stringify(report,null,2));
 }catch(error){
  console.error(`check-hosted-candidate-artifact: ${error.message}`);
  process.exitCode=2;
 }
}
