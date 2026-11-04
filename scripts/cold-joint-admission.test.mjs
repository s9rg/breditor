/** Actual private brands must precede every cold inspection input. These are
 * negative component laws, not evidence of a reconstructed or published room. */
import test from 'node:test';import assert from 'node:assert/strict';
import {withColdJointActivationOrigin,checkColdJointActivationOrigin} from '../packages/breditor-collaboration/dist/native_room_joint_activation/cold_origin.js';
import {inspectColdJointNativeCapture} from '../packages/breditor-collaboration/dist/native_room_joint_activation/cold_native_inspection.js';
import {withPublishedColdJointRoomSources} from '../packages/breditor-collaboration/dist/native_room_joint_activation/cold_attempt.js';
import {LocalMetadataReferenceWork} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/room_work.js';
import {verifiedMetadataTargetFamilies} from '../packages/breditor-collaboration/dist/selected_local_metadata_continuation/native_origin.js';
test('cold origin refuses copied witnesses before joint descriptor or callback reflection',async()=>{
 let calls=0;const poison=new Proxy({},{ownKeys(){calls++;throw Error('No reflection');},get(){calls++;throw Error('No reflection');}});
 for(const scope of [{},{check(){calls++;}}])await assert.rejects(withColdJointActivationOrigin(scope,{},poison,()=>{calls++;}));assert.equal(calls,0);
});
test('cold Native inspection requires the actual same-visit origin before reading scope or host callbacks',async()=>{
 let calls=0;const poison=new Proxy({},{get(){calls++;throw Error('No caller callback');}});
 assert.throws(()=>checkColdJointActivationOrigin(poison,{}));await assert.rejects(inspectColdJointNativeCapture(poison,poison,poison));assert.equal(calls,0);
});
test('published cold-source visitor refuses copied owners before invoking application work',async()=>{
 let calls=0;for(const owner of [{},{takeOwner(){calls++;}}])await assert.rejects(withPublishedColdJointRoomSources(owner,()=>{calls++;}));assert.equal(calls,0);
});
test('metadata family continuation requires an actual same-visit inspection before reader input reflection',()=>{
 let calls=0;const poison=new Proxy({},{ownKeys(){calls++;throw Error('No input reflection');},get(){calls++;throw Error('No input reflection');}});
 assert.throws(()=>verifiedMetadataTargetFamilies(poison,poison));
 assert.throws(()=>LocalMetadataReferenceWork.forVerifiedMetadataTarget(poison,poison,()=>{calls++;},poison));assert.equal(calls,0);
});
