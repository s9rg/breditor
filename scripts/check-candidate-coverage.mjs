/** Review retained qualification manifests against one clean candidate checkout. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,realpathSync} from "node:fs";
import {basename,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateReleasePlan,repository} from "./candidate-release/plan.mjs";
import {candidateShardPlan} from "./candidate-release/shards.mjs";
import {fileEvidence,sourceEvidence} from "./candidate-release/evidence.mjs";
import {verifyHostedContext} from "./candidate-release/hosted-context.mjs";
import {candidateStageReceipts} from "./candidate-release/runtime-stage-policy.mjs";
import {verifyDirectStageEvidence} from "./candidate-release/direct-stage-evidence.mjs";
import {
 sharedRuntimeBuildFormat,sharedRuntimeBuildReport,sharedRuntimeReceiptVariable,
} from "./fixtures/native-runtime/shared-runtime-receipt.mjs";

function requireRetainedBytes(directory,path,record) {
 const retained=fileEvidence(directory,path);
 assert.equal(retained.bytes,record.bytes,`Retained file length changed for ${path}`);
 assert.equal(retained.sha256,record.sha256,`Retained file digest changed for ${path}`);
}

function verifyRuntimeProducer(directory,stage,source){
 const receipt=stage.artifacts.find(artifact=>artifact.path===sharedRuntimeBuildReport);
 assert.ok(receipt?.retainedPath,"Missing retained paired shared-runtime build receipt");
 const bytes=readFileSync(resolve(directory,receipt.retainedPath));
 assert.equal(createHash("sha256").update(bytes).digest("hex"),receipt.sha256,"Shared-runtime receipt changed during coverage review");
 const report=JSON.parse(bytes);
 assert.equal(report.format,sharedRuntimeBuildFormat);
 assert.equal(report.version,1);
 assert.deepEqual(report.source,source,"Paired shared-runtime receipt belongs to another candidate");
 return receipt.sha256;
}

export function candidateCoverage(root,manifests,{requireHosted=false}={}) {
 assert.ok(manifests.length,"Supply at least one retained qualification result.json");
 const source=sourceEvidence(root);
 assert.ok(source.commit&&!source.dirty,"Check out one clean candidate before reviewing its evidence");
 const full=candidateReleasePlan({environment:{}}),covered=new Set(),evidence=[];
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
  assert.ok(receipt.activationQualification===undefined,
   "Candidate coverage requires directly executed stages. Review adopted workers with qualify-activation-shard verify");
  const plan=receipt.shard?candidateShardPlan(full,receipt.shard.id):candidateReleasePlan({profile:receipt.profile,environment:{}});
  assert.equal(receipt.profile,plan.profile);
  assert.deepEqual(receipt.shard,plan.shard);
  assert.deepEqual(receipt.stages.map(stage=>stage.id),plan.checks.map(check=>check.id),
   `Stage sequence differs from the candidate plan in ${input}`);
  let sharedRuntimeSha256,recordedCheckout;
  for(const [index,check] of plan.checks.entries()){
   const stage=receipt.stages[index], log=`${String(index+1).padStart(2,"0")}-${check.id}.log`;
   assert.equal(stage.status,"passed",`Stage did not pass in ${input}: ${check.id}`);
   assert.ok(stage.execution===undefined,`Candidate coverage requires direct execution for ${check.id}`);
   const checkout=verifyDirectStageEvidence(check,stage,{log,platform:receipt.environment?.platform,repository,requireHosted});
   assert.ok(recordedCheckout===undefined||recordedCheckout===checkout,`Recorded checkout differs for ${check.id}`);
   recordedCheckout=checkout;
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
   if(check.id==="paired-shared-runtime")sharedRuntimeSha256=verifyRuntimeProducer(directory,stage,source);
   if(candidateStageReceipts(check).sharedRuntime){
    assert.ok(sharedRuntimeSha256,`No preceding paired shared-runtime receipt for ${check.id}`);
    assert.equal(stage.sharedRuntimeReceiptSha256,sharedRuntimeSha256,`Shared-runtime receipt differs for ${check.id}`);
    assert.equal(stage.env?.[sharedRuntimeReceiptVariable],sharedRuntimeSha256,`Shared-runtime execution input differs for ${check.id}`);
   }
   covered.add(check.id);
  }
  const hosted=requireHosted?{hosted:verifyHostedContext(directory,receipt,plan)}:{};
  evidence.push({path:input,profile:receipt.profile,shard:receipt.shard?.id,environment:receipt.environment,sha256:record.sha256,...hosted});
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
  console.log("Usage: node scripts/check-candidate-coverage.mjs [--require-complete] [--require-hosted] <result.json>...");
 }else{
  try{
   const flags=args.filter(arg=>arg.startsWith("--"));
   assert.ok(new Set(flags).size===flags.length&&flags.every((flag,index)=>
    flag===args[index]&&["--require-complete","--require-hosted"].includes(flag)),"Unknown or repeated argument");
   const report=candidateCoverage(repository,args.slice(flags.length),{requireHosted:flags.includes("--require-hosted")});
   console.log(JSON.stringify(report,null,2));
   if(flags.includes("--require-complete")&&!report.complete)process.exitCode=1;
  }catch(error){
   console.error(`check-candidate-coverage: ${error.message}`);
   process.exitCode=2;
  }
 }
}
