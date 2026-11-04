/** Negative authority cases use no fabricated document, history or server. */
import test from 'node:test';import assert from 'node:assert/strict';
import {JointActivationMetadataOrigin as Origin,jointActivationMetadataBundle} from '../packages/breditor-collaboration/dist/native_room_joint_activation/metadata_origin.js';
import {SelectedLocalMetadataDelivery as Metadata,readLocalMetadataActivationInScope} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/coordinator.js';
import {previewJointRoomMetadataContinuation} from '../packages/breditor-collaboration/dist/native_room_joint_activation/metadata_preview.js';
import {continueJointRoomMetadata,resumeJointRoomMetadataContinuation} from '../packages/breditor-collaboration/dist/native_room_joint_activation/metadata_continue.js';
test('a saved selection or prototype-shaped origin supplies no actual metadata bundle',()=>{
 for(const fake of [{},Object.create(Origin.prototype),{format:'breditor/joint-activation-metadata-origin',formatVersion:1}])assert.throws(()=>jointActivationMetadataBundle(fake,{},{}),e=>e.code==='joint_source_state');
 assert.throws(()=>new Origin({}, {}, {}),e=>e.code==='joint_source_state');
});
test('metadata copies and prototypes cannot read a complete intent under any scope',async()=>{
 let called=0;for(const fake of [{readNativeActivationIntent(){called++;}},Object.create(Metadata.prototype),null])await assert.rejects(readLocalMetadataActivationInScope(fake,{},{}),e=>e.code==='activation_intent_policy');assert.equal(called,0);
});
test('scope-shaped descriptions cannot capture original metadata even with callable checks',async()=>{
 let called=0;for(const fake of [{},{check(){called++;},retainCurrent(){called++;}}])await assert.rejects(Origin.capture(fake,{},{}));assert.equal(called,0);
});
for(const [name,action]of [['preview',previewJointRoomMetadataContinuation],['continue',continueJointRoomMetadata],['resume',resumeJointRoomMetadataContinuation]])test(name+' cannot act through a copied executor or read caller declarations before actual admission',async()=>{
 let called=0;const input=new Proxy({},{ownKeys(){called++;return[];}});await assert.rejects(action({}, {}, {},input),e=>e.code==='room_execution_policy');assert.equal(called,0);
});
