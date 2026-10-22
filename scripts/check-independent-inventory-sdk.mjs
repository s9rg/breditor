/** Fixed normal runtime and freshly source-matched actual native physical fixtures. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {restoredGraphNativeSource} from '../packages/breditor-collaboration/dist/restored_graph/native_source.js';
import {checkOperationalPhysicalInventoryCohort} from '../packages/breditor-collaboration/dist/server_generation_inventory/read.js';
import {sourceEvidence,fileEvidence,saveEvidence} from './candidate-release/evidence.mjs';
import {probeIndependentInventory} from './probe-independent-inventory.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=sourceEvidence(root),nativePath='target/server-generation-inventory-native.json',native=JSON.parse(readFileSync(resolve(root,nativePath),'utf8'));
if(process.argv.length!==2)throw Error('No substituted source/runtime/fixtures or reduced cases accepted');
assert.equal(native.passed,true);assert.deepEqual(native.source,source,'Build exact-source physical/native fixtures first');for(const file of native.files)assert.deepEqual(fileEvidence(root,file.path),file);assert.deepEqual(fileEvidence(root,native.manifestEvidence.path),native.manifestEvidence);
const acceptance=await probeIndependentInventory({api,rich,internals:{restoredGraphNativeSource,checkOperationalPhysicalInventoryCohort},runtime:resolve(root,'target/promoted-shared-web'),manifestPath:native.manifest});assert.equal(acceptance.passed,true);assert.equal(acceptance.mixedCohorts,480);assert.deepEqual(sourceEvidence(root),source);
const report={format:'breditor/independent-inventory-sdk-check',formatVersion:1,passed:true,source,sourceUnchanged:true,nativeEvidence:fileEvidence(root,nativePath),acceptance};saveEvidence(resolve(root,'target/independent-inventory-sdk.json'),report);console.log(JSON.stringify(report,null,2));
