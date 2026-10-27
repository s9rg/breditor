/** Fresh exact-source native input plus actual native exclusion and owner-phase laws. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,openSync,closeSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {completedRoomInspectionWorkload as workload} from './completed-room-inspection-workload.mjs';
if(process.argv.length!==2)throw Error('No substituted source, native controls or reduced laws');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(root,'target/completed-room-inspection-sdk-')),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),inputs=[];
for(const[path,format]of[['target/complete-image-cohort-native.json','breditor/native-complete-image-cohort-check'],['target/complete-cohort-native.json','breditor/native-complete-cohort-check']]){const native=JSON.parse(readFileSync(join(root,path)));assert.equal(native.format,format);assert.equal(native.passed,true);assert.deepEqual(native.source,source);assert.equal(native.files.length,50);for(const row of native.files)assert.deepEqual(fileEvidence(root,row.path),row);assert.equal(sha(readFileSync(native.manifest)),native.manifestSha256??native.manifestEvidence.sha256);if(format.includes('image'))assert.equal(native.controlsStopped,true);inputs.push({path,native,reportSha256:sha(readFileSync(join(root,path)))});}
assert.equal(sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm'))),'946ca19dadd21e06eafc12f366272c44ba831de5349831bc2323f38eda6372f0');
const contractLog=join(directory,'contracts.log'),descriptor=openSync(contractLog,'wx',0o600);console.log('CONTRACT_LOG',contractLog);
try{execFileSync(process.execPath,['--test','--test-concurrency=4',...workload.tests.map(name=>'scripts/'+name)],{cwd:root,stdio:['ignore',descriptor,descriptor],timeout:10800000});}finally{closeSync(descriptor);}const output=readFileSync(contractLog,'utf8');assert.ok(Buffer.byteLength(output)<=16*1024*1024,'Contract log budget');
for(const[mark,value]of[['tests',workload.assertions],['pass',workload.assertions],['fail',0],['skipped',0],['cancelled',0]])assert.match(output,new RegExp('^# '+mark+' '+value+'$','m'));assert.deepEqual(sourceEvidence(root),source);for(const item of inputs){assert.equal(sha(readFileSync(join(root,item.path))),item.reportSha256);for(const row of item.native.files)assert.deepEqual(fileEvidence(root,row.path),row);}
const result={format:'breditor/completed-room-inspection-sdk',formatVersion:1,passed:true,source,directory,sourceUnchanged:true,assertions:workload.assertions,newInspectionAssertions:19,priorAssertions:321,nativeInputsFreshForSource:true,nativeFilesVerified:100,nativeReports:inputs.map(({path,reportSha256})=>({path,sha256:reportSha256})),normalWasmSha256:'946ca19dadd21e06eafc12f366272c44ba831de5349831bc2323f38eda6372f0',scope:workload.scope};saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/completed-room-inspection-sdk.json'),result);console.log(JSON.stringify(result));
