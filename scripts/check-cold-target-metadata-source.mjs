/** Qualification of actual cold-target metadata lifetime plus the
 * existing cold execution and source/metadata lifetime contracts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
if(process.argv.length!==2)throw Error('All cold-target and existing lifetime regression cases are mandatory');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=fs.mkdtempSync(join(root,'target/cold-target-metadata-source-')),sha=value=>createHash('sha256').update(value).digest('hex');
const tests=['cold-joint-metadata-target.test.mjs','cold-room-execution-sdk.test.mjs','native-joint-source-metadata.test.mjs'];
const binary=join(root,'target/owned-history-relay-native/release/examples/complete_cohort_control_functional'),nativeBinarySha256=sha(fs.readFileSync(binary));
const runtime=join(root,'packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(fs.readFileSync(runtime));
assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/cold-target-metadata-source-qualification',formatVersion:1,complete:false,source,directory,nativeBinarySha256,normalWasmSha256,cases:12,v1Ready:false,wholeRoomActivated:false,v1GatesOpen:13};
saveEvidence(join(directory,'running.json'),state);console.log(JSON.stringify({directory,phase:'strict-private-types-and-real-cold-target-lifetimes'}));
try{
 const types=execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM','scripts/fixtures/cold-joint-target/types.mts'],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 fs.writeFileSync(join(directory,'types.log'),types);
 const logPath=join(directory,'contracts.log'),fd=fs.openSync(logPath,'wx');let result;
 try{result=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests.map(name=>'scripts/'+name)],{cwd:root,stdio:['ignore',fd,fd],timeout:5580000});}finally{fs.closeSync(fd);}
 assert.equal(result.error,undefined);assert.equal(result.status,0,'Read '+logPath);assert.ok(fs.statSync(logPath).size<8*1024*1024);const log=fs.readFileSync(logPath,'utf8');
 for(const [key,n]of [['tests',12],['pass',12],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(binary)),nativeBinarySha256);assert.equal(sha(fs.readFileSync(runtime)),normalWasmSha256);
 Object.assign(state,{complete:true,passed:true,sourceUnchanged:true,strictPrivateTypes:true,log:logPath,logSha256:sha(log)});saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/cold-target-metadata-source-qualification.json'),state);console.log(JSON.stringify({directory,passed:true,cases:12,sourceUnchanged:true}));
}catch(error){saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;}
