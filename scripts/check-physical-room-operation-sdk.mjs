/** Exact-source actual Rust/Wasm client parent. Not native-host recovery or server activation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fileEvidence,sourceEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {probePhysicalRoomOperation} from './probe-physical-room-operation.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');if(process.argv.length!==2)throw Error('No substituted runtime or fixture arguments accepted');
const source=sourceEvidence(root),nativePath='target/server-generation-inventory-native.json',native=JSON.parse(readFileSync(resolve(root,nativePath),'utf8'));assert.equal(native.passed,true);assert.deepEqual(native.source,source,'Generate physical native fixtures from this exact source first');for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);assert.deepEqual(fileEvidence(root,native.manifestEvidence.path),native.manifestEvidence);
const acceptance=await probePhysicalRoomOperation(resolve(root,'target/promoted-shared-web'),native.manifest);assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);
const report={format:'breditor/physical-room-client-operation-sdk-check',formatVersion:1,passed:true,source,nativeEvidence:fileEvidence(root,nativePath),acceptance,scope:'Actual readonly physical-stage custody transfer, separate client-operation intent, exact native cold continuation and future history under fresh explicit current permissions. Synthetic storage/locks/raster presentation. Not native-host ancestry, complete provider/client-outbox closure, historical-copy disposition, browser qualification, server activation or V1 readiness.'};saveEvidence(resolve(root,'target/physical-room-operation-sdk.json'),report);console.log(JSON.stringify(report,null,2));
