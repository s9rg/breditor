/** Bind a downloaded evidence archive to authenticated GitHub API records. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createReadStream,lstatSync,readFileSync} from "node:fs";
import {resolve} from "node:path";

const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
export const githubRepositoryName=/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;
const githubId=value=>Number.isSafeInteger(value)&&value>0;

export function readGitHubMetadata(path){
 const stat=lstatSync(path);
 assert.ok(stat.isFile()&&stat.size<=1024*1024,"Expected a bounded GitHub API JSON file");
 return JSON.parse(readFileSync(path));
}

export function verifyGitHubRunSource(repository,run,source){
 const owner=repository.toLowerCase();
 assert.equal(run.repository?.full_name?.toLowerCase(),owner,"GitHub run belongs to a different repository");
 assert.ok(githubId(run.repository.id));
 assert.equal(run.head_repository?.id,run.repository.id,"GitHub run checked out a different repository");
 assert.ok(githubId(run.id)&&githubId(run.run_attempt),"Missing GitHub run identity");
 assert.equal(run.head_sha,source.commit,"GitHub run revision differs from the candidate");
}

export function verifyGitHubArtifactMetadata(repository,run,artifact,name){
 assert.ok(githubId(artifact.id)&&artifact.expired===false,"Missing or expired GitHub artifact");
 const endpoint=`https://api.github.com/repos/${repository.toLowerCase()}/actions/artifacts/${artifact.id}`;
 assert.equal(artifact.url?.toLowerCase(),endpoint,"GitHub artifact belongs to a different repository");
 assert.equal(artifact.workflow_run?.id,run.id,"GitHub artifact belongs to a different run");
 assert.equal(artifact.workflow_run.repository_id,run.repository.id,"GitHub artifact names a different run repository");
 assert.equal(artifact.workflow_run.head_repository_id,run.head_repository.id,"GitHub artifact names a different source repository");
 assert.equal(artifact.workflow_run.head_sha,run.head_sha,"GitHub artifact names a different revision");
 assert.equal(artifact.name,name,"GitHub artifact name differs from the selected candidate attempt");
 assert.match(artifact.digest,/^sha256:[a-f0-9]{64}$/u,"Missing GitHub artifact ZIP digest");
}

async function archiveDigest(path){
 const hash=createHash("sha256");
 for await(const chunk of createReadStream(path))hash.update(chunk);
 return "sha256:"+hash.digest("hex");
}

export async function verifiedGitHubArchive(archive,artifact){
 const path=resolve(archive),stat=lstatSync(path);
 assert.ok(stat.isFile()&&stat.size>0&&stat.size===artifact.size_in_bytes,
  "Downloaded ZIP size differs from GitHub artifact metadata");
 assert.equal(await archiveDigest(path),artifact.digest,"Downloaded ZIP digest differs from GitHub artifact metadata");
 const entries=new Map();
 for(const entry of execFileSync("unzip",["-Z1",path],{encoding:"utf8",maxBuffer:1024*1024}).split("\n")){
  entries.set(entry,(entries.get(entry)??0)+1);
 }
 const readEntry=(entry,limit)=>{
  // unzip interprets its member argument as a pattern. Planned evidence paths are literal.
  assert.match(entry,/^[a-z0-9_.+/\-]+$/iu,"Expected a literal candidate archive member path");
  assert.equal(entries.get(entry),1,`ZIP must contain exactly one ${entry}`);
  return execFileSync("unzip",["-p",path,entry],{maxBuffer:limit});
 };
 const verifyEntry=(entry,expected,limit)=>{
  const bytes=readEntry(entry,limit);
  assert.ok(sha256(bytes)===expected,`Downloaded ZIP and selected checkout evidence differ for ${entry}`);
  return bytes;
 };
 const verifyUnchanged=async()=>assert.equal(await archiveDigest(path),artifact.digest,"Downloaded ZIP changed during verification");
 return {entries,readEntry,verifyEntry,verifyUnchanged};
}
