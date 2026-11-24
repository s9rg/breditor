/** Validate actual results across Playwright’s separate project/file suites. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {installedNetworkSpecs} from "../../experiments/shared-browser/installed-network-specs.mjs";
import {sharedBrowserWebKitGroups} from "../shared-browser-runs.mjs";
import {sharedBrowserBatchProjects,validateSharedBrowserReport} from "./shared-browser-report.mjs";

const reportPath="target/shared-application-browser-report.json";
const projects=sharedBrowserBatchProjects({projects:["webkit*"],specs:installedNetworkSpecs},installedNetworkSpecs,
 sharedBrowserWebKitGroups(installedNetworkSpecs));
for(const [file,webkit] of projects)projects.set(file,["chromium","firefox",...webkit]);

export function validateApplicationNetworkReport(report){
 const {expected,skipped,unexpected,flaky}=report.stats;
 assert.ok(Number.isSafeInteger(expected)&&expected>0);
 assert.deepEqual({skipped,unexpected,flaky},{skipped:0,unexpected:0,flaky:0});
 const pilotCases=[
  "the first-party pilot opens independent participants and verifies an offline checkpoint after reload",
  "the pilot supports keyboard sign-in and checkpoint recovery at a narrow viewport",
 ];
 const pilotSpecs=report.suites.filter(suite=>suite.file==="network-demo.spec.mjs").flatMap(suite=>suite.specs??[]);
 for(const title of pilotCases){
  const tests=pilotSpecs.filter(spec=>spec.title===title).flatMap(spec=>spec.tests);
  assert.ok(tests.length,`Missing application network pilot case: ${title}`);
  const engines=tests.map(test=>{
   assert.deepEqual(test.results.map(result=>result.status),["passed"],title);
   return test.projectName.replace(/^webkit-[0-9]+$/,"webkit");
  }).sort();
  assert.deepEqual(engines,["chromium","firefox","webkit"],title);
 }
 validateSharedBrowserReport(report,projects);
}

export function verifyApplicationNetworkStage(directory,stage){
 if(stage.id!=="installed-application-network-matrix")return;
 const record=stage.artifacts.find(artifact=>artifact.path===reportPath);
 const retainedPath=`artifacts/${stage.id}/${reportPath}`;
 assert.ok(record?.retainedPath===retainedPath,"Missing retained application network report");
 const bytes=readFileSync(resolve(directory,retainedPath));
 assert.equal(createHash("sha256").update(bytes).digest("hex"),record.sha256,"Retained application network report changed");
 const evidence=JSON.parse(bytes);
 assert.equal(evidence.format,"breditor/installed-application-network");
 assert.equal(evidence.formatVersion,1);
 validateApplicationNetworkReport(evidence.report);
}
