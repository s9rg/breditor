import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,truncateSync,utimesSync,writeFileSync} from "node:fs";
import test from "node:test";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateShardIds} from "./candidate-release/shards.mjs";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {retainCandidateBrowserReports} from "./retain-candidate-browser-reports.mjs";

const workflow=JSON.parse(readFileSync(new URL("../.github/workflows/candidate-qualification.yml",import.meta.url),"utf8"));
const job=workflow.jobs.qualify,steps=job.steps;
const named=name=>{const found=steps.filter(step=>step.name===name);assert.equal(found.length,1);return found[0];};

test("candidate qualification is manual-only, read-only and does not supersede earlier runs",()=>{
 assert.deepEqual(Object.keys(workflow.on),["workflow_dispatch"]);
 assert.deepEqual(Object.keys(workflow.jobs),["qualify"]);
 assert.deepEqual(workflow.permissions,{contents:"read"});
 assert.equal(workflow.concurrency,undefined);assert.equal(job.concurrency,undefined);
 assert.deepEqual(job.defaults,{run:{shell:"bash"}});
 const profile=workflow.on.workflow_dispatch.inputs.profile;
 assert.equal(profile.required,true);assert.equal(profile.default,"full");
 assert.equal(profile.type,"choice");assert.deepEqual(profile.options,["full","functional","default-matrix","editor-browser-matrix","rich-browser-matrix","shared-browser-matrix","installed-application-network","portable-relay-recovery","dependency-inventories","installed-distribution-workflows","input-writing-workflows","installed-feature-browser","sdk-types"]);
 const shard=workflow.on.workflow_dispatch.inputs.shard;
 assert.equal(shard.default,"none");assert.equal(shard.type,"choice");
 assert.deepEqual(shard.options,["none",...candidateShardIds]);
 assert.equal(job["runs-on"],"ubuntu-24.04");assert.equal(job["timeout-minutes"],360);
 assert.equal(job.environment,undefined);assert.equal(job.secrets,undefined);
 assert.ok(steps.every(step=>step["continue-on-error"]===undefined));
});

test("every external action has an exact upstream commit and checkout retains no credentials",()=>{
 const pinned=[
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1",
  "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
  "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
 ];
 assert.deepEqual(steps.filter(step=>step.uses).map(step=>step.uses),pinned);
 for(const value of pinned)assert.match(value,/@[0-9a-f]{40}$/);
 assert.equal(named("Check out the selected source").with["persist-credentials"],false);
 assert.equal(named("Check out the selected source").with["fetch-depth"],1);
 const node=named("Install the baseline Node toolchain");
 assert.equal(node.with["node-version"],"22.14.0");
 assert.equal(node.with["package-manager-cache"],false);
});

test("CI installs the exact paired Rust and bindgen versions before offline checks",()=>{
 const toolchain=readFileSync(new URL("../rust-toolchain.toml",import.meta.url),"utf8");
 const release=/^channel = "([^"]+)"$/m.exec(toolchain)?.[1];assert.equal(release,"1.98.0");
 const lock=readFileSync(new URL("../Cargo.lock",import.meta.url),"utf8");
 const bindgen=/name = "wasm-bindgen"\nversion = "([^"]+)"/.exec(lock)?.[1];assert.equal(bindgen,"0.2.127");
 assert.equal(named("Install the paired Rust/Wasm toolchain").run,
  `rustup toolchain install ${release} --profile minimal --component clippy --component rustfmt --target wasm32-unknown-unknown\ncargo install wasm-bindgen-cli --version ${bindgen} --locked`);
 assert.equal(named("Install workspace dependencies and prepare the offline fixture cache").run,
  "npm ci --ignore-scripts --no-audit --no-fund\nnode scripts/prepare-candidate-npm-cache.mjs");
 assert.equal(named("Fetch locked Cargo graphs before offline qualification").run,
  "cargo fetch --locked --manifest-path Cargo.toml\ncargo fetch --locked --manifest-path crates/breditor-collaboration/Cargo.toml\ncargo fetch --locked --manifest-path experiments/collaboration/Cargo.toml\ncargo fetch --locked --manifest-path experiments/relay/Cargo.toml");
});

