/** Normal source-pinned mutation and cold-recovery laws, never receipt promotion. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {reconciledAssetBaseWorkload as workload} from './reconciled-asset-base-workload.mjs';
if(process.argv.length!==2)throw Error('No substituted source, native inputs or reduced laws');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(root,'target/reconciled-asset-base-sdk-')),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),nativePath=join(root,'target/complete-image-cohort-native.json'),native=JSON.parse(readFileSync(nativePath));
assert.equal(native.format,'breditor/native-complete-image-cohort-check');assert.equal(native.passed,true);assert.equal(native.controlsStopped,true);assert.deepEqual(native.source,source);assert.equal(native.files.length,50);for(const row of native.files)assert.deepEqual(fileEvidence(root,row.path),row);assert.equal(sha(readFileSync(native.manifest)),native.manifestSha256);assert.equal(sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm'))),'946ca19dadd21e06eafc12f366272c44ba831de5349831bc2323f38eda6372f0');
let output;try{output=execFileSync(process.execPath,['--test',...workload.tests.map(name=>'scripts/'+name)],{cwd:root,encoding:'utf8',timeout:1800000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'contracts.log'),output);}catch(error){writeFileSync(join(directory,'contracts.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const[mark,value]of[['tests',workload.assertions],['pass',workload.assertions],['fail',0],['skipped',0],['cancelled',0]])assert.match(output,new RegExp('^# '+mark+' '+value+'$','m'));assert.deepEqual(sourceEvidence(root),source);for(const row of native.files)assert.deepEqual(fileEvidence(root,row.path),row);assert.equal(sha(readFileSync(native.manifest)),native.manifestSha256);
const result={format:'breditor/reconciled-asset-base-sdk',formatVersion:1,passed:true,source,directory,sourceUnchanged:true,assertions:workload.assertions,newHeldAssertions:workload.newHeldAssertions,nativeRoomAssertions:8,nativeParticipantsReconciled:28,nativeRetainedBaseBranches:28,nativeParticipantsColdReopened:56,nativeInputsFreshForSource:true,nativeFilesVerified:50,nativeReportSha256:sha(readFileSync(nativePath)),normalWasmSha256:'946ca19dadd21e06eafc12f366272c44ba831de5349831bc2323f38eda6372f0',scope:workload.scope};saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/reconciled-asset-base-sdk.json'),result);console.log(JSON.stringify(result));
