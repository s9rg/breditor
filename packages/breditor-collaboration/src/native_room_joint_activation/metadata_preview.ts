/** Inspect continuation using the four files bound to an actual activation
 * capture. Keep origin binding and target inspection in one executor visit. */
import {withRoomExecutionMetadataTarget,type RoomExecutionAttempt} from '../native_room_execution_run/attempt.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {previewHeldRoomMetadataContinuation,type MetadataContinuationInspectionInput} from '../selected_local_metadata_continuation/coordinator.js';
import {jointActivationMetadataBundle,type JointActivationMetadataOrigin} from './metadata_origin.js';
import type {JointMetadataContinuationInspectionInput} from './metadata_continuation_contract.js';
export function previewJointRoomMetadataContinuation(attempt:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,origin:JointActivationMetadataOrigin,provided:JointMetadataContinuationInspectionInput){
 return withRoomExecutionMetadataTarget(attempt,reads,async(scope,witness)=>{
  const bundle=jointActivationMetadataBundle(origin,witness,scope),r=fields(provided,['database','preparationDatabase','reviewDatabase','metadataDatabase','host','inventory','checkAuthority']);
  return previewHeldRoomMetadataContinuation(scope,witness,{...r,origin:bundle} as MetadataContinuationInspectionInput);
 });
}