test("full qualification installs all three engines and the explicit functional profile does not imply readiness",()=>{
 const browsers=named("Install all three test engines for browser qualification");
 assert.equal(browsers.if,"${{ (inputs.profile == 'full' && inputs.shard == 'none') || inputs.profile == 'default-matrix' || inputs.profile == 'editor-browser-matrix' || inputs.profile == 'rich-browser-matrix' || inputs.profile == 'shared-browser-matrix' || inputs.profile == 'installed-application-network' || inputs.profile == 'installed-feature-browser' }}");
 assert.equal(browsers.run,"node node_modules/@playwright/test/cli.js install --with-deps chromium firefox webkit");
 const candidate=named("Qualify the selected candidate profile");
 assert.deepEqual(candidate.env,{CANDIDATE_PROFILE:"${{ inputs.profile }}",CANDIDATE_SHARD:"${{ inputs.shard }}",CARGO_NET_OFFLINE:"true"});
 assert.ok(steps.filter(step=>step.run).every(step=>!step.run.includes("${{")));
});

test("candidate logs are retained on failure without uploading unrelated target data or hidden files",()=>{
 const upload=named("Retain candidate results and failure logs");
 assert.equal(upload.if,"${{ always() }}");
 assert.equal(upload.with.path,"target/v1-candidate-runs/");
 assert.equal(upload.with["if-no-files-found"],"error");
 assert.equal(upload.with["retention-days"],14);
 assert.equal(upload.with["include-hidden-files"],false);
 assert.equal(upload.with.overwrite,false);assert.equal(upload.with.archive,true);
 assert.equal(upload.with.name,"candidate-${{ github.sha }}-${{ inputs.profile }}${{ inputs.shard != 'none' && format('-{0}', inputs.shard) || '' }}-${{ github.run_attempt }}");
});

const browserStageStarted=Date.parse("2026-10-01T01:00:00.000Z"),browserStageFinished=browserStageStarted+10_000;
const browserStageTime=(path,time=browserStageStarted)=>utimesSync(path,time/1000,time/1000);

function seedBrowserFailure(root,profile,stageId){
 const directory=join(root,"target/v1-candidate-runs"),path=join(directory,"run-current/result.json");
 mkdirSync(join(directory,"run-current"),{recursive:true});
 const revision="1".repeat(40),runId="42",runAttempt="3";
 const context={format:"1",repository:"s9rg/breditor",workflow:"s9rg/breditor/.github/workflows/candidate-qualification.yml@refs/heads/main",
  event:"workflow_dispatch",revision,profile,shard:"none",runId,runAttempt,os:"Linux",arch:"X64",checkout:"success",
  node:"success",rust:"success",npm:"success",cargo:"success",browsers:"success",candidate:"failure"};
 writeFileSync(join(directory,"runner-context.tsv"),Object.entries(context).map(([key,value])=>`${key}\t${value}\n`).join(""));
 const plan=candidateReleasePlan({profile,environment:{}}),index=plan.checks.findIndex(check=>check.id===stageId);
 assert.ok(index>=0);
 const stages=plan.checks.slice(0,index+1).map(check=>({id:check.id,status:"passed"}));
 Object.assign(stages.at(-1),{status:"failed",startedAt:new Date(browserStageStarted).toISOString(),finishedAt:new Date(browserStageFinished).toISOString()});
 const manifest={format:"breditor/candidate-qualification",formatVersion:1,source:{commit:revision},profile,status:"failed",
  hostedRun:{runId,runAttempt},stages};
 writeFileSync(path,JSON.stringify(manifest));
 return {path,manifest};
}

