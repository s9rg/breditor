/** Current rich/shared candidate qualification with durable local evidence. Never publishes. */
import {mkdirSync,mkdtempSync,realpathSync} from "node:fs";
import {resolve,relative} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateReleasePlan,repository} from "./candidate-release/plan.mjs";
import {fileEvidence,sourceEvidence,saveEvidence} from "./candidate-release/evidence.mjs";
import {executeCandidateStage} from "./candidate-release/process.mjs";

export async function runCandidateChecks(plan,{root=repository,signal,report=console.log,execute=executeCandidateStage,snapshot=sourceEvidence}={}){
 if(!["full","functional"].includes(plan.profile)||!Array.isArray(plan.checks)||!plan.checks.length||new Set(plan.checks.map(check=>check.id)).size!==plan.checks.length||plan.checks.some(check=>!/^[a-z][a-z0-9-]*$/.test(check.id)||typeof check.command!=="string"||!check.command||!Array.isArray(check.args)||check.args.some(arg=>typeof arg!=="string")||!Array.isArray(check.artifacts)||!Number.isSafeInteger(check.timeoutMs)||check.timeoutMs<=0))throw Error("Invalid candidate check plan");
 const parent=resolve(root,"target/v1-candidate-runs");mkdirSync(parent,{recursive:true});const directory=mkdtempSync(resolve(parent,"run-")),manifest=resolve(directory,"result.json");let source;
 const result={format:"breditor/candidate-qualification",formatVersion:1,profile:plan.profile,status:"running",v1Ready:false,publicationApproved:false,source:null,environment:{node:process.version,platform:process.platform,arch:process.arch},startedAt:new Date().toISOString(),deferred:plan.deferred,stages:[]};
 const checkSource=()=>{const current=snapshot(root);if(current.sha256!==source.sha256||current.commit!==source.commit)throw Error("Source changed during qualification; rerun against one fixed candidate");};
 saveEvidence(manifest,result);report(`verify-candidate: ${plan.profile}; evidence ${manifest}`);
 try{
  source=snapshot(root);result.source=source;saveEvidence(manifest,result);
  for(const [index,check] of plan.checks.entries()){
   checkSource();if(signal?.aborted){result.status="interrupted";break;}
   const logPath=resolve(directory,`${String(index+1).padStart(2,"0")}-${check.id}.log`),entry={id:check.id,status:"running",startedAt:new Date().toISOString(),command:check.command,args:check.args,env:check.env,logPath};result.stages.push(entry);saveEvidence(manifest,result);report(`verify-candidate: [${index+1}/${plan.checks.length}] ${check.id}`);
   const outcome=await execute(check,{root,logPath,signal});Object.assign(entry,outcome);
   entry.log=fileEvidence(root,relative(root,logPath));checkSource();
   if(entry.status==="passed")entry.artifacts=check.artifacts.map(artifact=>{const evidence=fileEvidence(root,artifact.path);if(artifact.fresh&&evidence.modifiedAtMs<Date.parse(entry.startedAt))throw Error(`Stale stage report: ${artifact.path}`);return evidence;});
   saveEvidence(manifest,result);report(`verify-candidate: ${entry.status} ${check.id}`);
   if(entry.status!=="passed"){result.status=entry.status;break;}
  }
  if(result.status==="running"){checkSource();result.status=result.stages.length===plan.checks.length?"passed":"interrupted";}
 }catch(error){result.status="failed";result.error=String(error);const current=result.stages.at(-1);if(current?.status==="running"||current?.status==="passed"){current.status="failed";current.error=String(error);}}
 finally{result.finishedAt=new Date().toISOString();result.selectedChecksPassed=result.status==="passed";saveEvidence(manifest,result);}
 report(`verify-candidate: ${result.status}; ${result.stages.filter(row=>row.status==="passed").length}/${plan.checks.length} selected checks passed; V1 release approval remains separate.`);
 return {exitCode:result.status==="passed"?0:result.status==="interrupted"?130:1,manifest,result};
}
export async function main(args){
 if(args.length===1&&args[0]==="--help"){console.log("Usage: node scripts/verify-candidate.mjs [--functional] [--dry-run]\nDefault full includes the existing default-package release/browser matrices and fail-closed reviewed readiness gate. --functional checks current Rust/rich/shared/interchange/review packages only; it is not V1 readiness. Evidence and failure logs stay under target/v1-candidate-runs. Never pushes, tags, publishes or deploys.");return 0;}
 if(new Set(args).size!==args.length||args.some(arg=>!["--functional","--dry-run"].includes(arg))){console.error("verify-candidate: unknown or repeated argument; use --help");return 2;}
 const plan=candidateReleasePlan({profile:args.includes("--functional")?"functional":"full"});
 if(args.includes("--dry-run")){console.log(JSON.stringify({executed:false,...plan},null,2));return 0;}
 const controller=new AbortController(),interrupt=()=>controller.abort();process.once("SIGINT",interrupt);process.once("SIGTERM",interrupt);
 try{return (await runCandidateChecks(plan,{signal:controller.signal})).exitCode;}
 finally{process.removeListener("SIGINT",interrupt);process.removeListener("SIGTERM",interrupt);}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main(process.argv.slice(2));
