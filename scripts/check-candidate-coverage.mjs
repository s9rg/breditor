/** Review retained qualification manifests against one clean candidate checkout. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,realpathSync} from "node:fs";
import {basename,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateReleasePlan,repository} from "./candidate-release/plan.mjs";
import {candidateShardPlan} from "./candidate-release/shards.mjs";
import {fileEvidence,sourceEvidence} from "./candidate-release/evidence.mjs";

function requireRetainedBytes(directory,path,record) {
 const retained=fileEvidence(directory,path);
 assert.equal(retained.bytes,record.bytes,`Retained file length changed for ${path}`);
 assert.equal(retained.sha256,record.sha256,`Retained file digest changed for ${path}`);
}

export function candidateCoverage(root,manifests) {
 assert.ok(manifests.length,"Supply at least one retained qualification result.json");
 const source=sourceEvidence(root);
 assert.ok(source.commit&&!source.dirty,"Check out one clean candidate before reviewing its evidence");
 const full=candidateReleasePlan(),covered=new Set(),evidence=[];
 for(const input of manifests){
  const path=resolve(input),directory=dirname(path);
  const record=fileEvidence(directory,basename(path));
  const bytes=readFileSync(path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),record.sha256,`Manifest changed while reading ${input}`);
  const receipt=JSON.parse(bytes);
  assert.equal(receipt.format,"breditor/candidate-qualification");
  assert.equal(receipt.formatVersion,1);
  assert.deepEqual(receipt.source,source,`Source mismatch in ${input}`);
  assert.equal(receipt.status,"passed",`Qualification did not pass in ${input}`);
  assert.equal(receipt.selectedChecksPassed,true,`Missing completed-stage result in ${input}`);
  const plan=receipt.shard?candidateShardPlan(full,receipt.shard.id):candidateReleasePlan({profile:receipt.profile});
  assert.equal(receipt.profile,plan.profile);
  assert.deepEqual(receipt.shard,plan.shard);
  assert.deepEqual(receipt.stages.map(stage=>stage.id),plan.checks.map(check=>check.id),
   `Stage sequence differs from the candidate plan in ${input}`);
  for(const [index,check] of plan.checks.entries()){
   const stage=receipt.stages[index], log=`${String(index+1).padStart(2,"0")}-${check.id}.log`;
   assert.equal(stage.status,"passed",`Stage did not pass in ${input}: ${check.id}`);
   assert.equal(basename(stage.log.path),log);
   requireRetainedBytes(directory,log,stage.log);
   assert.deepEqual(stage.artifacts.map(artifact=>artifact.path),check.artifacts.map(artifact=>artifact.path));
   for(const [artifactIndex,artifact] of check.artifacts.entries()){
    const observed=stage.artifacts[artifactIndex];
    assert.match(observed.sha256,/^[a-f0-9]{64}$/u);
    assert.ok(Number.isSafeInteger(observed.bytes)&&observed.bytes>=0);
    if(!artifact.retain)continue;
    const retained=`artifacts/${check.id}/${artifact.path}`;
    assert.equal(observed.retainedPath,retained);
    requireRetainedBytes(directory,retained,observed);
   }
   covered.add(check.id);
  }
  evidence.push({path:input,profile:receipt.profile,shard:receipt.shard?.id,environment:receipt.environment,sha256:record.sha256});
 }
 assert.deepEqual(sourceEvidence(root),source,"Candidate source changed during evidence review");
 const required=full.checks.filter(check=>check.id!=="reviewed-v1-readiness").map(check=>check.id);
 const missing=required.filter(id=>!covered.has(id));
 return {format:"breditor/candidate-coverage",formatVersion:1,source,evidence,
  requiredStages:required.length,coveredStages:required.length-missing.length,missing,complete:missing.length===0};
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==="--help"){
  console.log("Usage: node scripts/check-candidate-coverage.mjs [--require-complete] <result.json>...");
 }else{
  try{
   const required=args[0]==="--require-complete",inputs=required?args.slice(1):args;
   assert.ok(inputs.every(path=>!path.startsWith("--")),"Unknown argument");
   const report=candidateCoverage(repository,inputs);
   console.log(JSON.stringify(report,null,2));
   if(required&&!report.complete)process.exitCode=1;
  }catch(error){
   console.error(`check-candidate-coverage: ${error.message}`);
   process.exitCode=2;
  }
 }
}
