/** Internal cohort prerequisite only: not a durable generation room or activation API. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fileEvidence,saveEvidence,sourceEvidence} from './candidate-release/evidence.mjs';
import {probeGenerationRoomCustody} from './probe-generation-room-custody.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');if(process.argv.length!==2)throw Error('No arguments expected');
const source=sourceEvidence(root),nativePath='target/room-participant-inventory-native.json',native=JSON.parse(readFileSync(resolve(root,nativePath),'utf8'));
assert.equal(native.passed,true);assert.deepEqual(native.source,source,'Generate native fixtures from this exact current source first');for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);
const acceptance=await probeGenerationRoomCustody(resolve(root,'target/promoted-shared-web'),native.manifest);assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/generation-room-custody-sdk-check',formatVersion:1,passed:true,source,nativeEvidence:fileEvidence(root,nativePath),acceptance};saveEvidence(resolve(root,'target/generation-room-custody-sdk.json'),report);console.log(JSON.stringify(report,null,2));
