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
const tests=['independent-operation-portable.test.mjs','independent-operation-reader-runtime-development.test.mjs','restored-graph-contracts.test.mjs','restored-graph-roundtrip.test.mjs','restored-graph-lifetime.test.mjs','restored-graph-identity.test.mjs','restored-graph-assets.test.mjs','restored-graph-recovery.test.mjs','restored-graph-reader-runtime-development.test.mjs','independent-operation-reference-capture-development.test.mjs','restored-graph-reference-capture-development.test.mjs','operation-reference-disposal.test.mjs'];
const sha=b=>createHash('sha256').update(b).digest('hex'),normalWasmSha256=sha(readFileSync(join(root,'target/promoted-shared-web/breditor_shared_bg.wasm')));
assert.equal(normalWasmSha256,'b5061a35efb4a34804a925f4dc9d847904f6685b719dc99ff2f324223305e329');
let output;try{output=execFileSync(process.execPath,['--test',...tests.map(name=>'scripts/'+name)],{cwd:root,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});writeFileSync(join(directory,'contracts.log'),output);}catch(error){writeFileSync(join(directory,'contracts.log'),String(error.stdout??'')+'\n'+String(error.stderr??''));throw error;}
for(const pattern of [/^# pass 134$/m,/^# fail 0$/m,/^# skipped 0$/m])assert.match(output,pattern);
assert.deepEqual(sourceEvidence(root),source);
const result={format:'breditor/operation-references-sdk',formatVersion:1,passed:true,directory,source,sourceUnchanged:true,assertions:134,independentRuntimeCases:32,historyPairs:4,restoredInputKinds:['snapshot-v1','lineage-v1','lineage-v2'],normalWasmSha256,scope:'One normal language-three profile. The unchanged 134-law workload retains all prior portable and graph laws and adds 47 reference-read and two explicit callback-release laws. Native original/current/pending/live packets, every admitted imported ancestry state, pending-only and input-only images, independent read runtimes and expired writer grants remain represented. A separate managed persistence epoch detects retries with unchanged native stamps; actual durable verification, cancellation, reentry and cleanup remain independent. No raster fetch or current upload store is needed for later references; original/input archives retain complete admission. Synthetic storage and raster environment; not all seven families, full provider/client reconciliation, physical durability, activation or V1 readiness.'};
saveEvidence(join(directory,'result.json'),result);saveEvidence(join(root,'target/operation-references-sdk.json'),result);console.log(JSON.stringify(result));
