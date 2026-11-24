import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {test} from "node:test";
import {validateDefaultBrowserReport} from "./candidate-release/default-browser-report.mjs";
import {releaseChecks,runReleaseChecks} from "./verify-release.mjs";

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
