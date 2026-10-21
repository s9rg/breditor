/** Exact-source actual native transport files and immutable mixed client catalog acceptance. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {probePhysicalRoomCatalog} from './probe-physical-room-catalog.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');if(process.argv.length!==2)throw Error('No substituted runtime or native fixtures accepted');
const source=sourceEvidence(root),nativePath='target/server-generation-inventory-native.json',native=JSON.parse(readFileSync(resolve(root,nativePath),'utf8'));
assert.equal(native.passed,true);assert.deepEqual(native.source,source,'Build native physical fixtures from this exact source first');for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);assert.deepEqual(fileEvidence(root,native.manifestEvidence.path),native.manifestEvidence);
const acceptance=await probePhysicalRoomCatalog(resolve(root,'target/promoted-shared-web'),native.manifest);assert.equal(acceptance.passed,true);assert.deepEqual(sourceEvidence(root),source);for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);
const report={format:'breditor/physical-room-catalog-sdk-check',formatVersion:1,passed:true,source,nativeEvidence:fileEvidence(root,nativePath),acceptance};saveEvidence(resolve(root,'target/physical-room-catalog-sdk.json'),report);console.log(JSON.stringify(report,null,2));
