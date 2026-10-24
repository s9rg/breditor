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
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(root,'target/original-record-read-sdk-'));
const tests=["persistent-paired-read-development.test.mjs","persistent-paired-read-disposal.test.mjs","persistent-suggestion-read-development.test.mjs","persistent-suggestion-read-disposal.test.mjs","segmented-retained-storage.test.mjs"];
const sha=b=>createHash('sha256').update(b).digest('hex'),normalWasmSha256=sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,'b5061a35efb4a34804a925f4dc9d847904f6685b719dc99ff2f324223305e329');
let output;try{output=execFileSync(process.execPath,['--test',...tests.map(name=>'scripts/'+name)],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'contracts.log'),output);}catch(error){writeFileSync(join(directory,'contracts.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const pattern of [/^# pass 102$/m,/^# fail 0$/m,/^# skipped 0$/m])assert.match(output,pattern);
assert.deepEqual(sourceEvidence(root),source);
const result={format:'breditor/original-record-read-sdk',formatVersion:1,passed:true,directory,source,sourceUnchanged:true,assertions:102,newRecordReadLaws:74,compoundStorageRegressionLaws:28,normalWasmSha256,scope:"Original paired native records and standalone proposal queues read actual committed rows separately from pending and unsaved LIVE records. Seventy-four new record-read laws and twenty-eight existing compound-generation storage laws run on normal language-three native owners. Three selection scopes, reviewed/search combinations, aborted or lost acknowledgements, all five paired record formats, independent read authority, callback-free currentness, real stored-byte verification, bounded read lifetimes and callback release are represented. No read saves, replays into a writable owner, acquires an author, changes existing record formats, or interprets diagnostic data as native ancestry/provider/server authority. Full original/generation reference capture, version/revision record closure, coordinator reconciliation, authenticated activation and V1 readiness remain separate."};
saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/original-record-read-sdk.json'),result);console.log(JSON.stringify(result));
