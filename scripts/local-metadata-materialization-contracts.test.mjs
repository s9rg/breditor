/** Boundary tests: untrusted envelopes and caller options cannot widen the
 * original raster budgets or turn arbitrary header JSON into Native proof. */
import test from 'node:test';import assert from 'node:assert/strict';
import {localMetadataMaterializationLimits} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/materialized_bundle.js';
import {LocalMetadataRasterArchive} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/raster_archive.js';
import {sharedRelayAssetReadPort} from '../packages/breditor-collaboration/dist/relay/assets.js';
test('materialization limits only tighten original budgets and reject selection callbacks',()=>{
 const original=localMetadataMaterializationLimits({}),tight=localMetadataMaterializationLimits({limits:{maxStoredBytes:1}});assert.equal(tight.maxStoredBytes,1);assert.equal(Object.isFrozen(tight),true);
 for(const value of [{limits:{maxStoredBytes:original.maxStoredBytes+1}},{limits:{maxFileBytes:0}},{limits:{extra:true}},{includeOrigin:false}])assert.throws(()=>localMetadataMaterializationLimits(value));
 let calls=0;const accessors={};Object.defineProperty(accessors,'limits',{enumerable:true,get(){calls++;return{};}});assert.throws(()=>localMetadataMaterializationLimits(accessors));assert.equal(calls,0);
});
test('serialized records and public method shadows cannot manufacture a held transport',()=>{
 let calls=0;assert.throws(()=>sharedRelayAssetReadPort({readBytes(){calls++;}}));assert.equal(calls,0);
 assert.equal(typeof LocalMetadataRasterArchive.prototype.metadata,'function');assert.equal('activate'in LocalMetadataRasterArchive.prototype,false);assert.equal('verifyNativeSource'in LocalMetadataRasterArchive.prototype,false);
});
