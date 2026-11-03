/** Qualification of dependency-only known-version materialization plus the
 * existing original version delivery and durable failure/retry contracts. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
if(process.argv.length!==2)throw Error('All materialization and existing version regression cases are mandatory');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=fs.mkdtempSync(join(root,'target/native-version-materialization-source-')),sha=value=>createHash('sha256').update(value).digest('hex');
const tests=['native-version-materialization.test.mjs','native-version-delivery.test.mjs','native-version-delivery-failures.test.mjs'];
const binary=join(root,'target/owned-history-relay-native/release/examples/segmented_relay_functional'),nativeBinarySha256=sha(fs.readFileSync(binary));
const runtime=join(root,'packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(fs.readFileSync(runtime));
assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/native-version-materialization-source-qualification',formatVersion:1,complete:false,source,directory,nativeBinarySha256,normalWasmSha256,cases:83,v1Ready:false,wholeRoomActivated:false,v1GatesOpen:13};
saveEvidence(join(directory,'running.json'),state);console.log(JSON.stringify({directory,phase:'strict-private-types-and-real-native-version-contracts'}));
try{
 const types=execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM','scripts/fixtures/editor-consumer/types-native-version-delivery.ts'],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 fs.writeFileSync(join(directory,'types.log'),types);
 const logPath=join(directory,'contracts.log'),fd=fs.openSync(logPath,'wx');let result;
 try{result=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests.map(name=>'scripts/'+name)],{cwd:root,stdio:['ignore',fd,fd],timeout:1800000});}finally{fs.closeSync(fd);}
 assert.equal(result.error,undefined);assert.equal(result.status,0,'Read '+logPath);assert.ok(fs.statSync(logPath).size<8*1024*1024);const log=fs.readFileSync(logPath,'utf8');
 for(const [key,n]of [['tests',83],['pass',83],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(binary)),nativeBinarySha256);assert.equal(sha(fs.readFileSync(runtime)),normalWasmSha256);
 Object.assign(state,{complete:true,passed:true,sourceUnchanged:true,strictPrivateTypes:true,log:logPath,logSha256:sha(log)});saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/native-version-materialization-source-qualification.json'),state);console.log(JSON.stringify({directory,passed:true,cases:83,sourceUnchanged:true}));
}catch(error){saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;}
