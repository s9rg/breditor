/** Aggregate engineering coverage from individually authenticated GitHub archives. */
import assert from "node:assert/strict";
import {lstatSync,readFileSync,realpathSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {sourceEvidence} from "./candidate-release/evidence.mjs";
import {repository as candidateRoot} from "./candidate-release/plan.mjs";
import {verifyHostedCandidateArtifact} from "./check-hosted-candidate-artifact.mjs";

const inputFields=["artifactMetadata","runMetadata","archive","manifest"];

function artifactInputs(path){
 const file=resolve(path),directory=dirname(file),stat=lstatSync(file);
 assert.ok(stat.isFile()&&stat.size<=1024*1024,"Expected a bounded hosted artifact list");
 const inputs=JSON.parse(readFileSync(file,"utf8"));
 assert.ok(Array.isArray(inputs)&&inputs.length,"Supply at least one hosted candidate archive");
 return inputs.map(item=>{
  assert.ok(item&&inputFields.every(field=>typeof item[field]==="string"&&item[field]),"Missing hosted artifact input path");
  return Object.fromEntries(inputFields.map(field=>[field,resolve(directory,item[field])]));
 });
}

export async function verifyHostedCandidateCoverage(root,repository,inputs){
 assert.ok(Array.isArray(inputs)&&inputs.length,"Supply at least one hosted candidate archive");
 const evidence=[],artifacts=new Set();
 let source,requiredStages,missing;
 for(const input of inputs){
  const proof=await verifyHostedCandidateArtifact(root,{...input,repository});
  const {githubArtifact}=proof;
  assert.ok(!artifacts.has(githubArtifact.id),"The hosted archive list contains the same artifact more than once");
  artifacts.add(githubArtifact.id);
  if(!source){
   source=proof.source;
   requiredStages=proof.requiredStages;
   missing=proof.missing;
  }else{
   assert.deepEqual(proof.source,source,"Hosted artifacts belong to different candidates");
   assert.equal(proof.requiredStages,requiredStages,"Hosted artifacts use a different stage plan");
   const uncovered=new Set(proof.missing);
   missing=missing.filter(id=>uncovered.has(id));
  }
  evidence.push({...proof.evidence[0],githubArtifact});
 }
 assert.deepEqual(sourceEvidence(root),source,"Candidate source changed during hosted coverage review");
 return {format:"breditor/hosted-candidate-coverage",formatVersion:1,source,evidence,requiredStages,
  coveredStages:requiredStages-missing.length,missing,complete:missing.length===0};
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),requireComplete=args[0]==="--require-complete";
 try{
  const [repository,path,...extra]=requireComplete?args.slice(1):args;
  assert.ok(repository&&path&&!extra.length,"Usage: node scripts/check-hosted-candidate-coverage.mjs [--require-complete] <owner/repo> <artifacts.json>");
  const report=await verifyHostedCandidateCoverage(candidateRoot,repository,artifactInputs(path));
  console.log(JSON.stringify(report,null,2));
  if(requireComplete&&!report.complete)process.exitCode=1;
 }catch(error){
  console.error(`check-hosted-candidate-coverage: ${error.message}`);
  process.exitCode=2;
 }
}
