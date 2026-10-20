/** Source-bound native common barrier prerequisite, not V2 room activation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fileEvidence,saveEvidence,sourceEvidence} from './candidate-release/evidence.mjs';
import {probeMixedRoomCustody} from './probe-mixed-room-custody.mjs';
import {probeOperationCohortCleanup} from './probe-operation-cohort-cleanup.mjs';
import {probeManagedSourceBindings} from './probe-managed-source-bindings.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');if(process.argv.length!==2)throw Error('No arguments expected');
const source=sourceEvidence(root),nativePath='target/room-participant-inventory-native.json',native=JSON.parse(readFileSync(resolve(root,nativePath),'utf8'));
assert.equal(native.passed,true);assert.deepEqual(native.source,source,'Generate native fixtures from this exact current source first');for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);
const cleanup=await probeOperationCohortCleanup(resolve(root,'target/promoted-shared-web'),native.manifest),acceptance=await probeMixedRoomCustody(resolve(root,'target/promoted-shared-web'),native.manifest),bindings=await probeManagedSourceBindings(resolve(root,'target/promoted-shared-web'),native.manifest);assert.equal(cleanup.passed,true);assert.equal(acceptance.passed,true);assert.equal(bindings.passed,true);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/mixed-room-custody-sdk-check',formatVersion:1,passed:true,source,nativeEvidence:fileEvidence(root,nativePath),cleanup,acceptance,bindings};saveEvidence(resolve(root,'target/mixed-room-custody-sdk.json'),report);console.log(JSON.stringify(report,null,2));
