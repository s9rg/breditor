import assert from "node:assert/strict";
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {test} from "node:test";
import {installedNetworkSpecs} from "../experiments/shared-browser/installed-network-specs.mjs";
import {validateApplicationNetworkReport,verifyApplicationNetworkStage} from "./candidate-release/application-network-report.mjs";
import {fileEvidence} from "./candidate-release/evidence.mjs";

const pilotTitles=[
 "the first-party pilot opens independent participants and verifies an offline checkpoint after reload",
 "the pilot supports keyboard sign-in and checkpoint recovery at a narrow viewport",
];
const projectNames=["chromium","firefox","webkit-1"];

function testReport(){
 const suites=installedNetworkSpecs.map(file=>{
  const titles=file==="network-demo.spec.mjs"?pilotTitles:["first source case","second source case"];
  const registered=file==="standard-toolbar.spec.mjs"?"../rich-browser/standard-toolbar-checks.mjs":file;
  return {file,specs:projectNames.flatMap(project=>titles.map((title,index)=>({
   id:`${file}-${project}-${index}`,file:registered,line:index+1,column:1,title,
   tests:[{projectName:project,projectId:project,status:"expected",expectedStatus:"passed",results:[{status:"passed"}]}],
  })))};
 });
 return {suites,errors:[],stats:{expected:suites.reduce((sum,suite)=>sum+suite.specs.length,0),skipped:0,unexpected:0,flaky:0}};
}

function omitFirefoxCase(report){
 const suite=report.suites.find(suite=>suite.file==="inline-presentation.spec.mjs");
 suite.specs.splice(suite.specs.findIndex(spec=>spec.title==="first source case"&&spec.tests[0].projectName==="firefox"),1);
 report.stats.expected--;
}

test("installed application proof requires all configured file and project results alongside the pilot cases",()=>{
 validateApplicationNetworkReport(testReport());
 const omitted=testReport();
 omitFirefoxCase(omitted);
 assert.throws(()=>validateApplicationNetworkReport(omitted),/wrong project set in inline-presentation.spec.mjs/);
 const wrongGroup=testReport();
 for(const spec of wrongGroup.suites[0].specs)if(spec.tests[0].projectName==="webkit-1"){
  spec.tests[0].projectName=spec.tests[0].projectId="webkit-2";
 }
 assert.throws(()=>validateApplicationNetworkReport(wrongGroup),/wrong project set in inline-presentation.spec.mjs/);
 const omittedPilot=testReport(),pilot=omittedPilot.suites.find(suite=>suite.file==="network-demo.spec.mjs");
 pilot.specs=pilot.specs.filter(spec=>spec.title!==pilotTitles[0]);
 omittedPilot.stats.expected-=3;
 assert.throws(()=>validateApplicationNetworkReport(omittedPilot),/offline checkpoint after reload/);
});

test("retained installed application reports are reviewed even when their file hash matches",t=>{
 const directory=mkdtempSync(join(tmpdir(),"breditor-application-coverage-"));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const id="installed-application-network-matrix",path="target/shared-application-browser-report.json";
 const retainedPath=`artifacts/${id}/${path}`;
 const filename=join(directory,retainedPath);
 mkdirSync(dirname(filename),{recursive:true});
 const retain=report=>{
  writeFileSync(filename,JSON.stringify({format:"breditor/installed-application-network",formatVersion:1,report}));
  return {id,artifacts:[{...fileEvidence(directory,retainedPath),path,retainedPath}]};
 };
 verifyApplicationNetworkStage(directory,retain(testReport()));
 const omitted=testReport();
 omitFirefoxCase(omitted);
 assert.throws(()=>verifyApplicationNetworkStage(directory,retain(omitted)),/wrong project set in inline-presentation.spec.mjs/);
});