test("failure evidence preserves only exact bounded reports from the selected browser stage",()=>{
 const root=mkdtempSync(join(tmpdir(),"breditor-browser-reports-"));
 try{
  seedBrowserFailure(root,"shared-browser-matrix","shared-browser-matrix");
  mkdirSync(join(root,"experiments/shared-browser"),{recursive:true});
  mkdirSync(join(root,"target/shared-browser-results"),{recursive:true});
  const scoped=name=>`target/shared-browser-results/${name}.spec.mjs.json`;
  for(const name of ["example","stale","later","link","oversized"])writeFileSync(join(root,`experiments/shared-browser/${name}.spec.mjs`),"");
  const current=scoped("example"),stale=scoped("stale"),later=scoped("later");
  for(const path of [current,stale,later,"target/shared-application-browser-playwright.json"]){
   writeFileSync(join(root,path),'{"stats":{"unexpected":1}}');
   browserStageTime(join(root,path));
  }
  browserStageTime(join(root,stale),browserStageStarted-1000);
  browserStageTime(join(root,later),browserStageFinished+1000);
  const oversized=scoped("oversized");
  writeFileSync(join(root,oversized),"");
  truncateSync(join(root,oversized),8*1024*1024+1);
  browserStageTime(join(root,oversized));
  const link=scoped("link");
  symlinkSync(join(root,current),join(root,link));
  writeFileSync(join(root,"target/shared-browser-results/unregistered.spec.mjs.json"),'{"private":true}');

  const proof=retainCandidateBrowserReports(root);
  assert.deepEqual(proof.reports.map(report=>report.path),[current]);
  assert.equal(proof.manifest,"run-current/result.json");
  assert.equal(proof.stage,"shared-browser-matrix");
  assert.deepEqual(proof.omitted,[{path:later,reason:"outside-browser-stage-window"},
   {path:link,reason:"non-regular-or-outside-workspace"},{path:oversized,reason:"size-bound"},
   {path:stale,reason:"outside-browser-stage-window"}]);
  for(const report of proof.reports)assert.deepEqual(
   readFileSync(join(root,"target/v1-candidate-runs",report.retainedPath)),readFileSync(join(root,report.path)));
  assert.deepEqual(JSON.parse(readFileSync(join(root,"target/v1-candidate-runs/browser-failure-reports.json"),"utf8")),proof);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("browser failure reports stop at the total artifact budget",()=>{
 const root=mkdtempSync(join(tmpdir(),"breditor-browser-report-budget-"));
 try{
  seedBrowserFailure(root,"shared-browser-matrix","shared-browser-matrix");
  mkdirSync(join(root,"experiments/shared-browser"),{recursive:true});
  mkdirSync(join(root,"target/shared-browser-results"),{recursive:true});
  const maximumFileBytes=8*1024*1024;
  for(const name of ["a","b","c","d"])writeFileSync(join(root,`experiments/shared-browser/${name}.spec.mjs`),"");
  for(const name of ["chromium-firefox.json","a.spec.mjs.json","b.spec.mjs.json","c.spec.mjs.json"]){
   const path=join(root,"target/shared-browser-results",name);
   writeFileSync(path,"");
   truncateSync(path,maximumFileBytes);
   browserStageTime(path);
  }
  const omitted="target/shared-browser-results/d.spec.mjs.json";
  writeFileSync(join(root,omitted),"{}");
  browserStageTime(join(root,omitted));

  const proof=retainCandidateBrowserReports(root);
  assert.equal(proof.reports.length,4);
  assert.equal(proof.reports.reduce((total,report)=>total+report.bytes,0),4*maximumFileBytes);
  assert.deepEqual(proof.omitted,[{path:omitted,reason:"size-bound"}]);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("browser failure retention refuses a different attempt, stage sequence or ambiguous manifest",()=>{
 const root=mkdtempSync(join(tmpdir(),"breditor-browser-diagnostic-selection-"));
 try{
  const {path,manifest}=seedBrowserFailure(root,"installed-application-network","installed-application-network-matrix");
  const raw=join(root,"target/shared-application-browser-playwright.json");
  writeFileSync(raw,"{}");
  browserStageTime(raw);
  const selected=structuredClone(manifest);
  for(const mutate of [
   changed=>delete changed.hostedRun,
   changed=>changed.hostedRun.runAttempt="2",
   changed=>changed.stages.shift(),
  ]){
   const changed=structuredClone(selected);
   mutate(changed);
   writeFileSync(path,JSON.stringify(changed));
   assert.deepEqual(retainCandidateBrowserReports(root).reports,[]);
  }
  writeFileSync(path,JSON.stringify(selected));
  const competing=join(root,"target/v1-candidate-runs/run-duplicate");
  mkdirSync(competing);
  writeFileSync(join(competing,"result.json"),JSON.stringify(selected));
  assert.deepEqual(retainCandidateBrowserReports(root).reports,[]);
  rmSync(competing,{recursive:true,force:true});
  assert.equal(retainCandidateBrowserReports(root).reports.length,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test("failed browser and demo traces have their own bounded artifact",()=>{
 const traces=named("Retain failed browser and demo traces");
 assert.equal(traces.if,"${{ failure() && steps.candidate.outcome == 'failure' }}");
 assert.deepEqual(traces.with,{
  name:"candidate-browser-failures-${{ github.sha }}-${{ github.run_attempt }}",
  path:"target/playwright-results/**/trace.zip\ntarget/playwright-demo-results/**/trace.zip\ntarget/rich-browser-results/**/trace.zip\ntarget/editor-browser-results/**/trace.zip\ntarget/shared-browser-results/**/trace.zip\ntarget/shared-application-browser-results/**/trace.zip",
  "if-no-files-found":"ignore",
  "retention-days":14,
  "include-hidden-files":false,
  overwrite:false,
  archive:true,
 });
});

test("every CI command block passes Bash syntax without executing setup, publishing or remote jobs",()=>{
 for(const step of steps.filter(step=>step.run)){
  const result=spawnSync("bash",["-n"],{input:step.run,encoding:"utf8",timeout:5000});
  assert.equal(result.status,0,step.name+": "+result.stderr);
  assert.equal(result.error,undefined);
  assert.doesNotMatch(step.run,/\b(?:publish|deploy|gh|sudo)\b|git\s+(?:push|tag)|continue-on-error/);
 }
});

test("the evidence deadline is established before setup with fifteen minutes reserved",()=>{
 const setup=named("Reserve time for evidence upload");
 assert.equal(steps[0],setup);
 const cwd=mkdtempSync(join(tmpdir(),"breditor-ci-deadline-"));
 try{
  const environment=join(cwd,"environment");
  const result=spawnSync("bash",["-ec",'date() { echo 1000; }\n'+setup.run],{
   cwd,encoding:"utf8",env:{...process.env,GITHUB_ENV:environment},
  });
  assert.equal(result.status,0,result.stderr);
  assert.equal(readFileSync(environment,"utf8"),"CANDIDATE_EVIDENCE_DEADLINE=21700\n");
 }finally{rmSync(cwd,{recursive:true,force:true});}
});

test("profile dispatch honors the deadline and preserves the verifier's exit status",()=>{
 const command=named("Qualify the selected candidate profile").run;
 const run=(profile,deadline,status="0",shard="none")=>spawnSync("bash",["-c",[
  'date() { echo 1000; }',
  'timeout() { for arg in "$@"; do echo "$arg"; done; return "$VERIFIER_STATUS"; }',
  command,
 ].join("\n")],{env:{...process.env,CANDIDATE_PROFILE:profile,CANDIDATE_SHARD:shard,CANDIDATE_EVIDENCE_DEADLINE:deadline,VERIFIER_STATUS:status},encoding:"utf8"});
 for(const [profile,args] of [["full",[]],["functional",["--functional"]],
  ["default-matrix",["--default-matrix"]],["editor-browser-matrix",["--editor-browser-matrix"]],
  ["shared-browser-matrix",["--shared-browser-matrix"]],["portable-relay-recovery",["--portable-relay-recovery"]],
  ["dependency-inventories",["--dependency-inventories"]],
  ["installed-application-network",["--installed-application-network"]],
  ["installed-distribution-workflows",["--installed-distribution-workflows"]],
  ["input-writing-workflows",["--input-writing-workflows"]],["sdk-types",["--sdk-types"]]]){
  const result=run(profile,"2080");
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split("\n"),
   ["--signal=TERM","--kill-after=2m","1080s","node","scripts/verify-candidate.mjs",...args]);
 }
 const shard=run("full","2080","0","local-history");
 assert.equal(shard.status,0,shard.stderr);
 assert.deepEqual(shard.stdout.trimEnd().split("\n"),
  ["--signal=TERM","--kill-after=2m","1080s","node","scripts/verify-candidate.mjs","--shard","local-history"]);
 for(const status of [19,124,130])assert.equal(run("full","2080",String(status)).status,status);
 for(const profile of ["","FULL","full; echo injected","$(echo injected)"]){
  const invalid=run(profile,"2080");
  assert.equal(invalid.status,2);
  assert.equal(invalid.stdout,"");
  assert.match(invalid.stderr,/Unsupported candidate qualification profile/);
 }
 for(const deadline of ["","abc","012","1+2","$(echo injected)"]){
  const invalid=run("full",deadline);
  assert.equal(invalid.status,2);
  assert.equal(invalid.stdout,"");
  assert.match(invalid.stderr,/Missing or invalid candidate evidence deadline/);
 }
 const expired=run("full","1000");
 assert.equal(expired.status,124);
 assert.equal(expired.stdout,"");
 assert.match(expired.stderr,/Candidate deadline elapsed during setup/);
});

test("a setup failure still has a retained commit and runner outcome report",()=>{
 const row=named("Record qualification setup and stage outcomes");
 const ids=["checkout","node","rust","npm","cargo","browsers","candidate"];
 assert.deepEqual(steps.slice(1,ids.length+1).map(step=>step.id),ids);
 assert.equal(row.if,"${{ always() }}");
 const diagnostics=named("Copy structured browser diagnostics after qualification failure");
 assert.equal(steps.indexOf(row)+1,steps.indexOf(diagnostics));
 assert.equal(steps.indexOf(diagnostics)+1,steps.indexOf(named("Retain candidate results and failure logs")));
 assert.equal(diagnostics.if,"${{ failure() && steps.candidate.outcome == 'failure' }}");
 assert.equal(diagnostics.run,"node scripts/retain-candidate-browser-reports.mjs");
 for(const id of ids)assert.equal(row.env[id.toUpperCase()+"_OUTCOME"],"${{ steps."+id+".outcome }}");
 const cwd=mkdtempSync(join(tmpdir(),"breditor-ci-setup-report-"));
 try{
  const sha="1".repeat(40);
  mkdirSync(join(cwd,"scripts"));
  copyFileSync(new URL("./summarize-candidate-run.mjs",import.meta.url),join(cwd,"scripts/summarize-candidate-run.mjs"));
  const summary=join(cwd,"summary.md");
  const result=spawnSync("bash",["-ec",row.run],{
   cwd,encoding:"utf8",env:{...process.env,GITHUB_SHA:sha,CANDIDATE_PROFILE:"full",RUNNER_OS:"Linux",RUNNER_ARCH:"X64",
    GITHUB_STEP_SUMMARY:summary,GITHUB_REPOSITORY:"s9rg/breditor",GITHUB_EVENT_NAME:"workflow_dispatch",
    GITHUB_WORKFLOW_REF:"s9rg/breditor/.github/workflows/candidate-qualification.yml@refs/heads/main",
    GITHUB_RUN_ID:"1234",GITHUB_RUN_ATTEMPT:"2",
    CHECKOUT_OUTCOME:"success",NODE_OUTCOME:"success",RUST_OUTCOME:"failure",
    NPM_OUTCOME:"skipped",CARGO_OUTCOME:"skipped",BROWSERS_OUTCOME:"skipped",CANDIDATE_OUTCOME:"skipped"},
  });
  assert.equal(result.status,0,result.stderr);
  const report=readFileSync(join(cwd,"target/v1-candidate-runs/runner-context.tsv"),"utf8");
  assert.deepEqual(Object.fromEntries(report.trimEnd().split("\n").map(line=>line.split("\t"))),{
   format:"1",repository:"s9rg/breditor",workflow:"s9rg/breditor/.github/workflows/candidate-qualification.yml@refs/heads/main",
   event:"workflow_dispatch",runId:"1234",runAttempt:"2",
   revision:sha,profile:"full",shard:"none",os:"Linux",arch:"X64",checkout:"success",node:"success",rust:"failure",
   npm:"skipped",cargo:"skipped",browsers:"skipped",candidate:"skipped",
  });
  assert.match(readFileSync(summary,"utf8"),/Runner step `rust` reported `failure`/);
  assert.match(readFileSync(summary,"utf8"),/The verifier did not record a candidate result/);
 }finally{rmSync(cwd,{recursive:true,force:true});}
});

test("candidate summary points to the failed stage log in a downloaded artifact",()=>{
 const directory=mkdtempSync(join(tmpdir(),"breditor-candidate-summary-"));
 try{
  const run=join(directory,"run-ABC123");mkdirSync(run);
  const revision="2".repeat(40);
  writeFileSync(join(directory,"runner-context.tsv"),`revision\t${revision}\nprofile\tfull\ncandidate\tfailure\n`);
  writeFileSync(join(run,"result.json"),JSON.stringify({
   format:"breditor/candidate-qualification",formatVersion:1,profile:"full",status:"failed",source:{commit:revision},
   stages:[{id:"workspace-native",status:"passed"},{id:"relay-native",status:"failed",exitCode:101}],
  }));
  writeFileSync(join(run,"02-relay-native.log"),"redacted test log");
  const executable=fileURLToPath(new URL("./summarize-candidate-run.mjs",import.meta.url));
  const result=spawnSync(process.execPath,[executable,directory],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,new RegExp(revision));
  assert.match(result.stdout,/Candidate result `failed` with 1 passed stage/);
  assert.match(result.stdout,/Last stage `relay-native` recorded `failed` and exit code 101/);
  assert.match(result.stdout,/`run-ABC123\/02-relay-native\.log`/);
  assert.match(result.stdout,/V1 release approval is reviewed separately/);
  const reportPath=join(run,"result.json"),report=JSON.parse(readFileSync(reportPath,"utf8"));
  Object.assign(report.stages[1],{status:"timeout",exitCode:null,signal:"SIGTERM"});
  writeFileSync(reportPath,JSON.stringify(report));
  const timedOut=spawnSync(process.execPath,[executable,directory],{encoding:"utf8"});
  assert.equal(timedOut.status,0,timedOut.stderr);
  assert.match(timedOut.stdout,/Last stage `relay-native` recorded `timeout` and signal `SIGTERM`/);
  assert.doesNotMatch(timedOut.stdout,/exit code null/);
  writeFileSync(join(directory,"runner-context.tsv"),`revision\t${revision}\nprofile\tfull\nshard\tnative\n`);
  const mismatch=spawnSync(process.execPath,[executable,directory],{encoding:"utf8"});
  assert.match(mismatch.stdout,/Could not read a candidate result matching/);
  writeFileSync(reportPath,JSON.stringify({...report,shard:{id:"native"}}));
  const matched=spawnSync(process.execPath,[executable,directory],{encoding:"utf8"});
  assert.match(matched.stdout,/Selected full-profile shard `native`/);
  assert.match(matched.stdout,/Candidate result `failed`/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
