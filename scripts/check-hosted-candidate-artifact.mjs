/** Check one hosted candidate against separately obtained GitHub API records. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createReadStream,lstatSync,readFileSync,realpathSync} from "node:fs";
import {basename,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateCoverage} from "./check-candidate-coverage.mjs";
import {repository as candidateRoot} from "./candidate-release/plan.mjs";

const workflowPath=".github/workflows/candidate-qualification.yml";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const repositoryName=/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;
const githubId=value=>Number.isSafeInteger(value)&&value>0;

function readMetadata(path){
 const stat=lstatSync(path);
 assert.ok(stat.isFile()&&stat.size<=1024*1024,"Expected a bounded GitHub API JSON file");
 return JSON.parse(readFileSync(path));
}

async function archiveDigest(path){
 const hash=createHash("sha256");
 for await(const chunk of createReadStream(path))hash.update(chunk);
 return "sha256:"+hash.digest("hex");
}

function githubArtifactBinding(repository,run,artifact,source,{profile,shard,hosted}){
 const owner=repository.toLowerCase();
 assert.equal(hosted.repository.toLowerCase(),owner,"Hosted receipt belongs to a different repository");
 assert.equal(run.repository?.full_name?.toLowerCase(),owner,"GitHub run belongs to a different repository");
 assert.ok(githubId(run.repository.id));
 assert.equal(run.head_repository?.id,run.repository.id,"GitHub run checked out a different repository");
 assert.ok(githubId(run.id)&&githubId(run.run_attempt),"Missing GitHub run identity");
 assert.equal(String(run.id),hosted.runId,"GitHub run ID differs from the hosted receipt");
 assert.equal(String(run.run_attempt),hosted.runAttempt,"GitHub run attempt differs from the hosted receipt");
 assert.deepEqual([run.status,run.conclusion,run.event,run.path],
  ["completed","success","workflow_dispatch",workflowPath],"GitHub run attempt did not succeed in the candidate workflow");
 assert.equal(run.head_sha,source.commit,"GitHub run revision differs from the candidate");

 assert.ok(githubId(artifact.id)&&artifact.expired===false,"Missing or expired GitHub artifact");
 const endpoint=`https://api.github.com/repos/${owner}/actions/artifacts/${artifact.id}`;
 assert.equal(artifact.url?.toLowerCase(),endpoint,"GitHub artifact belongs to a different repository");
 assert.equal(artifact.workflow_run?.id,run.id,"GitHub artifact belongs to a different run");
 assert.equal(artifact.workflow_run.repository_id,run.repository.id,"GitHub artifact names a different run repository");
 assert.equal(artifact.workflow_run.head_repository_id,run.head_repository.id,"GitHub artifact names a different source repository");
 assert.equal(artifact.workflow_run.head_sha,source.commit,"GitHub artifact names a different revision");
 const name=`candidate-${source.commit}-${profile}${shard?`-${shard}`:""}-${hosted.runAttempt}`;
 assert.equal(artifact.name,name,"GitHub artifact name differs from the selected candidate attempt");
 assert.match(artifact.digest,/^sha256:[a-f0-9]{64}$/u,"Missing GitHub artifact ZIP digest");
}

export async function verifyHostedCandidateArtifact(root,{repository,artifactMetadata,runMetadata,archive,manifest}){
 assert.match(repository,repositoryName,"Specify the expected GitHub repository as owner/name");
 const result=resolve(manifest),runDirectory=basename(dirname(result));
 assert.equal(basename(result),"result.json","Expected the candidate result.json name");
 assert.match(runDirectory,/^run-[a-z0-9]+$/i,"Expected the generated run directory for the archived manifest");
 const artifact=readMetadata(artifactMetadata),run=readMetadata(runMetadata);
 const coverage=candidateCoverage(root,[result],{requireHosted:true});
 const [evidence]=coverage.evidence;
 githubArtifactBinding(repository,run,artifact,coverage.source,evidence);

 const path=resolve(archive),stat=lstatSync(path);
 assert.ok(stat.isFile()&&stat.size>0&&stat.size===artifact.size_in_bytes,"Downloaded ZIP size differs from GitHub artifact metadata");
 assert.equal(await archiveDigest(path),artifact.digest,"Downloaded ZIP digest differs from GitHub artifact metadata");
 const entries=execFileSync("unzip",["-Z1",path],{encoding:"utf8",maxBuffer:1024*1024}).split("\n");
 const resultEntry=`${runDirectory}/result.json`;
 for(const [entry,expected,limit] of [
  ["runner-context.tsv",evidence.hosted.contextSha256,8192],
  [resultEntry,evidence.sha256,32*1024*1024],
 ]){
  assert.equal(entries.filter(item=>item===entry).length,1,`ZIP must contain exactly one ${entry}`);
  const bytes=execFileSync("unzip",["-p",path,entry],{maxBuffer:limit});
  assert.ok(sha256(bytes)===expected,`Downloaded ZIP and selected checkout evidence differ for ${entry}`);
 }
 assert.equal(await archiveDigest(path),artifact.digest,"Downloaded ZIP changed during verification");
 return {...coverage,githubArtifact:{id:artifact.id,name:artifact.name,digest:artifact.digest}};
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 try{
  assert.equal(args.length,5,"Usage: node scripts/check-hosted-candidate-artifact.mjs <owner/repo> <artifact.json> <run-attempt.json> <artifact.zip> <result.json>");
  const [repository,artifactMetadata,runMetadata,archive,manifest]=args;
  const report=await verifyHostedCandidateArtifact(candidateRoot,{repository,artifactMetadata,runMetadata,archive,manifest});
  console.log(JSON.stringify(report,null,2));
 }catch(error){
  console.error(`check-hosted-candidate-artifact: ${error.message}`);
  process.exitCode=2;
 }
}
