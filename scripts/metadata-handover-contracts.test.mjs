/** Closed declarations and private receiver checks. The native workflow proves ancestry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {SelectedLocalReviewDelivery as Review} from '../packages/breditor-collaboration/dist/selected_local_review_delivery/coordinator.js';
import {previewSelectedLocalReviewHandover} from '../packages/breditor-collaboration/dist/selected_local_review_delivery/resume_admission.js';
import {localReviewHandoverResumeChoice} from '../packages/breditor-collaboration/dist/selected_local_review_delivery/handover_identity.js';
import {localReviewResumeChoice} from '../packages/breditor-collaboration/dist/selected_local_review_delivery/resume_identity.js';
import {SelectedLocalMetadataDelivery as Metadata} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {prepareHandoverMetadataReconciliation} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/handover_reconciliation.js';
import {localMetadataFixture} from './fixtures/local-metadata/session.mjs';
import {transportFixture} from './fixtures/server-generation-archive/transport.mjs';

await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});

function handoverPath(){
 const earlier=transportFixture().expected,current=structuredClone(earlier);
 current.native.source.records++;
 current.native.manifest[0]^=1;
 const source={origin:current,server:current,participants:{source:current.native,sha256:Array(32).fill(4)}};
 const recovery={format:'breditor/server-log-generation-recovery-control',formatVersion:1,instance:'b'.repeat(64),source};
 const delivery={format:'breditor/server-log-generation-delivery-recovery-control',formatVersion:1,instance:'c'.repeat(64),continuation:{format:'breditor/server-log-generation-delivery-continuation',formatVersion:1,previous:current,current:source},current:recovery};
 const successor={format:'breditor/server-log-generation-delivery-path',formatVersion:1,ancestors:[current],current:source};
 const control={format:'breditor/server-log-generation-delivery-path-recovery-control',formatVersion:1,instance:'d'.repeat(64),path:successor,current:delivery};
 return {format:'breditor/server-log-generation-handover-delivery-path-recovery-control',formatVersion:1,path:{format:'breditor/server-log-generation-handover-delivery-path',formatVersion:1,seal:{identity:{format:'breditor/room-deployment-authority',formatVersion:1,authority:'e'.repeat(64),binding:'f'.repeat(64)},generation:'2',owner:'a'.repeat(64)},earlier:[earlier],successor},current:control};
}
test('copied review scopes and metadata receivers cannot reflect handover inputs',async()=>{
 let reflected=0;
 const input=new Proxy({},{ownKeys(){reflected++;throw Error('Invalid receivers cannot inspect inputs');}});
 await assert.rejects(previewSelectedLocalReviewHandover({},input),error=>error.code==='native_delivery_closed');
 await assert.rejects(Review.resumeAcrossHandover({},input),error=>error.code==='native_delivery_closed');
 assert.throws(()=>Metadata.prototype.captureServerPacketReconciliationAcrossHandover.call({},input));
 assert.equal(reflected,0);
});
test('copied controls cannot establish a metadata handover through public methods',()=>{
 let called=0;
 const fake={selection(){called++;},file(){called++;},metadata(){called++;},identity(){called++;}};
 assert.throws(()=>prepareHandoverMetadataReconciliation({host:fake,path:fake,inventory:fake}));
 assert.equal(called,0);
});
test('handover review choices pin the original bundle and stored revision in a separate family',async()=>{
 const fixture=await localMetadataFixture(native);
 try{
  const selected=localReviewHandoverResumeChoice({format:'breditor/selected-local-review-handover-resume',formatVersion:1,delivery:fixture.parent,bundle:{current:fixture.parent.before,bytes:1,sha256:'1'.repeat(64)},stored:{revision:3,bytes:2,sha256:'2'.repeat(64)},current:fixture.parent.before,path:handoverPath()});
  assert.equal(selected.stored.revision,3);
  assert.deepEqual(selected.delivery,fixture.parent);
  assert.ok(Object.isFrozen(selected.path.path.earlier));
  assert.throws(()=>localReviewResumeChoice(selected));
  for(const edit of [
   value=>{value.path.path.seal.generation='0';},
   value=>{value.path.path.earlier=[];},
   value=>{value.path.current.path.ancestors=[];},
   value=>{value.ready=true;},
   value=>{value.stored.revision--;value.stored.extra='saved approval';},
  ]){
   const changed=structuredClone(selected);
   edit(changed);
   assert.throws(()=>localReviewHandoverResumeChoice(changed));
  }
 }finally{await fixture.close();}
});
test('private handover composition stays absent from package root exports',()=>{
 for(const name of ['previewSelectedLocalReviewHandover','localReviewHandoverResumeChoice','prepareHandoverMetadataReconciliation']){
  assert.equal(api[name],undefined);
 }
});
