/** Collect event-to-DOM latency from the independently installed SDK consumer. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync,realpathSync} from "node:fs";
import {basename,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {saveEvidence,sourceEvidence} from "./candidate-release/evidence.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
const receipt=resolve(process.argv[2]??join(root,"target/editor-installed-consumer.json"));
assert.ok(process.argv.length<=3,"Usage: node scripts/record-installed-input-latency.mjs [installed-sdk-receipt.json]");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const digest=path=>sha(readFileSync(path));
const source=sourceEvidence(root);
assert.ok(source.commit&&!source.dirty,"Check out one clean source for the installed input measurement");

function servedFiles(directory,prefix=""){
 return readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
  const path=`${prefix}/${entry.name}`,local=join(directory,entry.name);
  if(entry.isDirectory())return servedFiles(local,path);
  return entry.isFile()&&/\.(?:html|js|css|wasm)$/u.test(entry.name)?[{path,sha256:digest(local)}]:[];
 });
}

function installedInput(){
 const bytes=readFileSync(receipt),installed=JSON.parse(bytes),consumer=realpathSync(installed.consumer);
 assert.deepEqual(installed.archiveEvidence.map(archive=>archive.name),
  ["@breditor/browser","@breditor/experimental-rich-content","@breditor/collaboration","@breditor/editor"]);
 assert.equal(installed.archives.length,installed.archiveEvidence.length);
 const archives=installed.archiveEvidence.map(({name,filename,sha256},index)=>{
  const path=installed.archives[index];
  assert.equal(basename(path),filename);
  assert.equal(digest(path),sha256,`Installed archive changed: ${filename}`);
  return {name,filename,sha256};
 });
 const bundle=servedFiles(join(consumer,"dist"));
 return {consumer,archives,bundle,receiptSha256:sha(bytes),wasmSha256:digest(join(consumer,"node_modules/@breditor/experimental-rich-content/dist/breditor_wasm_bg.wasm"))};
}
const inputs=installedInput();
const {status,stdout,stderr,error}=spawnSync(process.execPath,["node_modules/@playwright/test/cli.js","test","-c",
 "experiments/editor-browser-latency/playwright.config.mjs","--reporter=line"],{
 cwd:root,env:{...process.env,FORCE_COLOR:"0",BREDITOR_EDITOR_CONSUMER:inputs.consumer},encoding:"utf8",timeout:240000,maxBuffer:1024*1024,
});
if(stdout)process.stdout.write(stdout);
if(stderr)process.stderr.write(stderr);
if(error)throw error;
assert.equal(status,0,"Installed input measurement failed");
const records=stdout.split(/\r?\n/).filter(line=>line.startsWith('{"format":"breditor/installed-input-latency",'));
assert.equal(records.length,1);
const measured=JSON.parse(records[0]);
assert.equal(measured.formatVersion,1);
assert.equal(measured.wasmSha256,inputs.wasmSha256,"Chrome loaded different local Wasm bytes");
const files=new Map(inputs.bundle.map(({path,sha256})=>[path,sha256]));
assert.ok(measured.served.some(({path})=>path==="/")&&measured.served.some(({path})=>path.endsWith(".js"))&&
 measured.served.some(({path})=>path.endsWith(".wasm")),"Missing observed installed assets");
for(const {path,sha256} of measured.served){
 assert.equal(sha256,files.get(path==="/"?"/index.html":path),`Chrome loaded different bytes for ${path}`);
}
assert.deepEqual(measured.rows.map(row=>row.paragraphs),[16,128]);
assert.equal(measured.pasteBytes,1000);
for(const row of measured.rows){
 assert.ok(Number.isFinite(row.openMs)&&row.openMs>=0&&row.topLevelBlocks>=row.paragraphs);
 assert.ok(Number.isSafeInteger(row.documentBytes)&&row.documentBytes>0);
 assert.match(row.documentSha256,/^[a-f0-9]{64}$/u);
 assert.deepEqual(Object.keys(row.metrics).sort(),["paste","typing","undoPaste","undoTyping"]);
 for(const metric of Object.values(row.metrics))assert.ok(metric.samples===20&&Number.isFinite(metric.p50)&&
  Number.isFinite(metric.p95)&&metric.p50>=0&&metric.p95>=metric.p50);
}
assert.deepEqual(installedInput(),inputs,"Installed input measurement changed its inputs");
assert.deepEqual(sourceEvidence(root),source,"Source changed during installed input measurement");
saveEvidence(resolve(root,"target/installed-input-latency.json"),{...measured,source,
 installed:{receiptSha256:inputs.receiptSha256,archives:inputs.archives,bundleSha256:sha(JSON.stringify(inputs.bundle))}});
