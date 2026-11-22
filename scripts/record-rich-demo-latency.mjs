/** Retain the bounded browser-event and command measurements from the rich demo. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdirSync,realpathSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {saveEvidence} from "./candidate-release/evidence.mjs";

const engines=["chromium","firefox","webkit"];
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const format="breditor/rich-demo-latency";
export const richDemoLatencyReport="target/rich-demo-latency.json";

export function measuredBrowserLatency(output){
 const measurements=output.split(/\r?\n/).filter(line=>line.startsWith(`{"format":"${format}",`))
  .map(line=>JSON.parse(line)).sort((a,b)=>a.browser.localeCompare(b.browser));
 assert.deepEqual(measurements.map(row=>row.browser),engines,"Expected one latency sample set per engine");
 const duration=value=>Number.isFinite(value)&&value>=0;
 for(const row of measurements){
  assert.equal(row.formatVersion,1);
  assert.ok([row.browserVersion,row.node,row.platform,row.arch].every(value=>typeof value==="string"&&value.length));
  assert.ok(duration(row.readyMs));
  assert.deepEqual(Object.keys(row.commands).sort(),["insert","redo","undo"]);
  assert.equal(row.clipboard.method,"synthetic-plain-text-paste-event");
  assert.equal(row.clipboard.bytes,1000);
  for(const metric of [...Object.values(row.commands),row.clipboard]){
   assert.equal(metric.samples,25);
   assert.ok(duration(metric.p50)&&duration(metric.p95)&&metric.p95>=metric.p50);
  }
 }
 return measurements;
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==2)throw Error("Usage: node scripts/record-rich-demo-latency.mjs");
 const {status,stdout,stderr,error}=spawnSync(process.execPath,[
  "node_modules/@playwright/test/cli.js","test","-c","experiments/rich-browser/playwright.config.mjs",
  "--output","target/rich-demo-latency-playwright","/demo-latency\\.spec\\.mjs$",
 ],{cwd:root,env:{...process.env,FORCE_COLOR:"0"},encoding:"utf8",timeout:180000,maxBuffer:1024*1024});
 if(stdout)process.stdout.write(stdout);
 if(stderr)process.stderr.write(stderr);
 if(error)throw error;
 assert.equal(status,0,"Rich demo latency browser checks failed");
 const measurements=measuredBrowserLatency(stdout),path=resolve(root,richDemoLatencyReport);
 mkdirSync(dirname(path),{recursive:true});
 saveEvidence(path,{format:"breditor/rich-demo-latency-matrix",formatVersion:1,measurements});
}
