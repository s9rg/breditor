/** Exact-source physical native files and mixed inactive native staging acceptance. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {probePhysicalRoomStage} from './probe-physical-room-stage.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');if(process.argv.length!==2)throw Error('No substituted native fixture or runtime accepted');
const source=sourceEvidence(root),nativePath='target/server-generation-inventory-native.json',native=JSON.parse(readFileSync(resolve(root,nativePath),'utf8'));
assert.equal(native.passed,true);assert.deepEqual(native.source,source,'Build physical native fixtures from this exact source first');for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);assert.deepEqual(fileEvidence(root,native.manifestEvidence.path),native.manifestEvidence);
const acceptance=await probePhysicalRoomStage(resolve(root,'target/promoted-shared-web'),native.manifest);assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);
const report={format:'breditor/physical-room-stage-sdk-check',formatVersion:1,passed:true,source,nativeEvidence:fileEvidence(root,nativePath),acceptance};saveEvidence(resolve(root,'target/physical-room-stage-sdk.json'),report);console.log(JSON.stringify(report,null,2));
