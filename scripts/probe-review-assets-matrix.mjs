/** Process isolation releases pinned fake-IDB transaction rollback history between
 * independent policies. Within each process all exact reload/failure checks remain live. */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
export const reviewAssetPolicies=["original","general-v1","document-v1"].flatMap(scope=>[false,true].map(natural=>({scope,natural})));
export function collectReviewAssetMatrix(reports){
 assert.equal(reports.length,6,"Every original policy must finish");
 const first=reports[0],result={...first,policies:reviewAssetPolicies,matrixIsolation:"process-per-policy",assetWorkflows:[],controlWorkflows:[]};
 const counters=Object.keys(first).filter(key=>typeof first[key]==="number"&&key!=="formatVersion");
 for(const key of counters)result[key]=0;
 for(const [index,report] of reports.entries()){
  assert.equal(report.passed,true);assert.deepEqual(report.policies,[reviewAssetPolicies[index]],"No missing, repeated or substituted policy");assert.equal(report.trials,1);
  assert.equal(report.sharedWasmSha256,first.sharedWasmSha256);assert.equal(report.nativeRelaySha256,first.nativeRelaySha256);
  assert.equal(report.assetWorkflows.length,1);assert.equal(report.controlWorkflows.length,1);assert.equal(report.assetWorkflows[0].passed,true);
  assert.equal(report.controlWorkflows[0].builtInActions,9);assert.equal(report.controlWorkflows[0].serverFinalOwnedAccepts,9);
  for(const key of counters){assert.ok(Number.isSafeInteger(report[key])&&report[key]>=0);if(key!=="wireRequests")assert.equal(report[key],1,`Every original ${key} gate must pass within each policy`);result[key]+=report[key];}
  result.assetWorkflows.push({...report.assetWorkflows[0],trial:index});result.controlWorkflows.push(report.controlWorkflows[0]);
 }
 assert.equal(result.trials,6);assert.ok(result.wireRequests<16000,"Original total anti-spin budget applies across all six processes");
 return result;
}
async function runPolicy(request,onProgress){
 const child=spawn(process.execPath,[fileURLToPath(new URL("./probe-review-assets-worker.mjs",import.meta.url)),JSON.stringify(request)],{stdio:["ignore","pipe","pipe"]});
 let output="",errors="",pending="";
 child.stdout.setEncoding("utf8");child.stderr.setEncoding("utf8");
 child.stdout.on("data",chunk=>{output+=chunk;if(output.length>4*1024*1024){child.kill("SIGTERM");}});
 child.stderr.on("data",chunk=>{errors=(errors+chunk).slice(-32768);pending+=chunk;let line;while((line=pending.indexOf("\n"))>=0){const text=pending.slice(0,line);pending=pending.slice(line+1);try{onProgress?.({...JSON.parse(text),policy:request.policy});}catch{/* Diagnostic output cannot change acceptance. */}}if(pending.length>32768)pending=pending.slice(-32768);});
 await new Promise((resolve,reject)=>{child.once("error",reject);child.once("close",(code,signal)=>code===0?resolve():reject(Error(`Asset policy ${JSON.stringify(request.policy)} exited ${code??signal}: ${errors}`)));});
 assert.ok(output.length<=4*1024*1024,"Bounded complete worker report");return JSON.parse(output);
}
export async function probeReviewAssetsMatrix(directory,executable,{onProgress,...options}={}){
 const plain=Object.fromEntries(Object.entries(options).map(([key,value])=>[key,value instanceof URL?value.href:value])),reports=[];
 for(const policy of reviewAssetPolicies)reports.push(await runPolicy({directory,executable,options:plain,policy},onProgress));
 return collectReviewAssetMatrix(reports);
}
