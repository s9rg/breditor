/** Qualification of actual activation-retention metadata lifetime plus the
 * existing original intent laws. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
if(process.argv.length!==2)throw Error('All activation-retention and existing lifetime regression cases are mandatory');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=fs.mkdtempSync(join(root,'target/activation-retention-source-')),sha=value=>createHash('sha256').update(value).digest('hex');
const tests=['activation-retention-lifetime.test.mjs','room-native-activation-intent.test.mjs'];
const expectedCases=18;
const runtime=join(root,'packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm'),normalWasmSha256=sha(fs.readFileSync(runtime));
assert.equal(normalWasmSha256,'165e23dbaef2ab77a6f920a20012e19624422ab2ccb74ec4e01f2146ac8086e0');
const state={format:'breditor/activation-retention-source-qualification',formatVersion:1,complete:false,source,directory,normalWasmSha256,cases:expectedCases,v1Ready:false,wholeRoomActivated:false,v1GatesOpen:13};
saveEvidence(join(directory,'running.json'),state);console.log(JSON.stringify({directory,phase:'strict-private-types-and-real-activation-retention-lifetimes'}));
try{
 const types=execFileSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--exactOptionalPropertyTypes','--noUncheckedIndexedAccess','--target','ES2022','--module','NodeNext','--lib','ES2022,DOM','scripts/fixtures/activation-retention/types.mts'],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
 fs.writeFileSync(join(directory,'types.log'),types);
 const logPath=join(directory,'contracts.log'),fd=fs.openSync(logPath,'wx');let result;
 try{result=spawnSync(process.execPath,['--test','--test-concurrency=1',...tests.map(name=>'scripts/'+name)],{cwd:root,stdio:['ignore',fd,fd],env:{...process.env,BREDITOR_ACTIVATION_RETENTION_FIXTURE:join(root,'target/activation-retainer-actual-input')},timeout:120000});}finally{fs.closeSync(fd);}
 assert.equal(result.error,undefined);assert.equal(result.status,0,'Read '+logPath);assert.ok(fs.statSync(logPath).size<8*1024*1024);const log=fs.readFileSync(logPath,'utf8');
 for(const [key,n]of [['tests',expectedCases],['pass',expectedCases],['fail',0],['skipped',0],['cancelled',0],['todo',0]])assert.match(log,new RegExp('^# '+key+' '+n+'$','m'));
 assert.deepEqual(sourceEvidence(root),source);assert.equal(sha(fs.readFileSync(runtime)),normalWasmSha256);
 Object.assign(state,{complete:true,passed:true,sourceUnchanged:true,strictPrivateTypes:true,log:logPath,logSha256:sha(log)});saveEvidence(join(directory,'result.json'),state);saveEvidence(join(root,'target/activation-retention-source-qualification.json'),state);console.log(JSON.stringify({directory,passed:true,cases:expectedCases,sourceUnchanged:true}));
}catch(error){saveEvidence(join(directory,'failed.json'),{...state,error:String(error)});throw error;}
