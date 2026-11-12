import assert from 'node:assert/strict';
/** Same complete public workflow as fresh installation/bundle qualification. */
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {sourceEvidence} from './candidate-release/evidence.mjs';
import {selectSharedRuntimeBuild} from './candidate-release/shared-runtime-evidence.mjs';
import {probeSelectedDeliveryCase,selectedDeliveryProfiles} from './probe-selected-delivery.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),runtime=fileURLToPath(new URL('../packages/breditor-collaboration/dist/runtime/',import.meta.url));
const source=sourceEvidence(root);
const build=selectSharedRuntimeBuild(root,source);
test.after(()=>{
 assert.deepEqual(sourceEvidence(root),source);
 assert.deepEqual(selectSharedRuntimeBuild(root,source),build);
});
for(const profile of selectedDeliveryProfiles)test('native '+profile.language+' / standard '+profile.standard+' / atomic '+profile.atomic+': seven original authors against the durably activated service',{timeout:180000},async()=>{const result=await probeSelectedDeliveryCase(root,runtime,profile);assert.equal(result.latestPreviousCutPreserved,true);assert.equal(result.completeNativePathPreserved,true);assert.equal(result.authenticatedCompleteNativePathRead,true);assert.equal(result.authenticatedAdvancedCutRead,true);});
