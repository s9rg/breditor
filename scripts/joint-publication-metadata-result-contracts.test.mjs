/** Metadata snapshots remain DATA and cannot be extracted through copied owners. */
import test from 'node:test';import assert from 'node:assert/strict';
import {JointRoomActivationAttempt as Warm} from '../packages/breditor-collaboration/dist/native_room_joint_activation/attempt.js';
import {ColdJointRoomActivationAttempt as Cold} from '../packages/breditor-collaboration/dist/native_room_joint_activation/cold_attempt.js';
for(const [name,Owner]of [['warm',Warm],['cold',Cold]])test(name+' publication metadata refuses copied or prototype-shaped owners',()=>{
 for(const fake of [{},Object.create(Owner.prototype),{phase:'receipt-observed',continued:{}}])assert.throws(()=>Owner.prototype.publishedMetadata.call(fake));
});
