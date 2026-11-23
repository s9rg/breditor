/** Current rich/shared candidate qualification with durable local evidence. Never publishes. */
import {mkdirSync,mkdtempSync,realpathSync} from "node:fs";
import {resolve,relative} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateCheckProfiles,candidateReleasePlan,repository} from "./candidate-release/plan.mjs";
import {fileEvidence,sourceEvidence,saveEvidence,retainStageArtifact} from "./candidate-release/evidence.mjs";
import {candidateShardPlan,candidateShardIds} from "./candidate-release/shards.mjs";
import {executeCandidateStage} from "./candidate-release/process.mjs";
import {retainCandidateActivationEvidence} from "./candidate-release/activation-evidence.mjs";
import {activationRuntimeStageIds} from "./candidate-release/activation-shards.mjs";
import {sharedRuntimeForActivation} from "./candidate-release/shared-runtime-evidence.mjs";
import {metadataFixtureStageIds} from "./candidate-release/metadata-fixture-evidence.mjs";
import {verifyNativeSuggestionBuild} from "./candidate-release/native-suggestion-build-evidence.mjs";

export async function runCandidateChecks(plan,{root=repository,signal,report=console.log,execute=executeCandidateStage,snapshot=sourceEvidence,activationEvidence}={}){
 if(!candidateCheckProfiles.includes(plan.profile)||!Array.isArray(plan.checks)||!plan.checks.length||new Set(plan.checks.map(check=>check.id)).size!==plan.checks.length||plan.checks.some(check=>!/^[a-z][a-z0-9-]*$/.test(check.id)||typeof check.command!=="string"||!check.command||!Array.isArray(check.args)||check.args.some(arg=>typeof arg!=="string")||!Array.isArray(check.artifacts)||!Number.isSafeInteger(check.timeoutMs)||check.timeoutMs<=0))throw Error("Invalid candidate check plan");
 const parent=resolve(root,"target/v1-candidate-runs");mkdirSync(parent,{recursive:true});const directory=mkdtempSync(resolve(parent,"run-")),manifest=resolve(directory,"result.json");let source;
 const result={format:"breditor/candidate-qualification",formatVersion:1,profile:plan.profile,...(plan.shard?{shard:plan.shard}:{}),status:"running",v1Ready:false,publicationApproved:false,source:null,environment:{node:process.version,platform:process.platform,arch:process.arch},startedAt:new Date().toISOString(),deferred:plan.deferred,stages:[]};
 const checkSource=()=>{const current=snapshot(root);if(current.sha256!==source.sha256||current.commit!==source.commit)throw Error("Source changed during qualification; rerun against one fixed candidate");};
 saveEvidence(manifest,result);report(`verify-candidate: ${plan.shard?.id??plan.profile}; evidence ${manifest}`);
 try{
  source=snapshot(root);result.source=source;
  const activation=activationEvidence&&retainCandidateActivationEvidence(root,directory,plan,activationEvidence);
  if(activation)result.activationQualification=activation.qualification;
  saveEvidence(manifest,result);
  for(const [index,check] of plan.checks.entries()){
   checkSource();if(signal?.aborted){result.status="interrupted";break;}
   const logPath=resolve(directory,`${String(index+1).padStart(2,"0")}-${check.id}.log`),entry={id:check.id,status:"running",startedAt:new Date().toISOString(),command:check.command,args:check.args,env:check.env,logPath};result.stages.push(entry);saveEvidence(manifest,result);report(`verify-candidate: [${index+1}/${plan.checks.length}] ${check.id}`);
   const retained=activation?.entry(check);
   if(retained)Object.assign(entry,retained);
   else{
    let execution=check;
    const nativeFixture=activationRuntimeStageIds.includes(check.id)||metadataFixtureStageIds.includes(check.id);
    const runtime=nativeFixture||check.requiresSharedRuntime===true?sharedRuntimeForActivation(root,source):undefined;
    if(runtime){
     if(nativeFixture)entry.nativeHostBuildReceiptSha256=verifyNativeSuggestionBuild(root,source).sha256;
     entry.sharedRuntimeReceiptSha256=runtime.sha256;
     entry.env={...check.env,...runtime.environment};
     execution={...check,env:entry.env};
     saveEvidence(manifest,result);
    }
    const outcome=await execute(execution,{root,logPath,signal});Object.assign(entry,outcome);
    entry.log=fileEvidence(root,relative(root,logPath));
    if(entry.status==="passed"&&runtime){
     if(sharedRuntimeForActivation(root,source).sha256!==runtime.sha256)throw Error("Shared runtime build receipt changed during qualification");
     if(nativeFixture&&verifyNativeSuggestionBuild(root,source).sha256!==entry.nativeHostBuildReceiptSha256)throw Error("Native host build receipt changed during qualification");
    }
    if(entry.status==="passed")entry.artifacts=check.artifacts.map(artifact=>{const evidence=fileEvidence(root,artifact.path);if(artifact.fresh&&evidence.modifiedAtMs<Date.parse(entry.startedAt))throw Error(`Stale stage report: ${artifact.path}`);return artifact.retain===true?retainStageArtifact(root,directory,check.id,evidence):evidence;});
   }
   checkSource();
   saveEvidence(manifest,result);report(`verify-candidate: ${entry.status} ${check.id}`);
   if(entry.status!=="passed"){result.status=entry.status;break;}
  }
  if(result.status==="running"){checkSource();result.status=result.stages.length===plan.checks.length?"passed":"interrupted";}
 }catch(error){
  result.status="failed";result.error=String(error);
  const current=result.stages.at(-1);
  if(current?.status==="running"||current?.status==="passed"){current.status="failed";current.error=result.error;}
  const reason=result.error.replace(/[\r\n]+/g," ").slice(0,512);
  report(`verify-candidate: ${current?.id??"setup"}: ${reason}`);
 }
 finally{result.finishedAt=new Date().toISOString();result.selectedChecksPassed=result.status==="passed";saveEvidence(manifest,result);}
 report(`verify-candidate: ${result.status}; ${result.stages.filter(row=>row.status==="passed").length}/${plan.checks.length} selected checks passed; V1 release approval remains separate.`);
 return {exitCode:result.status==="passed"?0:result.status==="interrupted"?130:1,manifest,result};
}
export async function main(args){
 if(args.length===1&&args[0]==="--help"){console.log(`Usage: node scripts/verify-candidate.mjs [${candidateCheckProfiles.filter(profile=>profile!=="full").map(profile=>"--"+profile).join(" | ")}] [--dry-run] [--shard <name>] [--activation-evidence <inputs> <reports>]\nDefault full includes the browser matrices and fail-closed reviewed readiness gate. --functional checks current Rust/rich/shared/interchange/review packages only; it is not V1 readiness. Focused profiles run individual matrices or build the retained dependency inventories. For a bounded part of the full profile, choose a shard: ${candidateShardIds.join(", ")}. Evidence and failure logs stay under target/v1-candidate-runs. Never pushes, tags, publishes or deploys.`);return 0;}
 const flags=[...args],activationIndex=flags.indexOf("--activation-evidence");
 let activationEvidence;
 if(activationIndex!==-1){
  const [,inputs,reports]=flags.splice(activationIndex,3);
  if(!inputs||!reports||inputs.startsWith("--")||reports.startsWith("--")){
   console.error("verify-candidate: --activation-evidence requires input and report directories");return 2;
  }
  activationEvidence={inputs,reports,inputSha256:process.env.BREDITOR_ACTIVATION_INPUT_SHA256};
 }
 const shardIndex=flags.indexOf("--shard");
 let shard;
 if(shardIndex!==-1){
  [,shard]=flags.splice(shardIndex,2);
  if(!candidateShardIds.includes(shard)){
   console.error("verify-candidate: choose a known shard; use --help");return 2;
  }
 }
 const profileFlags=flags.filter(flag=>flag!=="--dry-run");
 const profile=profileFlags[0]?.slice(2)??"full";
 const validProfile=!profileFlags.length||(profileFlags.length===1&&profile!=="full"&&profileFlags[0]===`--${profile}`&&candidateCheckProfiles.includes(profile));
 if(!validProfile||new Set(flags).size!==flags.length){console.error("verify-candidate: unknown or repeated argument; use --help");return 2;}
 if(activationEvidence&&!["full","functional"].includes(profile)){
  console.error("verify-candidate: activation evidence requires the full or functional profile");return 2;
 }
 if(shard&&(profile!=="full"||activationEvidence)){
  console.error("verify-candidate: a shard requires the full profile without activation evidence");return 2;
 }
 const profilePlan=candidateReleasePlan({profile});
 const plan=shard?candidateShardPlan(profilePlan,shard):profilePlan;
 if(flags.includes("--dry-run")){console.log(JSON.stringify({executed:false,...plan,activationEvidence},null,2));return 0;}
 const controller=new AbortController(),interrupt=()=>controller.abort();process.once("SIGINT",interrupt);process.once("SIGTERM",interrupt);
 try{return (await runCandidateChecks(plan,{signal:controller.signal,activationEvidence})).exitCode;}
 finally{process.removeListener("SIGINT",interrupt);process.removeListener("SIGTERM",interrupt);}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main(process.argv.slice(2));
