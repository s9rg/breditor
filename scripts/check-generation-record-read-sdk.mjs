import {NORMAL_SHARED_WASM_SHA256} from "./fixtures/native-runtime/normal-shared-identity.mjs";
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
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(root,'target/generation-record-read-sdk-'));
const tests=["persistent-generation-read-development.test.mjs","persistent-generation-read-disposal.test.mjs","persistent-paired-read-development.test.mjs","persistent-paired-read-disposal.test.mjs","persistent-suggestion-read-development.test.mjs","persistent-suggestion-read-disposal.test.mjs","segmented-retained-storage.test.mjs"];
const sha=b=>createHash('sha256').update(b).digest('hex'),normalWasmSha256=sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,NORMAL_SHARED_WASM_SHA256);
let output;try{output=execFileSync(process.execPath,['--test',...tests.map(name=>'scripts/'+name)],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'contracts.log'),output);}catch(error){writeFileSync(join(directory,'contracts.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const pattern of [/^# pass 290$/m,/^# fail 0$/m,/^# skipped 0$/m])assert.match(output,pattern);
assert.deepEqual(sourceEvidence(root),source);
const result={format:'breditor/generation-record-read-sdk',formatVersion:1,passed:true,directory,source,sourceUnchanged:true,assertions:290,newRecordReadLaws:262,compoundStorageRegressionLaws:28,normalWasmSha256,scope:"One actual committed generation transaction contains the full selected native/relay/retained head and every referenced immutable file. Complete uncertain attempt, newer pending and live captures remain separate, including committed-before-acknowledgement state and an unsaved newer revision. Original paired/queue discovery and unchanged compound storage regressions remain in the workload. Three selection scopes, all compatible natural/reviewed/search policies, four actual generation factories, independent read authority, pure currentness, exact stored-byte verification and callback release are tested. No read flushes, edits, acquires an author, releases writers, substitutes a current asset store or changes old formats. Native ancestry, complete reference closure, provider/server reconciliation, room activation and V1 remain separate."};
saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/generation-record-read-sdk.json'),result);console.log(JSON.stringify(result));
