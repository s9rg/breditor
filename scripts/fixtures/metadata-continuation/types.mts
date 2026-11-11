/** Private declarations for real runtime-only composition. */
import type {RoomExecutionAttempt,RoomMetadataTargetWitness} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import type {SelectedNativeRecoveryScope} from '../../../packages/breditor-collaboration/dist/selected_native_recovery/contract.js';
import type {MetadataContinuationChoice,MetadataContinuationResult} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/contract.js';
import type {MetadataContinuationInput} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/coordinator.js';
import {continueRoomMetadata,previewRoomMetadataContinuation,resumeRoomMetadataContinuation} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/coordinator.js';
import {withRoomExecutionMetadataTarget,roomMetadataTargetApprovedCut} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
declare const attempt:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,input:MetadataContinuationInput;
const {expected,approve,...inspection}=input;
const preview:Promise<MetadataContinuationChoice>=previewRoomMetadataContinuation(attempt,reads,inspection);
void[expected,approve];
const continued:Promise<MetadataContinuationResult>=continueRoomMetadata(attempt,reads,input);
const resumed:Promise<MetadataContinuationResult>=resumeRoomMetadataContinuation(attempt,reads,input);
void[preview,continued,resumed];
void withRoomExecutionMetadataTarget(attempt,reads,async(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness)=>roomMetadataTargetApprovedCut(witness,scope));
// @ts-expect-error A persisted description cannot manufacture a real visit witness.
const copied:RoomMetadataTargetWitness={};
void copied;

import {metadataContinuationPreviewRequest,metadataContinuationRunRequest} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/requests.js';
const publicationSeed={...input,approvePublication:(_choice:{readonly publication:string})=>true};
const {expected:priorChoice,...previewSeed}=publicationSeed;
const previewRequest=metadataContinuationPreviewRequest(previewSeed);
const runRequest=metadataContinuationRunRequest(publicationSeed);
const projectedPreview:typeof inspection=previewRequest;
const projectedRun:MetadataContinuationInput=runRequest;
void[priorChoice,projectedPreview,projectedRun];
// @ts-expect-error A read-only request has no metadata approval callback.
previewRequest.approve;
// @ts-expect-error Final publication approval stays with the owning coordinator.
runRequest.approvePublication;
// @ts-expect-error Continuation requires its expected choice.
metadataContinuationRunRequest(previewSeed);

import type {
 HandoverMetadataContinuationChoice,HandoverMetadataContinuationInput,HandoverMetadataContinuationResult,
} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/handover_contract.js';
import {
 previewHeldRoomMetadataContinuationAcrossHandover,continueHeldRoomMetadataAcrossHandover,
} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/coordinator.js';
declare const handoverInput:HandoverMetadataContinuationInput;
const {expected:handoverChoice,approve:handoverApproval,...handoverInspection}=handoverInput;
void [handoverChoice,handoverApproval];
void withRoomExecutionMetadataTarget(attempt,reads,async(scope,witness)=>{
 const preview:Promise<HandoverMetadataContinuationChoice>=previewHeldRoomMetadataContinuationAcrossHandover(scope,witness,handoverInspection);
 const result:Promise<HandoverMetadataContinuationResult>=continueHeldRoomMetadataAcrossHandover(scope,witness,handoverInput,true);
 void [preview,result];
 // @ts-expect-error An ordinary continuation choice cannot replace sealed lineage.
 continueHeldRoomMetadataAcrossHandover(scope,witness,{...handoverInput,expected},true);
 // @ts-expect-error A detached seal cannot supply a genuine path controller.
 previewHeldRoomMetadataContinuationAcrossHandover(scope,witness,{...handoverInspection,path:handoverChoice.handover});
});
