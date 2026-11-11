/** Saved workflow descriptions never become source, actor or publication owners. */
import * as api from '@breditor/collaboration';
import {JointRoomActivationAttempt,withJointRoomActivationSources,withPublishedJointRoomSources} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/attempt.js';
import type {JointRoomActivationIntentChoice} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/intent_contract.js';
import type {JointRoomActivationPreparationInput,JointRoomNativeCommitInput,JointRoomReplacementInput,JointRoomMetadataInput,JointRoomPublicationInput} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/attempt_contract.js';
import type {JointHandoverActivationIntentChoice,JointHandoverActivationPreparationInput,JointHandoverNativeCommitInput,JointHandoverMetadataInput,JointHandoverPublicationInput} from '../../../packages/breditor-collaboration/dist/native_room_joint_activation/handover_contract.js';
import type {HandoverMetadataContinuationResult} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/handover_contract.js';
import type {RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
import type {MetadataContinuationResult} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/contract.js';
import type {SharedNativeRoomPublicationReceipt} from '../../../packages/breditor-collaboration/dist/native_publication_control/contract.js';
declare const original:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions;
declare const preparation:JointRoomActivationPreparationInput,commit:JointRoomNativeCommitInput,replacement:JointRoomReplacementInput,metadata:JointRoomMetadataInput,publication:JointRoomPublicationInput,saved:JointRoomActivationIntentChoice;
const attempt:JointRoomActivationAttempt=JointRoomActivationAttempt.begin(original,reads);
const prepared:Promise<JointRoomActivationIntentChoice>=attempt.prepare(preparation);
void attempt.prepare(preparation,true);void attempt.commitNative(commit);void attempt.recoverReplacement(replacement);
void attempt.continueMetadata(metadata);void attempt.continueMetadata(metadata,true);
const served:Promise<SharedNativeRoomPublicationReceipt>=attempt.publish(publication);
const publishedMetadata:MetadataContinuationResult=attempt.publishedMetadata();
// @ts-expect-error Metadata DATA cannot take actors or publish a room.
void publishedMetadata.takeOwner();
const owner:RetainedSelectedAssetOwner=attempt.takeOwner();void attempt.close();
void withJointRoomActivationSources(attempt,async work=>{work.check();work.scope.check();void work.signal;return work.sources.length;});
void withPublishedJointRoomSources(attempt,async work=>{work.check();return work.sources.length;});
// @ts-expect-error A retained descriptor is not an executable source owner.
void withJointRoomActivationSources(saved,async()=>{});
// @ts-expect-error A saved receipt cannot provide promoted target custody.
void withPublishedJointRoomSources({phase:'receipt-observed'},async()=>{});
// @ts-expect-error Construction is private and needs the actual synchronous reservation.
new JointRoomActivationAttempt({},original,reads);
// @ts-expect-error A source-shaped object cannot reserve all actual actors.
JointRoomActivationAttempt.begin({clients:[]},reads);
// @ts-expect-error Native commit requires an authenticated actual host, not a saved receipt.
void attempt.commitNative({receipt:{},approve:()=>true});
// @ts-expect-error The coordinator exposes no private source scope outside a finite visit.
void attempt.scope;
// @ts-expect-error A caller cannot extract an executor and bypass publication.
void attempt.execution;
// @ts-expect-error Native serving authority is not a method on saved workflow DATA.
void saved.publish(publication);
// @ts-expect-error Experimental joint custody is not a public package-root capability.
void api.JointRoomActivationAttempt;
void prepared;void served;void owner;

declare const handoverPreparation:JointHandoverActivationPreparationInput,handoverCommit:JointHandoverNativeCommitInput;
declare const handoverMetadata:JointHandoverMetadataInput,handoverPublication:JointHandoverPublicationInput;
const handover=JointRoomActivationAttempt.beginAcrossHandover(original,reads);
const handoverChoice:Promise<JointHandoverActivationIntentChoice>=handover.prepare(handoverPreparation);
void handover.commitNative(handoverCommit);
void handover.continueMetadata(handoverMetadata,true);
void handover.publish(handoverPublication);
const handoverResult:HandoverMetadataContinuationResult=handover.publishedMetadata();
void handoverChoice;void handoverResult;
void withJointRoomActivationSources(handover,async work=>work.sources.length);
void withPublishedJointRoomSources(handover,async work=>work.sources.length);
// @ts-expect-error A same-origin preparation cannot substitute for sealed lineage.
void handover.prepare(preparation);
// @ts-expect-error A same-origin activation commit carries no genuine handover path.
void handover.commitNative(commit);
// @ts-expect-error A same-origin delivery control cannot substitute for a handover path.
void handover.continueMetadata(metadata);
// @ts-expect-error Handover publication binds a distinct intent and metadata policy.
void attempt.publish(handoverPublication);
