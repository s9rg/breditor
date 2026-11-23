import {NORMAL_SHARED_WASM_SHA256} from "./fixtures/native-runtime/normal-shared-identity.mjs";
/** Fixed read-runtime regression domain on the verified normal Wasm binary.
 * No author restoration, relay activation, platform or full V1 qualification. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
if(process.argv.length!==2)throw Error('No substituted source, runtime or reduced assertions accepted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(root,'target/reader-runtime-sdk-'));
const tests=['independent-operation-portable.test.mjs','independent-operation-reader-runtime-development.test.mjs','restored-graph-contracts.test.mjs','restored-graph-roundtrip.test.mjs','restored-graph-lifetime.test.mjs','restored-graph-identity.test.mjs','restored-graph-assets.test.mjs','restored-graph-recovery.test.mjs','restored-graph-reader-runtime-development.test.mjs'];
const sha=b=>createHash('sha256').update(b).digest('hex'),normalWasmSha256=sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,NORMAL_SHARED_WASM_SHA256);
let output;try{output=execFileSync(process.execPath,['--test',...tests.map(name=>'scripts/'+name)],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'contracts.log'),output);}catch(error){writeFileSync(join(directory,'contracts.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const pattern of [/^# pass 85$/m,/^# fail 0$/m,/^# skipped 0$/m])assert.match(output,pattern);
assert.deepEqual(sourceEvidence(root),source);
const result={format:'breditor/reader-runtime-sdk',formatVersion:1,passed:true,directory,source,sourceUnchanged:true,assertions:85,independentRuntimeCases:32,historyPairs:4,restoredInputKinds:['snapshot-v1','lineage-v1','lineage-v2'],normalWasmSha256,scope:'One normal language-three profile. Thirty-two independent same-byte reader cases cover four native history pairs, active/expired write grants and all three restored input families. Exact no-write source snapshots, pending-only retired pixels, both graph ancestry anchors, future history and all existing graph identity/capture/reentry/corruption/assets/recovery/lifetime/two-roundtrip laws. Not a full compiler matrix, authenticated activation, browser durability or V1 readiness.'};
saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/reader-runtime-sdk.json'),result);console.log(JSON.stringify(result));
