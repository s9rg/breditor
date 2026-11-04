/** Continue or resume into fresh namespaces from the original actual activation
 * capture. Stored selections never provide a source owner or a target witness. */
import {withRoomExecutionMetadataTarget,type RoomExecutionAttempt} from '../native_room_execution_run/attempt.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {continueHeldRoomMetadata,type MetadataContinuationInput} from '../selected_local_metadata_continuation/coordinator.js';
import {jointActivationMetadataBundle,type JointActivationMetadataOrigin} from './metadata_origin.js';
import type {JointMetadataContinuationInput} from './metadata_continuation_contract.js';
function run(attempt:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,origin:JointActivationMetadataOrigin,provided:JointMetadataContinuationInput,resume:boolean){
 return withRoomExecutionMetadataTarget(attempt,reads,async(scope,witness)=>{
  const bundle=jointActivationMetadataBundle(origin,witness,scope),r=fields(provided,['database','preparationDatabase','reviewDatabase','metadataDatabase','host','inventory','checkAuthority','expected','approve']);
  return continueHeldRoomMetadata(scope,witness,{...r,origin:bundle} as MetadataContinuationInput,resume);
 });
}
export const continueJointRoomMetadata=(attempt:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,origin:JointActivationMetadataOrigin,input:JointMetadataContinuationInput)=>run(attempt,reads,origin,input,false);
/** Existing-only immutable origin checks remain identical on an explicit retry. */
export const resumeJointRoomMetadataContinuation=(attempt:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,origin:JointActivationMetadataOrigin,input:JointMetadataContinuationInput)=>run(attempt,reads,origin,input,true);
