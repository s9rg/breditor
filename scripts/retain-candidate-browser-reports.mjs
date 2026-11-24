/** Preserve bounded Playwright reports even when a stage fails before its normal receipt. */
import {lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync} from "node:fs";
import {join,relative} from "node:path";
import {fileURLToPath} from "node:url";
import {isDeepStrictEqual} from "node:util";
import {fileEvidence,retainStageArtifact,saveEvidence} from "./candidate-release/evidence.mjs";
import {readHostedRunnerContext} from "./candidate-release/hosted-context.mjs";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {candidateShardPlan} from "./candidate-release/shards.mjs";

const sharedDirectory="target/shared-browser-results";
const maximumFileBytes=8*1024*1024;
const maximumTotalBytes=32*1024*1024;
const incompleteStatuses=new Set(["running","failed","interrupted","timeout","launch-failed","log-limit","log-write-failed"]);

function localStat(path){
 try{return lstatSync(path);}
 catch(error){if(error.code!=="ENOENT")throw error;}
}

function selectedFailure(directory){
 const {context}=readHostedRunnerContext(directory);
 if(context.candidate!=="failure"||!/^[a-f0-9]{40}$/u.test(context.revision))return;
 const matching=[];
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  if(!entry.isDirectory()||!/^run-[a-z0-9]+$/iu.test(entry.name))continue;
  const path=`${entry.name}/result.json`,file=join(directory,path),stat=localStat(file);
  if(!stat?.isFile()||stat.size>32*1024*1024)continue;
  let manifest;
  try{manifest=JSON.parse(readFileSync(file,"utf8"));}catch(error){if(error instanceof SyntaxError)continue;throw error;}
  if(manifest?.format==="breditor/candidate-qualification"&&manifest.formatVersion===1&&
   manifest.hostedRun?.runId===context.runId&&manifest.hostedRun?.runAttempt===context.runAttempt&&
   manifest.source?.commit===context.revision&&manifest.profile===context.profile&&
   (manifest.shard?.id??"none")===context.shard)matching.push({path,manifest});
 }
 if(matching.length!==1)return;
 const {path,manifest}=matching[0];
 if(!Array.isArray(manifest.stages))return;
 const stage=manifest.stages.at(-1);
 if(!incompleteStatuses.has(manifest.status)||manifest.selectedChecksPassed===true||!incompleteStatuses.has(stage?.status))return;
 const fullPlan=candidateReleasePlan({profile:manifest.profile,environment:{}});
 const plan=manifest.shard?candidateShardPlan(fullPlan,manifest.shard.id):fullPlan;
 const checks=plan.checks.slice(0,manifest.stages.length);
 if(!isDeepStrictEqual(plan.shard,manifest.shard)||!isDeepStrictEqual(checks.map(check=>check.id),manifest.stages.map(record=>record.id)))return;
 const started=Date.parse(stage.startedAt),finished=Date.parse(stage.finishedAt??manifest.finishedAt??new Date().toISOString());
 if(!Number.isFinite(started)||!Number.isFinite(finished)||finished<started)return;
 return {path,stage:stage.id,started,finished,check:checks.at(-1)};
}

function failureReportPaths(root,failure){
 if(!failure)return [];
 const {stage,check}=failure;
 if(/^rich-browser-(chromium|firefox|webkit)$/u.test(stage))return [check.env.PLAYWRIGHT_JSON_OUTPUT_FILE];
 if(stage==="installed-application-network-matrix")return ["target/shared-application-browser-playwright.json"];
 if(stage!=="shared-browser-matrix")return [];
 const specs=readdirSync(join(root,"experiments/shared-browser"),{withFileTypes:true})
  .filter(entry=>entry.isFile()&&/^[a-z0-9-]+\.spec\.mjs$/.test(entry.name))
  .map(entry=>entry.name).sort();
 return ["chromium-firefox",...specs].map(suite=>`${sharedDirectory}/${suite}.json`);
}

export function retainCandidateBrowserReports(root){
 const directory=join(root,"target/v1-candidate-runs");
 const failure=selectedFailure(directory);
 const reports=[],omitted=[];
 let total=0;
 for(const path of failureReportPaths(root,failure)){
  const full=join(root,path),info=localStat(full);
  if(!info)continue;
  if(!info.isFile()||relative(realpathSync(root),realpathSync(full)).split(/[\\/]/)[0]===".."){
   omitted.push({path,reason:"non-regular-or-outside-workspace"});
   continue;
  }
  // The manifest clock records whole milliseconds and the filesystem can report fractions.
  const modified=Math.floor(info.mtimeMs);
  if(modified<failure.started||modified>failure.finished){
   omitted.push({path,reason:"outside-browser-stage-window"});
   continue;
  }
  if(info.size>maximumFileBytes||total+info.size>maximumTotalBytes){
   omitted.push({path,reason:"size-bound"});
   continue;
  }
  const evidence=fileEvidence(root,path);
  if(evidence.bytes!==info.size||evidence.modifiedAtMs!==info.mtimeMs)throw Error(`Browser diagnostic changed during retention: ${path}`);
  reports.push(retainStageArtifact(root,directory,"browser-failure",evidence));
  total+=evidence.bytes;
 }
 mkdirSync(directory,{recursive:true});
 const index={format:"breditor/candidate-browser-failure-reports",formatVersion:1,
  ...(failure?{manifest:failure.path,stage:failure.stage}:{}),reports,omitted};
 saveEvidence(join(directory,"browser-failure-reports.json"),index);
 return index;
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const index=retainCandidateBrowserReports(fileURLToPath(new URL("../",import.meta.url)));
 console.log(`Retained ${index.reports.length} browser reports. Omitted ${index.omitted.length} unsupported reports.`);
}
