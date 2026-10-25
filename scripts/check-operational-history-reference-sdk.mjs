/** Fixed read-runtime regression domain on the unchanged normal Wasm binary.
 * No author restoration, relay activation, platform or full V1 qualification. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {operationalHistoryReferenceWorkload as workload} from './operational-history-reference-workload.mjs';
const {tests,types,assertions,scope}=workload;
if(process.argv.length!==2)throw Error('No substituted source, runtime or reduced assertions accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(root,'target/operational-history-reference-sdk-'));

const sha=b=>createHash('sha256').update(b).digest('hex'),normalWasmSha256=sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,'946ca19dadd21e06eafc12f366272c44ba831de5349831bc2323f38eda6372f0');
let output;try{output=execFileSync(process.execPath,['--test',...tests.map(name=>'scripts/'+name)],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'contracts.log'),output);}catch(error){writeFileSync(join(directory,'contracts.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const pattern of [new RegExp('^# pass '+assertions+'$','m'),/^# fail 0$/m,/^# skipped 0$/m])assert.match(output,pattern);
assert.deepEqual(sourceEvidence(root),source);
const result={format:'breditor/operational-history-reference-sdk',formatVersion:1,passed:true,directory,source,sourceUnchanged:true,assertions,newHistoricalParentReferenceLaws:131,generationParentRecordReadLaws:97,priorOriginalParentRecordReadLaws:52,priorOriginalReferenceReadLaws:146,priorGenerationReferenceReadLaws:268,originalRetainedRecordReadLaws:197,priorRecordReadLaws:262,compoundStorageRegressionLaws:28,normalWasmSha256,scope};
saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/operational-history-reference-sdk.json'),result);console.log(JSON.stringify(result));
