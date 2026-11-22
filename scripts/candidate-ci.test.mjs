import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import test from "node:test";
import {tmpdir} from "node:os";
import {join} from "node:path";

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
 assert.equal(profile.type,"choice");assert.deepEqual(profile.options,["full","functional"]);
 assert.equal(job["runs-on"],"ubuntu-24.04");assert.equal(job["timeout-minutes"],360);
 assert.equal(job.environment,undefined);assert.equal(job.secrets,undefined);
 assert.ok(steps.every(step=>step["continue-on-error"]===undefined));
});

test("every external action has an exact upstream commit and checkout retains no credentials",()=>{
 const pinned=[
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1",
  "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
 ];
 assert.deepEqual(steps.filter(step=>step.uses).map(step=>step.uses),pinned);
 for(const value of pinned)assert.match(value,/@[0-9a-f]{40}$/);
 assert.equal(steps[0].with["persist-credentials"],false);
 assert.equal(steps[0].with["fetch-depth"],1);
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
 assert.equal(named("Install locked workspace dependencies").run,"npm ci --ignore-scripts --no-audit --no-fund");
 assert.equal(named("Fetch locked Cargo graphs before offline qualification").run,
  "cargo fetch --locked --manifest-path Cargo.toml\ncargo fetch --locked --manifest-path crates/breditor-collaboration/Cargo.toml\ncargo fetch --locked --manifest-path experiments/relay/Cargo.toml");
});

test("full qualification installs all three engines and the explicit functional profile does not imply readiness",()=>{
 const browsers=named("Install all three test engines for the full profile");
 assert.equal(browsers.if,"${{ inputs.profile == 'full' }}");
 assert.equal(browsers.run,"node node_modules/@playwright/test/cli.js install --with-deps chromium firefox webkit");
 const candidate=named("Qualify the selected candidate profile");
 assert.deepEqual(candidate.env,{CANDIDATE_PROFILE:"${{ inputs.profile }}",CARGO_NET_OFFLINE:"true"});
 assert.equal(candidate.run,'case "$CANDIDATE_PROFILE" in\n  full) node scripts/verify-candidate.mjs ;;\n  functional) node scripts/verify-candidate.mjs --functional ;;\n  *) echo "Unsupported candidate qualification profile" >&2; exit 2 ;;\nesac');
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
 assert.equal(upload.with.name,"candidate-${{ github.sha }}-${{ inputs.profile }}-${{ github.run_attempt }}");
});

test("every CI command block passes Bash syntax without executing setup, publishing or remote jobs",()=>{
 for(const step of steps.filter(step=>step.run)){
  const result=spawnSync("bash",["-n"],{input:step.run,encoding:"utf8",timeout:5000});
  assert.equal(result.status,0,step.name+": "+result.stderr);
  assert.equal(result.error,undefined);
  assert.doesNotMatch(step.run,/\b(?:publish|deploy|gh|sudo)\b|git\s+(?:push|tag)|continue-on-error/);
 }
});

test("profile dispatch preserves failures and rejects unknown values without shell interpolation",()=>{
 const command=named("Qualify the selected candidate profile").run;
 for(const [profile,expected] of [
  ["full",["scripts/verify-candidate.mjs"]],
  ["functional",["scripts/verify-candidate.mjs","--functional"]],
 ]){
  const result=spawnSync("bash",["-c",'node() { for arg in "$@"; do echo "$arg"; done; }\n'+command],{env:{...process.env,CANDIDATE_PROFILE:profile},encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split("\n"),expected);
 }
 const failure=spawnSync("bash",["-c","node() { return 19; }\n"+command],{env:{...process.env,CANDIDATE_PROFILE:"full"},encoding:"utf8"});
 assert.equal(failure.status,19,"a failed full qualification cannot fall back to functional");
 for(const profile of ["","FULL","full; echo injected","$(echo injected)"]){
  const invalid=spawnSync("bash",["-c",'node() { echo "unexpected candidate invocation"; }\n'+command],{env:{...process.env,CANDIDATE_PROFILE:profile},encoding:"utf8"});
  assert.equal(invalid.status,2);
  assert.equal(invalid.stdout,"");
  assert.match(invalid.stderr,/Unsupported candidate qualification profile/);
 }
});

test("a setup failure still has a retained commit and runner outcome report",()=>{
 const row=named("Record qualification setup and stage outcomes");
 const ids=["checkout","node","rust","npm","cargo","browsers","candidate"];
 assert.deepEqual(steps.slice(0,ids.length).map(step=>step.id),ids);
 assert.equal(row.if,"${{ always() }}");
 assert.equal(steps.indexOf(row)+1,steps.indexOf(named("Retain candidate results and failure logs")));
 for(const id of ids)assert.equal(row.env[id.toUpperCase()+"_OUTCOME"],"${{ steps."+id+".outcome }}");
 const cwd=mkdtempSync(join(tmpdir(),"breditor-ci-setup-report-"));
 try{
  const sha="1".repeat(40);
  const result=spawnSync("bash",["-ec",row.run],{
   cwd,encoding:"utf8",env:{...process.env,GITHUB_SHA:sha,CANDIDATE_PROFILE:"full",RUNNER_OS:"Linux",RUNNER_ARCH:"X64",
    CHECKOUT_OUTCOME:"success",NODE_OUTCOME:"success",RUST_OUTCOME:"failure",
    NPM_OUTCOME:"skipped",CARGO_OUTCOME:"skipped",BROWSERS_OUTCOME:"skipped",CANDIDATE_OUTCOME:"skipped"},
  });
  assert.equal(result.status,0,result.stderr);
  const report=readFileSync(join(cwd,"target/v1-candidate-runs/runner-context.tsv"),"utf8");
  assert.deepEqual(Object.fromEntries(report.trimEnd().split("\n").map(line=>line.split("\t"))),{
   revision:sha,profile:"full",os:"Linux",arch:"X64",checkout:"success",node:"success",rust:"failure",
   npm:"skipped",cargo:"skipped",browsers:"skipped",candidate:"skipped",
  });
 }finally{rmSync(cwd,{recursive:true,force:true});}
});
