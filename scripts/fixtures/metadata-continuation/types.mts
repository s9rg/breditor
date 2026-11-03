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
