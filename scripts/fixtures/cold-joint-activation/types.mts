/** A saved descriptor is DATA, never a cold recipient or Native requester. */
import * as api from '@breditor/collaboration';
import {ColdJointRoomActivationAttempt as Cold,withPublishedColdJointRoomSources} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/cold_attempt.js';
import type {ColdJointRoomActivationOptions,ColdJointRoomReplacementInput} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/cold_contract.js';
import type {JointRoomNativeCommitInput,JointRoomMetadataInput,JointRoomPublicationInput} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/attempt_contract.js';
import type {SharedNativeRoomPublicationHost} from '../../../packages/breditor-collaboration/dist/native_publication_control/host.js';
import type {JointRoomActivationIntentChoice} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/intent_contract.js';
declare const options:ColdJointRoomActivationOptions,replacement:ColdJointRoomReplacementInput,commit:JointRoomNativeCommitInput,metadata:JointRoomMetadataInput,publication:JointRoomPublicationInput,host:SharedNativeRoomPublicationHost,saved:JointRoomActivationIntentChoice;
const cold=Cold.resume(options);void cold.recoverReplacement(replacement);void cold.completePromotion();void cold.confirmNative(commit);void cold.continueMetadata(metadata);void cold.continueMetadata(metadata,true);void cold.publish(host,publication);void cold.publishedMetadata();void cold.takeOwner();void cold.close();
void withPublishedColdJointRoomSources(cold,async(scope,sources)=>{scope.check();return sources.length;});
// @ts-expect-error Construction is private; no old actor or receipt can initialize it.
new Cold(options);
// @ts-expect-error A saved descriptor has no actual cold target custody.
void withPublishedColdJointRoomSources(saved,async()=>{});
// @ts-expect-error Publication needs a real requester and a fresh decision.
void cold.publish(saved,publication);
// @ts-expect-error These internal composition APIs are not public package-root promises.
void api.ColdJointRoomActivationAttempt;
