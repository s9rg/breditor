import assert from "node:assert/strict";
import {test} from "node:test";
import {sharedBrowserBatchProjects,validateSharedBrowserReport} from "./candidate-release/shared-browser-report.mjs";
import {sharedBrowserRuns} from "./shared-browser-runs.mjs";

const files=["editing.spec.mjs","relay.spec.mjs"];
const runs=sharedBrowserRuns(files,files);
const projects=[{name:"webkit-1",testMatch:["**/editing.spec.mjs"]},{name:"webkit-2",testMatch:["**/relay.spec.mjs"]}];

function report(expected){
 return {stats:{expected:[...expected.values()].flat().length,skipped:0,unexpected:0,flaky:0},errors:[],suites:
  [...expected].map(([file,names])=>({file,suites:[{title:"shared behavior",specs:names.map(project=>({
   id:`${file}-${project}`,title:"the same test on each engine",file,line:1,column:1,tests:[{
   projectName:project,projectId:project,expectedStatus:"passed",status:"expected",results:[{status:"passed"}],
   }],
  }))}]}))};
}

test("shared qualification binds executed cases to every planned file and exact project group",()=>{
 const first=sharedBrowserBatchProjects(runs[0],files,projects);
 assert.deepEqual([...first],files.map(file=>[file,["chromium","firefox"]]));
 const webkit=sharedBrowserBatchProjects(runs[2],files,projects);
 assert.deepEqual([...webkit],[["relay.spec.mjs",["webkit-2"]]]);
 validateSharedBrowserReport(report(first),first);
 validateSharedBrowserReport(report(webkit),webkit);
 assert.throws(()=>sharedBrowserBatchProjects(runs[2],files,[projects[1],{...projects[1],name:"webkit-3"}]),/one WebKit project/);
 assert.throws(()=>validateSharedBrowserReport(report(new Map([[files[1],["webkit-1"]]])),webkit),/wrong project set/);
});

test("successful summary counters do not conceal omitted files, missing projects or failing results",()=>{
 const expected=sharedBrowserBatchProjects(runs[0],files,projects);
 const missing=report(new Map([[files[0],["chromium","firefox"]]]));
 assert.throws(()=>validateSharedBrowserReport(missing,expected),/omitted a planned spec file/);
 const singleEngine=report(new Map(files.map(file=>[file,["chromium"]])));
 assert.throws(()=>validateSharedBrowserReport(singleEngine,expected),/wrong project set/);
 const repeated=report(expected);
 repeated.suites.push(repeated.suites[0]);
 assert.throws(()=>validateSharedBrowserReport(repeated,expected),/unexpected or repeated file/);
 const displaced=report(expected);
 for(const spec of displaced.suites[0].suites[0].specs)spec.file=files[1];
 assert.throws(()=>validateSharedBrowserReport(displaced,expected),/registered outside its entry file/);
 for(const spec of displaced.suites[0].suites[0].specs)spec.file="../rich-browser/standard-toolbar-checks.mjs";
 assert.throws(()=>validateSharedBrowserReport(displaced,expected),/registered outside its entry file/);
 const skipped=report(expected);
 skipped.suites[0].suites[0].specs[0].tests[0].results[0].status="skipped";
 assert.throws(()=>validateSharedBrowserReport(skipped,expected),/Missing passing/);
 const mismatched=report(expected);
 mismatched.stats.expected++;
 assert.throws(()=>validateSharedBrowserReport(mismatched,expected),/count differs/);
});

test("the shared toolbar entry admits its existing helper-registered cases",()=>{
 const expected=new Map([["standard-toolbar.spec.mjs",["chromium","firefox"]]]),recorded=report(expected);
 for(const spec of recorded.suites[0].suites[0].specs)spec.file="../rich-browser/standard-toolbar-checks.mjs";
 validateSharedBrowserReport(recorded,expected);
});
