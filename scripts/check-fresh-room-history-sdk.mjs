import {NORMAL_SHARED_WASM_SHA256} from "./fixtures/native-runtime/normal-shared-identity.mjs";
/** Fixed read-runtime regression domain on the unchanged normal Wasm binary.
 * No author restoration, relay activation, platform or full V1 qualification. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {freshRoomHistoryWorkload as workload} from './fresh-room-history-workload.mjs';
const {tests,types,assertions,scope}=workload;
if(process.argv.length!==2)throw Error('No substituted source, runtime or reduced assertions accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(root,'target/fresh-room-history-sdk-'));

const nativePath='target/complete-cohort-native.json',native=JSON.parse(readFileSync(join(root,nativePath)));assert.equal(native.format,'breditor/native-complete-cohort-check');assert.equal(native.passed,true);assert.deepEqual(native.source,source,'Generate the actual seven-author fixture for this exact source');assert.equal(native.registeredWritersPerRoom,7);assert.equal(native.reviewActorsPerRoom,7);assert.equal(native.protectedStreamsPerRoom,14);assert.equal(native.files.length,50);for(const row of native.files)assert.deepEqual(fileEvidence(root,row.path),row);assert.deepEqual(fileEvidence(root,native.manifestEvidence.path),native.manifestEvidence);
const sha=b=>createHash('sha256').update(b).digest('hex'),normalWasmSha256=sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,NORMAL_SHARED_WASM_SHA256);
let output;try{output=execFileSync(process.execPath,['--test',...tests.map(name=>'scripts/'+name)],{cwd:root,encoding:'utf8',timeout:1800000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'contracts.log'),output);}catch(error){writeFileSync(join(directory,'contracts.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const pattern of [new RegExp('^# pass '+assertions+'$','m'),/^# fail 0$/m,/^# skipped 0$/m])assert.match(output,pattern);
assert.deepEqual(sourceEvidence(root),source);for(const row of native.files)assert.deepEqual(fileEvidence(root,row.path),row);
const result={format:'breditor/fresh-room-history-sdk',formatVersion:1,passed:true,directory,source,sourceUnchanged:true,assertions,nativeInputsFreshForSource:true,nativeFilesVerified:native.files.length,nativeReportSha256:sha(readFileSync(join(root,nativePath))),newRoomHistoryLaws:15,priorFreshDeliveryParentLaws:31,priorProtectedHistoryGroupLaws:18,newHistoricalParentReferenceLaws:131,generationParentRecordReadLaws:97,priorOriginalParentRecordReadLaws:52,priorOriginalReferenceReadLaws:146,priorGenerationReferenceReadLaws:268,originalRetainedRecordReadLaws:197,priorRecordReadLaws:262,compoundStorageRegressionLaws:28,normalWasmSha256,scope};
saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/fresh-room-history-sdk.json'),result);console.log(JSON.stringify(result));
