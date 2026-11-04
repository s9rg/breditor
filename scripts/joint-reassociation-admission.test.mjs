/** Forged saved contexts cannot reflect new inputs or mint a published owner. */
import test from 'node:test';import assert from 'node:assert/strict';
import {captureJointReassociation} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/capture.js';
import {prepareJointReassociation,resumeJointReassociationPreparation} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/prepare.js';
import {withHeldReassociationIntents} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/held_intents.js';
import {withExactPriorMetadata,withSelectedPriorMetadata} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/prior_metadata.js';
import {commitReassociatedNative} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/native_commit.js';
import {continueReassociatedMetadata} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/metadata_continue.js';
import {publishReassociatedRoom} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/publish.js';
import {withPublishedReassociatedRoomSources} from '../packages/breditor-collaboration/dist/native_room_joint_reassociation/attempt.js';
test('all restart actions reject copied origin before reflecting new choices, metadata or requesters',async()=>{
 let reflected=0,visited=0;const poison=new Proxy({},{get(){reflected++;throw Error('No reflection');},ownKeys(){reflected++;throw Error('No reflection');}}),visit=()=>{visited++;throw Error('No visitor');},scope={},origin={},context={scope,origin};
 for(const action of [()=>captureJointReassociation(scope,origin,poison,poison),()=>prepareJointReassociation(scope,origin,poison,poison,visit),()=>resumeJointReassociationPreparation(scope,origin,poison,poison,visit),()=>withHeldReassociationIntents(scope,origin,poison,poison,visit),()=>withExactPriorMetadata(scope,origin,poison,visit),()=>withSelectedPriorMetadata(scope,origin,poison,poison,visit),()=>commitReassociatedNative(context,poison),()=>continueReassociatedMetadata(context,poison,false),()=>publishReassociatedRoom(context,poison,poison,poison)])await assert.rejects(action(),error=>error.code==='joint_activation_state');
 assert.equal(reflected,0);assert.equal(visited,0);
});
test('saved publication DATA cannot become a client source visitor',async()=>{
 let visited=0;for(const owner of [{},{receipt:{scope:'actual-held-native-service-and-bound-listener; joint-association-only'}}])await assert.rejects(withPublishedReassociatedRoomSources(owner,()=>{visited++;throw Error('No sources');}));assert.equal(visited,0);
});
