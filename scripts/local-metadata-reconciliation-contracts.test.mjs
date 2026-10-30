/** Component boundaries only. Positive native/source/server provenance is
 * exercised by metadata-provider-reconciliation-native.test.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {localMetadataPendingRecords} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/reconciliation_metadata.js';
import {prepareLocalMetadataReconciliationInput} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/reconciliation_input.js';
import {SelectedLocalMetadataDelivery as Metadata} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
const records=()=>({suggestions:{retained:[]},revisions:{retained:[]},versions:{packets:[]}});

test('an unpublished proposal, queued decision, retry revision and version remain explicit pending work',()=>{
 const r=records();
 r.suggestions.retained=[{publish:true,publication:null,intent:null,decision:null},{publish:false,publication:null,intent:{retry:false},decision:null}];
 r.revisions.retained=[{retry:true,receipt:null}];r.versions.packets=[{publish:true,accepted:null}];
 assert.deepEqual(localMetadataPendingRecords('a',r),[
  {kind:'metadata',participant:'a',store:'suggestions',index:0,operation:'publish'},
  {kind:'metadata',participant:'a',store:'suggestions',index:1,operation:'decide'},
  {kind:'metadata',participant:'a',store:'revisions',index:0,operation:'revise'},
  {kind:'metadata',participant:'a',store:'versions',index:0,operation:'publish'},
 ]);
});
test('published undecided suggestions and intentionally local unpublished packets are preserved without inventing outbound work',()=>{
 const r=records();r.suggestions.retained=[{publish:true,publication:{sequence:'1'},intent:null,decision:null},{publish:false,publication:null,intent:null,decision:null}];
 r.revisions.retained=[{retry:false,receipt:{sequence:'1'}}];r.versions.packets=[{publish:false,accepted:null},{publish:true,accepted:{sequence:'1'}}];
 assert.deepEqual(localMetadataPendingRecords('a',r),[]);
});
test('copied controller/inventory readers never supply authority through public callbacks',()=>{
 let calls=0;const hostile={selection(){calls++;throw Error('No supplied method');},identity(){calls++;throw Error('No supplied method');},metadata(){calls++;throw Error('No supplied method');},file(){calls++;throw Error('No supplied method');}};
 assert.throws(()=>prepareLocalMetadataReconciliationInput({host:hostile,inventory:hostile}));assert.equal(calls,0);
});
test('a copied metadata receiver cannot inspect input or enter a capture',()=>{
 let calls=0;const input=new Proxy({}, {ownKeys(){calls++;throw Error('No reflection before genuine owner');}});
 assert.throws(()=>Metadata.prototype.captureReconciliation.call({},input));assert.equal(calls,0);
});
test('unknown reconciliation fields do not become a reader selection',()=>{
 let calls=0;const input={host:{},inventory:{},get extra(){calls++;throw Error('Closed contract');}};
 assert.throws(()=>prepareLocalMetadataReconciliationInput(input));assert.equal(calls,0);
});
test('large metadata queues refuse at the report ceiling without an argument-spread overflow',()=>{
 const r=records();r.versions.packets=Array(100001).fill({publish:true,accepted:null});
 assert.throws(()=>localMetadataPendingRecords('a',r),error=>error.code==='local_metadata_assets_reference_budget');
 r.versions.packets.length=100000;assert.equal(localMetadataPendingRecords('a',r).length,100000);
});
