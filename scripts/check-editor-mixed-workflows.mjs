/** Focused installed, independent-process functional acceptance. No browser matrix or deployment. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,cpSync,readdirSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),args=process.argv.slice(2),reuse=args.includes("--reuse-installed"),binary=resolve(args.find(a=>a!=="--reuse-installed")??join(root,"target/relay-native/release/examples/transport_v2_functional"));
if(!reuse)execFileSync(process.execPath,["scripts/check-interchange-package.mjs"],{cwd:root,stdio:"inherit"});
const installed=JSON.parse(readFileSync(join(root,"target/interchange-installed-consumer.json"),"utf8"));assert.equal(installed.passed,true);const consumer=installed.consumer,hash=b=>createHash("sha256").update(b).digest("hex");
let compared=0;
function compareFiles(path,relative=""){
 for(const entry of readdirSync(join(path,relative),{withFileTypes:true})){
  if(entry.name==="node_modules")continue;
  const file=join(relative,entry.name);
  if(entry.isDirectory()){compareFiles(path,file);continue;}
  if(!/\.(?:js|ts|wasm)$/.test(entry.name))continue;
  const packageName=path.slice(path.indexOf("node_modules/")+13),source=join(root,"packages",`breditor-${packageName.split("/")[1]}`,file);
  assert.equal(hash(readFileSync(join(path,file))),hash(readFileSync(source)),`Installed artifact is not current: ${packageName}/${file}`);compared++;
 }
}
for(const item of installed.archives){assert.equal(hash(readFileSync(item.path)),item.sha256);compareFiles(join(consumer,"node_modules",item.name));}
for(const name of ["mixed-peer.mjs","mixed-workflow.mjs","pixel.mjs"])cpSync(join(root,"scripts/fixtures/interchange-consumer",name),join(consumer,name));cpSync(join(root,"scripts/fixtures/editor-consumer/coverage-seed.mjs"),join(consumer,"coverage-seed.mjs"));for(const name of ["word","google-docs","excel"])cpSync(join(root,`packages/breditor-interchange/tests/fixtures/${name}.html`),join(consumer,`${name}.html`));
const runs=[];
for(const history of ["explicit","typing-v1"]){
 try{const result=JSON.parse(execFileSync(process.execPath,["mixed-workflow.mjs",binary,history],{cwd:consumer,encoding:"utf8",timeout:600000,maxBuffer:1024*1024}));assert.equal(result.passed,true);runs.push(result);console.log(JSON.stringify({history,passed:true,maximumJournalBytes:result.maximumJournalBytes,exactFutureWriterCheckpoints:result.exactFutureWriterCheckpoints}));}
 catch(error){console.error(error.stderr?.slice(-6000)??error.message);process.exit(1);}
}
for(const run of runs){assert.equal(run.sharedWasmSha256,runs[0].sharedWasmSha256);assert.equal(run.nativeRelaySha256,runs[0].nativeRelaySha256);}
const result={...runs[0],histories:runs.flatMap(r=>r.histories),hostStartups:runs.flatMap(r=>r.hostStartups.map(s=>({history:r.histories[0],...s}))),maximumJournalBytes:Math.max(...runs.map(r=>r.maximumJournalBytes)),retainedDirectories:runs.flatMap(r=>r.retainedDirectories)};
for(const name of ["consumerProcesses","cases","comparisons","exactRestores","exactFutureWriterCheckpoints","uploads","downloads","serverRestarts","foreignPastes","atomicEnters","compositions","knownNoopAdmissions"])result[name]=runs.reduce((sum,r)=>sum+r[name],0);
const report={...result,historyProcessIsolation:true,perHistoryTimeoutMs:600000,currentInstalledArtifactFilesCompared:compared,consumer,archives:installed.archives,strictConsumerTypes:installed.strictConsumerTypes,defaultForeignParserModules:installed.defaultForeignParserModules};writeFileSync(join(root,"target/editor-mixed-workflows.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
