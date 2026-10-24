/** Fixed read-runtime regression domain on the unchanged normal Wasm binary.
 * No author restoration, relay activation, platform or full V1 qualification. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
if(process.argv.length!==2)throw Error('No substituted source, runtime or reduced assertions accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(root,'target/original-retained-record-read-sdk-'));
const tests=["original-native-record-read.test.mjs","original-version-record-read.test.mjs","original-revision-record-read.test.mjs","original-record-read-isolation.test.mjs","original-record-read-disposal.test.mjs","persistent-generation-read-development.test.mjs","persistent-generation-read-disposal.test.mjs","persistent-paired-read-development.test.mjs","persistent-paired-read-disposal.test.mjs","persistent-suggestion-read-development.test.mjs","persistent-suggestion-read-disposal.test.mjs","segmented-retained-storage.test.mjs"];
const sha=b=>createHash('sha256').update(b).digest('hex'),normalWasmSha256=sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,'b5061a35efb4a34804a925f4dc9d847904f6685b719dc99ff2f324223305e329');
let output;try{output=execFileSync(process.execPath,['--test',...tests.map(name=>'scripts/'+name)],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'contracts.log'),output);}catch(error){writeFileSync(join(directory,'contracts.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const pattern of [/^# pass 487$/m,/^# fail 0$/m,/^# skipped 0$/m])assert.match(output,pattern);
assert.deepEqual(sourceEvidence(root),source);
const result={format:'breditor/original-retained-record-read-sdk',formatVersion:1,passed:true,directory,source,sourceUnchanged:true,assertions:487,originalRetainedRecordReadLaws:197,priorRecordReadLaws:262,compoundStorageRegressionLaws:28,normalWasmSha256,scope:"Actual original native committed/pending/unsaved LIVE rows across all three native languages and selection scopes, original version catalog rows and revision outbox/base-queue rows. One revision queue reservation, a separate non-mutating failed-version read reservation, unchanged original write-recovery refusal, current read-only author policy, actual stored-byte verification, private epochs, late failure cleanup and callback release are covered by 197 new laws. All 290 prior original/generation/compound record laws remain. Only genuine original sources can select these reads; compound drivers and custom-storage sources refuse the new path without changing their old edit APIs. Reading does not flush, retry, clear errors, acquire an author, fetch providers or activate a room. Full original/generation reference closure and coordinator reconciliation remain required."};
saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/original-retained-record-read-sdk.json'),result);console.log(JSON.stringify(result));
