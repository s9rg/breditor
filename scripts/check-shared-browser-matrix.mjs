// Same coverage-preserving process isolation used by the legacy collaboration matrix.
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {nativeAdmissionDriver} from "../experiments/shared-browser/native-relay.mjs";
import config from "../experiments/shared-browser/playwright.config.mjs";
import {candidateBrowserRelay} from "./check-editor-browser.mjs";
import {sharedBrowserRuns} from "./shared-browser-runs.mjs";

const args=process.argv.slice(2);
const candidate=args.length===1&&args[0]==="--candidate-relay";
if(args.length&&!candidate)throw Error("Usage: node scripts/check-shared-browser-matrix.mjs [--candidate-relay]");

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const discovered=readdirSync(resolve(root,"experiments/shared-browser")).filter(name=>name.endsWith(".spec.mjs"));
const runs=sharedBrowserRuns(config.testMatch,discovered);
const env=candidate?{...process.env,BREDITOR_BROWSER_RELAY_EXE:candidateBrowserRelay(root),BREDITOR_SHARED_INSTALLED:""}:process.env;
const outputDirectory=resolve(root,"target/shared-browser-results"),reports=[];
const driverSha256=()=>createHash("sha256").update(readFileSync(nativeAdmissionDriver)).digest("hex");
const nativeAdmissionSha256=candidate?driverSha256():undefined;
console.log("Shared WebKit uses fresh per-file processes; every discovered spec runs once, without retries or relaxed assertions");
for(const run of runs){
 const suite=run.specs[0]??"chromium-firefox";
 const output=resolve(outputDirectory,suite),reportPath=resolve(outputDirectory,suite+".json");
 const command=["test","--config","experiments/shared-browser/playwright.config.mjs",...run.projects.map(project=>"--project="+project),...run.patterns];
 if(candidate){
  mkdirSync(outputDirectory,{recursive:true});
  command.push("--output="+output,"--reporter=line,json");
 }
 execFileSync(process.execPath,["node_modules/@playwright/test/cli.js",...command],{
  cwd:root,env:candidate?{...env,PLAYWRIGHT_JSON_OUTPUT_FILE:reportPath}:env,stdio:"inherit",
 });
 if(candidate){
  const report=JSON.parse(readFileSync(reportPath,"utf8"));
  const {expected,skipped,unexpected,flaky}=report.stats;
  if(!Number.isSafeInteger(expected)||expected<1||skipped!==0||unexpected!==0||flaky!==0){
   throw Error("Shared browser batch did not pass every case: "+suite);
  }
  reports.push({suite,projects:run.projects,report});
 }
}
if(candidate){
 if(driverSha256()!==nativeAdmissionSha256)throw Error("The Native admission driver changed during the shared browser matrix");
 writeFileSync(resolve(root,"target/shared-browser-report.json"),JSON.stringify({nativeAdmissionSha256,runs:reports})+"\n");
}
