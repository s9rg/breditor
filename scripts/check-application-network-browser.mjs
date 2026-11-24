/** Run the application network matrix from the fresh installed SDK consumer. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync,realpathSync} from "node:fs";
import {basename,join} from "node:path";
import {fileURLToPath} from "node:url";
import {candidateBrowserRelay} from "./check-editor-browser.mjs";
import {saveEvidence} from "./candidate-release/evidence.mjs";
import {validateApplicationNetworkReport} from "./candidate-release/application-network-report.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
const readJson=path=>JSON.parse(readFileSync(path,"utf8"));
const digest=path=>createHash("sha256").update(readFileSync(path)).digest("hex");
const installed=readJson(join(root,"target/editor-installed-consumer.json"));
const relay=candidateBrowserRelay(root);
const consumer=realpathSync(installed.consumer);
const wasmPath="node_modules/@breditor/collaboration/dist/runtime/breditor_shared_bg.wasm";
const rawReport=join(root,"target/shared-application-browser-playwright.json");

function measureInputs(){
 assert.equal(installed.archives.length,installed.archiveEvidence.length);
 const archives=installed.archiveEvidence.map(({filename,name,sha256},index)=>{
  const path=installed.archives[index];
  assert.equal(basename(path),filename);
  assert.equal(digest(path),sha256,`Installed archive changed: ${filename}`);
  return {name,filename,sha256};
 });
 return {
  archives,
  sharedWasmSha256:digest(join(consumer,wasmPath)),
  relaySha256:digest(relay),
  vectorSha256:digest(join(root,"target/collaboration-feasibility-web/native-vector.json")),
  rasterFixturesSha256:digest(join(root,"target/relay-raster-fixtures.json")),
 };
}

const inputs=measureInputs();
assert.equal(inputs.sharedWasmSha256,digest(join(root,"packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm")));
execFileSync(process.execPath,["node_modules/@playwright/test/cli.js","test","--config",
 "experiments/shared-browser/application-network.config.mjs","--reporter=line,json"],{
 cwd:root,env:{...process.env,BREDITOR_BROWSER_RELAY_EXE:relay,PLAYWRIGHT_JSON_OUTPUT_FILE:rawReport},stdio:"inherit",
});
const report=readJson(rawReport);
validateApplicationNetworkReport(report);
assert.deepEqual(measureInputs(),inputs,"Installed application network inputs changed during qualification");
saveEvidence(join(root,"target/shared-application-browser-report.json"),{
 format:"breditor/installed-application-network",formatVersion:1,inputs,report,
});
