/** Reproducible source qualification for exact saved-client/server inspection.
 * Runs the identical mandatory cases as independent installed packages. */
import assert from 'node:assert/strict';import fs from 'node:fs';import {spawnSync,execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {join,dirname,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {sourceResolutionTests as tests,sourceResolutionTypes as types,sourceResolutionCaseCount as count} from './pending-source-resolution-plan.mjs';
if(process.argv.length!==2)throw Error('All original and complete portable Native cases are mandatory');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),directory=fs.mkdtempSync(join(root,'target/pending-source-resolution-source-qualification-')),source=sourceEvidence(root),sha=value=>createHash('sha256').update(value).digest('hex'),compiler=join(root,'node_modules/typescript/bin/tsc'),compilerSha256=sha(fs.readFileSync(compiler)),runtime=join(root,'packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(fs.readFileSync(runtime));
assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/pending-source-resolution-source-qualification',formatVersion:1,complete:false,source,directory,tests:count,normalWasmSha256,compilerSha256,releaseReady:false,v1GatesOpen:13};saveEvidence(join(directory,'running.json'),state);console.log(JSON.stringify({directory,phase:'strict-types-and-complete-genuine-native-workflows'}));
try{
 const typesLog=execFileSync(process.execPath,[compiler,'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM',...types],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});fs.writeFileSync(join(directory,'types.log'),typesLog);
 const logPath=join(directory,'contracts.log'),fd=fs.openSync(logPath,'wx');let execution;
 try{execution=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests.map(name=>'scripts/'+name)],{cwd:root,stdio:['ignore',fd,fd],timeout:7200000});}finally{fs.closeSync(fd);}
 assert.equal(execution.error,undefined);assert.equal(execution.status,0,'Read '+logPath);assert.ok(fs.statSync(logPath).size<=8*1024*1024);const log=fs.readFileSync(logPath,'utf8');
 for(const[key,n]of [['tests',count],['pass',count],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 for(const marker of ['COMPLETE_PACKET_INSPECTION_STEP all-native-packet-receipt-and-raster-facts-verified','COMPLETE_PACKET_INSPECTION_STEP genuine-owner-refusals','SAVED_NATIVE_REPLAY','PENDING_SOURCE_RESOLUTION_COHORT','PENDING_SOURCE_NATIVE_READ','PENDING_SOURCE_PRIVATE_NATIVE'])assert.ok(log.includes(marker),marker);
 assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(compiler)),compilerSha256);assert.equal(sha(fs.readFileSync(runtime)),normalWasmSha256);
 Object.assign(state,{complete:true,passed:true,sourceUnchanged:true,strictPublicTypes:true,log:logPath,logSha256:sha(log)});saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/pending-source-resolution-source-qualification.json'),state);console.log(JSON.stringify({directory,passed:true,tests:count,sourceUnchanged:true}));
}catch(error){saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;}
