/** Source qualification for a single held recovery-byte/current-state capture.
 * Runs the same mandatory cases as independently installed packages. */
import assert from 'node:assert/strict';import fs from 'node:fs';import {spawnSync,execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {join,dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {selectSharedRuntimeBuild} from './candidate-release/shared-runtime-evidence.mjs';
import {historicalSharedWasmSha256} from './fixtures/native-runtime/shared-runtime-receipt.mjs';
import {reconciledPacketTypes as types,reconciledPacketSelection,reconciledPacketReport,reconciledPacketBuildReport} from './reconciled-packet-recovery-plan.mjs';
import {checkReconciledPacketEvidence} from './reconciled-packet-recovery-evidence.mjs';
if(process.argv.length>3)throw Error('Choose one named packet recovery case or the complete matrix');
const selection=reconciledPacketSelection(process.argv[2]),{tests,count,pattern,timeoutMs}=selection;
const testArgs=['--test','--test-concurrency=1',...(pattern?['--test-name-pattern='+pattern]:[]),...tests.map(name=>'scripts/'+name)];
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),directory=fs.mkdtempSync(join(root,'target/reconciled-packet-recovery-source-qualification-')),source=sourceEvidence(root),sha=value=>createHash('sha256').update(value).digest('hex'),compiler=join(root,'node_modules/typescript/bin/tsc'),compilerSha256=sha(fs.readFileSync(compiler)),runtime=join(root,'packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(fs.readFileSync(runtime));
const sharedRuntime=selectSharedRuntimeBuild(root,source);
assert.equal(normalWasmSha256,sharedRuntime?.wasmSha256??historicalSharedWasmSha256);
const build=JSON.parse(fs.readFileSync(join(root,reconciledPacketBuildReport)));assert.equal(build.complete,true);assert.equal(build.exitCode,0);assert.deepEqual(build.source,source);for(const row of build.binaries)assert.equal(sha(fs.readFileSync(row.path)),row.sha256);
const state={format:'breditor/reconciled-packet-recovery-source-qualification',formatVersion:1,complete:false,case:selection.id,source,directory,tests:count,normalWasmSha256,sharedRuntimeReceiptSha256:sharedRuntime?.sha256??null,compilerSha256,releaseReady:false,v1GatesOpen:13};saveEvidence(join(directory,'running.json'),state);console.log(JSON.stringify({directory,phase:'strict-types-and-complete-genuine-native-workflows'}));
try{
 const typesLog=execFileSync(process.execPath,[compiler,'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',...types],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});fs.writeFileSync(join(directory,'types.log'),typesLog);
 const logPath=join(directory,'contracts.log'),fd=fs.openSync(logPath,'wx');let execution;
 try{execution=spawnSync(process.execPath,testArgs,{cwd:root,env:{...process.env,...sharedRuntime?.environment},stdio:['ignore',fd,fd],timeout:timeoutMs});}finally{fs.closeSync(fd);}
 assert.equal(execution.error,undefined);assert.equal(execution.status,0,'Read '+logPath);assert.ok(fs.statSync(logPath).size<=8*1024*1024);const log=fs.readFileSync(logPath,'utf8');
 for(const [key,value] of [['tests',count],['pass',count],['fail',0],['skipped',0],['cancelled',0],['todo',0]]){
  const observed=new RegExp('^# '+key+' (\\d+)$','m').exec(log)?.[1];
  assert.equal(observed,String(value),'Reconciled packet '+key+' count');
 }
 const observations=checkReconciledPacketEvidence(log,selection.id);
 assert.deepEqual(sourceEvidence(root),source);for(const row of build.binaries)assert.equal(sha(fs.readFileSync(row.path)),row.sha256);assert.equal(sha(fs.readFileSync(compiler)),compilerSha256);assert.equal(sha(fs.readFileSync(runtime)),normalWasmSha256);
 Object.assign(state,{complete:true,passed:true,sourceUnchanged:true,strictPublicTypes:true,observations,log:logPath,logSha256:sha(log)});saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,reconciledPacketReport('source',selection.id)),state);console.log(JSON.stringify({directory,passed:true,tests:count,sourceUnchanged:true}));
}catch(error){saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;}
