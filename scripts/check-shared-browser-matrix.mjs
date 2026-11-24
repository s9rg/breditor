// Same coverage-preserving process isolation used by the legacy collaboration matrix.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,statSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {nativeComparisonDriver} from "../experiments/collaboration/browser/compare-exports.mjs";
import {nativeAdmissionDriver} from "../experiments/shared-browser/native-relay.mjs";
import config from "../experiments/shared-browser/playwright.config.mjs";
import {candidateBrowserRelay} from "./check-editor-browser.mjs";
import {sharedBrowserRuns} from "./shared-browser-runs.mjs";
import {sharedBrowserBatchProjects,validateSharedBrowserDiscovery} from "./candidate-release/shared-browser-report.mjs";

const args=process.argv.slice(2);
const candidate=args.length===1&&args[0]==="--candidate-relay";
if(args.length&&!candidate)throw Error("Usage: node scripts/check-shared-browser-matrix.mjs [--candidate-relay]");

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const discovered=readdirSync(resolve(root,"experiments/shared-browser")).filter(name=>name.endsWith(".spec.mjs"));
const runs=sharedBrowserRuns(config.testMatch,discovered);
const env=candidate?{...process.env,BREDITOR_BROWSER_RELAY_EXE:candidateBrowserRelay(root),BREDITOR_SHARED_INSTALLED:""}:process.env;
const outputDirectory=resolve(root,"target/shared-browser-results"),reports=[];
const nativeFixtureHashes=()=>[nativeAdmissionDriver,nativeComparisonDriver].map(path=>({
 name:basename(path),sha256:createHash("sha256").update(readFileSync(path)).digest("hex"),
}));
const nativeFixtures=candidate?nativeFixtureHashes():undefined;
function discoverCases(command){
 const directory=mkdtempSync(resolve(tmpdir(),"breditor-shared-browser-discovery-"));
 try{
  const report=resolve(directory,"cases.json");
  execFileSync(process.execPath,["node_modules/@playwright/test/cli.js",...command,"--list","--reporter=json"],{
   cwd:root,env:{...env,PLAYWRIGHT_JSON_OUTPUT_FILE:report},stdio:["ignore","ignore","inherit"],
  });
  const info=statSync(report);
  assert.ok(info.isFile()&&info.size<=32*1024*1024,"Expected a bounded shared browser discovery report");
  return JSON.parse(readFileSync(report,"utf8"));
 }finally{rmSync(directory,{recursive:true,force:true});}
}
console.log("Shared WebKit uses fresh per-file processes; every discovered spec runs once, without retries or relaxed assertions");
for(const run of runs){
 const suite=run.specs[0]??"chromium-firefox";
 const output=resolve(outputDirectory,suite),reportPath=resolve(outputDirectory,suite+".json");
 const command=["test","--config","experiments/shared-browser/playwright.config.mjs",...run.projects.map(project=>"--project="+project),...run.patterns];
 const discovery=candidate?discoverCases(command):undefined;
 if(candidate){
  mkdirSync(outputDirectory,{recursive:true});
  rmSync(reportPath,{force:true});
  command.push("--output="+output,"--reporter=line,json");
 }
 execFileSync(process.execPath,["node_modules/@playwright/test/cli.js",...command],{
  cwd:root,env:candidate?{...env,PLAYWRIGHT_JSON_OUTPUT_FILE:reportPath}:env,stdio:"inherit",
 });
 if(candidate){
  const report=JSON.parse(readFileSync(reportPath,"utf8"));
  const discoveredCases=validateSharedBrowserDiscovery(discovery,report,sharedBrowserBatchProjects(run,discovered,config.projects));
  reports.push({suite,projects:run.projects,discoveredCases,report});
 }
}
if(candidate){
 assert.deepEqual(nativeFixtureHashes(),nativeFixtures,"Native fixtures changed during the shared browser matrix");
 writeFileSync(resolve(root,"target/shared-browser-report.json"),JSON.stringify({nativeFixtures,runs:reports})+"\n");
}
