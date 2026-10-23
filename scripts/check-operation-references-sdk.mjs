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
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),directory=mkdtempSync(join(root,'target/operation-references-sdk-'));
const tests=["independent-local-portable.test.mjs","independent-local-portable-policy.test.mjs","independent-local-portable-versions.test.mjs","independent-local-portable-corruption.test.mjs","independent-local-portable-codec.test.mjs","independent-local-portable-lifetime.test.mjs","independent-local-portable-replay-lifetime.test.mjs","independent-local-portable-assets.test.mjs","local-operation-reference-capture-development.test.mjs",'independent-operation-portable.test.mjs','independent-operation-reader-runtime-development.test.mjs','restored-graph-contracts.test.mjs','restored-graph-roundtrip.test.mjs','restored-graph-lifetime.test.mjs','restored-graph-identity.test.mjs','restored-graph-assets.test.mjs','restored-graph-recovery.test.mjs','restored-graph-reader-runtime-development.test.mjs','independent-operation-reference-capture-development.test.mjs','restored-graph-reference-capture-development.test.mjs','operation-reference-disposal.test.mjs'];
const sha=b=>createHash('sha256').update(b).digest('hex'),normalWasmSha256=sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,'b5061a35efb4a34804a925f4dc9d847904f6685b719dc99ff2f324223305e329');
let output;try{output=execFileSync(process.execPath,['--test',...tests.map(name=>'scripts/'+name)],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'contracts.log'),output);}catch(error){writeFileSync(join(directory,'contracts.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const pattern of [/^# pass 197$/m,/^# fail 0$/m,/^# skipped 0$/m])assert.match(output,pattern);
assert.deepEqual(sourceEvidence(root),source);
const result={format:'breditor/operation-references-sdk',formatVersion:1,passed:true,directory,source,sourceUnchanged:true,assertions:197,independentRuntimeCases:32,historyPairs:4,restoredInputKinds:['snapshot-v1','lineage-v1','lineage-v2'],normalWasmSha256,scope:"One normal language-three profile. The unchanged 197-law workload retains prior delivery, restored graph and local portable laws. Three families discover original/current/pending/live native history and immutable packet dependencies without a current upload store or later raster resolution. All four history pairs, separately loaded reader runtimes, expired write grants, actual durable verification, journal-only retry epochs, cancellation, reentry and explicit callback release remain represented. Complete original/input archive admission is unchanged. Synthetic storage and raster environment; not all seven families, full provider/client reconciliation, physical durability, activation or V1 readiness."};
saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/operation-references-sdk.json'),result);console.log(JSON.stringify(result));
