/** Exact source-bound native V2 operational parent, not activation or release approval. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fileEvidence,saveEvidence,sourceEvidence} from './candidate-release/evidence.mjs';
import {probeRoomOperationalRecoveryV2} from './probe-room-operational-recovery-v2.mjs';
import {checkRoomOperationV2Acceptance} from './fixtures/room-operation-v2/acceptance.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');if(process.argv.length!==2)throw Error('No substituted runtime or fixture arguments are accepted');
const source=sourceEvidence(root),nativePath='target/room-participant-inventory-native.json',native=JSON.parse(readFileSync(resolve(root,nativePath),'utf8'));assert.equal(native.passed,true);assert.deepEqual(native.source,source,'Generate native fixtures from the current exact source first');for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);
const acceptance=checkRoomOperationV2Acceptance(await probeRoomOperationalRecoveryV2(resolve(root,'target/promoted-shared-web'),native.manifest));assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/room-operational-recovery-v2-sdk-check',formatVersion:1,passed:true,source,nativeEvidence:fileEvidence(root,nativePath),acceptance,scope:'Genuine selected native mixed-family parent, atomic ready guards, original source files, current explicit policies and future native histories with controlled storage/locks/raster. Not browser durability, current authenticated activation or a V1 release.'};saveEvidence(resolve(root,'target/room-operational-recovery-v2-sdk.json'),report);console.log(JSON.stringify(report,null,2));
