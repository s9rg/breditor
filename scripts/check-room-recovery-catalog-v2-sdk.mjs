/** Source-bound mixed-family retention and inactive native staging. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fileEvidence,saveEvidence,sourceEvidence} from './candidate-release/evidence.mjs';
import {probeRoomRecoveryCatalogV2} from './probe-room-recovery-catalog-v2.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length!==2)throw Error('No arguments expected');
const source=sourceEvidence(root),nativePath='target/room-participant-inventory-native.json',native=JSON.parse(readFileSync(resolve(root,nativePath),'utf8'));
assert.equal(native.passed,true);assert.deepEqual(native.source,source,'Generate native fixtures from this exact current source first');
for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);
const acceptance=await probeRoomRecoveryCatalogV2(resolve(root,'target/promoted-shared-web'),native.manifest);
assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/room-recovery-catalog-v2-sdk-check',formatVersion:1,passed:true,source,nativeEvidence:fileEvidence(root,nativePath),acceptance};
saveEvidence(resolve(root,'target/room-recovery-catalog-v2-sdk.json'),report);console.log(JSON.stringify(report,null,2));
