/** Private opt-in APIs keep original and restart choices separate. */
import {JointRoomReassociationAttempt as Attempt,withPublishedReassociatedRoomSources} from '../../../packages/breditor-collaboration/dist/native_room_joint_reassociation/attempt.js';
import type {JointReassociationBeginOptions,JointReassociationResumeOptions,JointReassociationPreparationInput,JointReassociationPreparationResumeInput,JointReassociationCommitInput,JointReassociationMetadataInput,JointReassociationPublicationInput} from '../../../packages/breditor-collaboration/dist/native_room_joint_reassociation/attempt_contract.js';
import type {JointReassociationChoice} from '../../../packages/breditor-collaboration/dist/native_room_joint_reassociation/contract.js';
import type {SharedNativeRoomPublicationHost} from '../../../packages/breditor-collaboration/dist/native_publication_control/host.js';
declare const begin:JointReassociationBeginOptions,resume:JointReassociationResumeOptions,prepare:JointReassociationPreparationInput,finish:JointReassociationPreparationResumeInput,commit:JointReassociationCommitInput,metadata:JointReassociationMetadataInput,publish:JointReassociationPublicationInput,host:SharedNativeRoomPublicationHost;
const owner=Attempt.begin(begin),cold=Attempt.resume(resume);
const prepared=Attempt.beginPrepared(begin);void prepared;
const selected:Promise<JointReassociationChoice>=owner.prepare(prepare);
const completed:Promise<JointReassociationChoice>=cold.resumePreparation(finish);
void selected;void completed;void owner.confirmNative(commit);void owner.continueMetadata(metadata);void cold.resumeMetadata(metadata);void owner.publish(host,publish);
void withPublishedReassociatedRoomSources(owner,async(scope,sources)=>{scope.check();for(const row of sources)void row.source.core.documentJson();});
// A retained descriptor is not an execution owner.
// @ts-expect-error
Attempt.begin(resume);
// A retained association does not select a new absent-only prepared execution.
// @ts-expect-error
Attempt.beginPrepared(resume);
// @ts-expect-error
Attempt.resume(begin);
// DATA-only completion deliberately accepts no retired Native requester.
// @ts-expect-error
cold.resumePreparation({...finish,activation:prepare.activation});
// Original joint choices do not satisfy the new association callback.
// @ts-expect-error
owner.confirmNative({...commit,approve:(choice:JointReassociationBeginOptions['original'])=>!!choice});
// A copied control selection is not the actual publication requester.
// @ts-expect-error
owner.publish(resume.expected.plan.publication,publish);
