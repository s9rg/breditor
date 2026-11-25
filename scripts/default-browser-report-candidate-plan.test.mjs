import assert from "node:assert/strict";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import {validateDefaultBrowserReport} from "./candidate-release/default-browser-report.mjs";
import {releaseChecks,runReleaseChecks} from "./verify-release.mjs";
import {candidateReleasePlan} from "./candidate-release/plan.mjs";
import {fileEvidence,retainStageArtifact} from "./candidate-release/evidence.mjs";
import {
 defaultReleaseBrowserChecks,defaultReleaseBrowserPath,verifyDefaultReleaseBrowserStage,
} from "./candidate-release/default-release-browser-evidence.mjs";

const projects=["chromium","firefox","webkit"];
function sample(){
 return {config:{projects:projects.map(name=>({name}))},errors:[],stats:{expected:6,skipped:0,unexpected:0,flaky:0},
  suites:["editing","demo"].map(file=>({file:`${file}.spec.ts`,suites:[{specs:[{
   id:file,tests:projects.map(project=>({projectName:project,projectId:project,expectedStatus:"passed",status:"expected",results:[{status:"passed"}]})),
  }]}]}))};
}

test("default matrix proof binds passing cases to the selected Playwright inventory",()=>{
 const discovery=sample();
 for(const suite of discovery.suites)for(const row of suite.suites[0].specs[0].tests)row.results=[];
 assert.deepEqual(validateDefaultBrowserReport(discovery,sample()),{count:6,projects});
 const missing=sample();
 missing.suites.pop();missing.stats.expected=3;
 assert.throws(()=>validateDefaultBrowserReport(discovery,missing),/case inventory/);
 const omittedProject=sample();
 for(const suite of omittedProject.suites)suite.suites[0].specs[0].tests.pop();
 omittedProject.stats.expected=4;
 assert.throws(()=>validateDefaultBrowserReport(discovery,omittedProject),/omitted a configured browser project/);
 const repeated=sample();
 repeated.suites.push(repeated.suites[0]);
 assert.throws(()=>validateDefaultBrowserReport(discovery,repeated),/repeated browser case/);
 const masked=sample();
 masked.suites[0].suites[0].specs[0].tests[2].results[0].status="skipped";
 assert.throws(()=>validateDefaultBrowserReport(discovery,masked),/did not pass exactly once/);
});

test("zero-exit Playwright with skipped work stops the default verifier",()=>{
 const checks=releaseChecks({}).filter(check=>["browser-matrix","demo-matrix","diff-whitespace"].includes(check.id));
 const invocations=[],logs=[];
 const result=runReleaseChecks(checks,(_command,args,options)=>{
  invocations.push(args);
  const report=sample();
  if(!args.includes("--list"))report.stats.skipped=1;
  writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE,JSON.stringify(report));
  return {status:0};
 },line=>logs.push(line));
 assert.equal(result,1);
 assert.equal(invocations.length,2);
 assert.match(logs.join("\n"),/browser-matrix evidence rejected/);
 assert.match(logs.at(-1),/FAILED browser-matrix/);
});

test("candidate default evidence replays both reports and retains a failed pair without stale outputs",t=>{
 const root=mkdtempSync(join(tmpdir(),"breditor-default-browser-evidence-"));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,"scripts/candidate-release"),{recursive:true});
 writeFileSync(join(root,"scripts/candidate-release/default-release-browser-evidence.mjs"),"");
 const checks=releaseChecks({}).filter(check=>defaultReleaseBrowserChecks.includes(check.id));
 const output=id=>join(root,defaultReleaseBrowserPath(id));
 const run=failed=>(_command,args,options)=>{
  const listing=args.includes("--list"),value=sample();
  if(failed&&!listing)value.stats.unexpected=1;
  writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE,JSON.stringify(value));
  return {status:failed&&!listing?7:0};
 };
 assert.equal(runReleaseChecks(checks,run(false),()=>{},{evidenceRoot:root}),0);
 const plan=candidateReleasePlan({profile:"default-matrix"}).checks[0];
 assert.deepEqual(plan.args,["scripts/verify-release.mjs","--candidate-evidence"]);
 assert.deepEqual(plan.artifacts,defaultReleaseBrowserChecks.map(id=>({path:defaultReleaseBrowserPath(id),fresh:true,retain:true})));
 assert.deepEqual(candidateReleasePlan({profile:"default-matrix",defaultBrowserEvidence:false}).checks[0].artifacts,[]);
 const proof=join(root,"stage"),stage={id:plan.id,artifacts:plan.artifacts.map(({path})=>
  retainStageArtifact(root,proof,plan.id,fileEvidence(root,path)))};
 verifyDefaultReleaseBrowserStage(root,proof,stage);
 const dropped=JSON.parse(readFileSync(output("demo-matrix")));
 dropped.report.suites.pop();
 dropped.report.stats.expected=3;
 const path=stage.artifacts[1].retainedPath;
 writeFileSync(join(proof,path),JSON.stringify(dropped));
 stage.artifacts[1].sha256=fileEvidence(proof,path).sha256;
 assert.throws(()=>verifyDefaultReleaseBrowserStage(root,proof,stage),/case inventory/);
 assert.equal(runReleaseChecks(checks,run(true),()=>{},{evidenceRoot:root}),7);
 assert.equal(existsSync(output("demo-matrix")),false);
 const retained=JSON.parse(readFileSync(output("browser-matrix")));
 assert.equal(retained.discovery.stats.expected,6);
 assert.equal(retained.report.stats.unexpected,1);
});
