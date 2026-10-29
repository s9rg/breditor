import assert from 'node:assert/strict';
/** Same complete public workflow as fresh installation/bundle qualification. */
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {probeSelectedDeliveryCase,selectedDeliveryProfiles} from './probe-selected-delivery.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),runtime=fileURLToPath(new URL('../packages/breditor-collaboration/dist/runtime/',import.meta.url));
for(const profile of selectedDeliveryProfiles)test('native '+profile.language+' / standard '+profile.standard+' / atomic '+profile.atomic+': seven original authors against the durably activated service',{timeout:180000},async()=>{const result=await probeSelectedDeliveryCase(root,runtime,profile);assert.equal(result.latestPreviousCutPreserved,true);assert.equal(result.completeNativePathPreserved,true);assert.equal(result.authenticatedAdvancedCutRead,true);});
