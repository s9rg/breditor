/** Run the application network matrix from the fresh installed SDK consumer. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdtempSync,readFileSync,realpathSync} from "node:fs";
import {basename,join} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateBrowserRelay} from "./check-editor-browser.mjs";
import {saveEvidence,sourceEvidence} from "./candidate-release/evidence.mjs";
import {validateApplicationNetworkReport} from "./candidate-release/application-network-report.mjs";
import {validateSharedBrowserDiscovery} from "./candidate-release/shared-browser-report.mjs";
import {installedNetworkSpecs} from "../experiments/shared-browser/installed-network-specs.mjs";
import {sharedBrowserWebKitGroups} from "./shared-browser-runs.mjs";

const args=process.argv.slice(2),lifecycle=args[0]==="--lifecycle-repetitions";
assert.ok(!args.length||lifecycle&&args.length===2&&/^[2-5]$/u.test(args[1]),
 "Usage: node scripts/check-application-network-browser.mjs [--lifecycle-repetitions 2–5]");

const root=fileURLToPath(new URL("../",import.meta.url));
const readJson=path=>JSON.parse(readFileSync(path,"utf8"));
const digest=path=>createHash("sha256").update(readFileSync(path)).digest("hex");
const installedReceipt=join(root,"target/editor-installed-consumer.json");
const relay=candidateBrowserRelay(root);
const wasmPath="node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm";
const rawReport=join(root,"target/shared-application-browser-playwright.json");

function measureInputs(){
 const receipt=readFileSync(installedReceipt),installed=JSON.parse(receipt);
 const consumer=realpathSync(installed.consumer);
 assert.equal(installed.archives.length,installed.archiveEvidence.length);
 const archives=installed.archiveEvidence.map(({filename,name,sha256},index)=>{
  const path=installed.archives[index];
  assert.equal(basename(path),filename);
  assert.equal(digest(path),sha256,`Installed archive changed: ${filename}`);
  return {name,filename,sha256};
 });
 return {
  ...(lifecycle?{installedReceiptSha256:createHash("sha256").update(receipt).digest("hex"),consumer}:{}),
  archives,
  sharedWasmSha256:digest(join(consumer,wasmPath)),
  relaySha256:digest(relay),
  vectorSha256:digest(join(root,"target/collaboration-feasibility-web/native-vector.json")),
  rasterFixturesSha256:digest(join(root,"target/relay-raster-fixtures.json")),
 };
}

const inputs=measureInputs();
assert.equal(inputs.sharedWasmSha256,digest(join(root,"packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm")));
const command=["node_modules/@playwright/test/cli.js","test","--config","experiments/shared-browser/application-network.config.mjs"];
const consumerPin=lifecycle?{BREDITOR_SHARED_INSTALLED_RECEIPT_SHA256:inputs.installedReceiptSha256}:{};
const run=(parameters,output)=>execFileSync(process.execPath,[...command,...parameters],{
 cwd:root,env:{...process.env,...consumerPin,BREDITOR_BROWSER_RELAY_EXE:relay,PLAYWRIGHT_JSON_OUTPUT_FILE:output},stdio:"inherit",
});
if(!lifecycle){
 run(["--reporter=line,json"],rawReport);
 const report=readJson(rawReport);
 validateApplicationNetworkReport(report);
 assert.deepEqual(measureInputs(),inputs,"Installed application network inputs changed during qualification");
 saveEvidence(join(root,"target/shared-application-browser-report.json"),{
  format:"breditor/installed-application-network",formatVersion:1,inputs,report,
 });
}else{
 const source=sourceEvidence(root),requested=Number(args[1]);
 assert.ok(source.commit&&!source.dirty,"Check out one clean installed network lifecycle candidate");
 const directory=mkdtempSync(join(root,"target/installed-network-lifecycle-"));
 const manifest=join(directory,"result.json"),discovery=join(directory,"discovery.json");
 const file="network-demo.spec.mjs",selection="(^|[/\\\\])network-demo\\.spec\\.mjs$";
 const webkit=sharedBrowserWebKitGroups(installedNetworkSpecs).find(group=>group.testMatch.includes(`**/${file}`)).name;
 const expected=new Map([[file,["chromium","firefox",webkit]]]);
 const result={format:"breditor/installed-network-lifecycle",formatVersion:1,source,inputs,requested,status:"running",rounds:[]};
 saveEvidence(manifest,result);
 try{
  run([selection,"--list","--reporter=json"],discovery);
  const discovered=readJson(discovery);
  result.discoverySha256=digest(discovery);
  for(let round=1;round<=requested;round++){
   const reportFile=`round-${round}.json`,output=join(directory,reportFile);
   const record={round,reportFile,status:"failed"};
   result.rounds.push(record);
   let cases;
   try{
    run([selection,"--reporter=line,json",`--output=${join(directory,`artifacts-${round}`)}`],output);
    cases=validateSharedBrowserDiscovery(discovered,readJson(output),expected).length;
   }catch(error){
    // Keep the other fresh rounds observable and preserve any failed JSON and traces.
    record.reason="browser-round";
    console.error(`Installed lifecycle round ${round}: ${error.message}`);
   }
   if(existsSync(output))record.reportSha256=digest(output);
   try{
    assert.deepEqual(sourceEvidence(root),source,"Source changed during installed lifecycle qualification");
    assert.deepEqual(measureInputs(),inputs,"Installed application network inputs changed during lifecycle qualification");
   }catch(error){
    record.reason="input-provenance";
    throw error;
   }
   if(cases!==undefined)Object.assign(record,{status:"passed",cases});
   saveEvidence(manifest,result);
  }
  result.status=result.rounds.every(round=>round.status==="passed")?"passed":"failed";
  process.exitCode=result.status==="passed"?0:1;
 }catch(error){
  result.status="failed";
  throw error;
 }finally{
  saveEvidence(manifest,result);
  console.log(`Installed network lifecycle results: ${manifest}`);
 }
}
