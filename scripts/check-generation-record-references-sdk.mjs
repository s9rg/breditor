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
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(root,'target/generation-record-references-sdk-'));
const tests=["generation-record-reference-development.test.mjs","generation-record-reference-disposal.test.mjs","original-native-record-read.test.mjs","original-version-record-read.test.mjs","original-revision-record-read.test.mjs","original-record-read-isolation.test.mjs","original-record-read-disposal.test.mjs","persistent-generation-read-development.test.mjs","persistent-generation-read-disposal.test.mjs","persistent-paired-read-development.test.mjs","persistent-paired-read-disposal.test.mjs","persistent-suggestion-read-development.test.mjs","persistent-suggestion-read-disposal.test.mjs","segmented-retained-storage.test.mjs"];
const sha=b=>createHash('sha256').update(b).digest('hex'),normalWasmSha256=sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,'b5061a35efb4a34804a925f4dc9d847904f6685b719dc99ff2f324223305e329');
let output;try{output=execFileSync(process.execPath,['--test',...tests.map(name=>'scripts/'+name)],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'contracts.log'),output);}catch(error){writeFileSync(join(directory,'contracts.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const pattern of [/^# pass 755$/m,/^# fail 0$/m,/^# skipped 0$/m])assert.match(output,pattern);
assert.deepEqual(sourceEvidence(root),source);
const result={format:'breditor/generation-record-references-sdk',formatVersion:1,passed:true,directory,source,sourceUnchanged:true,assertions:755,generationReferenceReadLaws:268,originalRetainedRecordReadLaws:197,priorRecordReadLaws:262,compoundStorageRegressionLaws:28,normalWasmSha256,scope:"Read-only native replay of actual generation committed, uncertain-attempt, pending and LIVE states collects every native and retained-packet asset address without a current upload store or later raster fetch. Three languages, three scopes, all compatible natural/reviewed/search combinations, all four actual source factories, same/separate runtime selection, native/comment ancestry and ordered local versions are represented. Hidden committed-only or attempt-only images remain required after LIVE forgetting. Permission, durable verification, pure currentness, failure cleanup, metadata types and callback release add 268 laws to all 487 prior original/generation record laws. Historical parent files outside those source-owned slots, whole-upload/provider/client reconciliation, held coordinator integration, authenticated activation, sustainable history and V1 remain required."};
saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/generation-record-references-sdk.json'),result);console.log(JSON.stringify(result));
