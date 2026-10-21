/** Public failures retain no private document, packet, native or provider message. */
import {participantAuthority} from "../participant_backup/policy.js";
import {SharedParticipantRecoveryError} from "../participant_recovery/errors.js";
import {SharedParticipantOperationError} from "../participant_operation/errors.js";
import {SharedGenerationParticipantError} from "../generation_participant/policy.js";
import {SharedGenerationOperationError} from "../generation_operation/policy.js";
import {SharedRoomRecoveryCatalogError} from "../room_recovery_catalog/policy.js";
import {SharedRoomOperationError} from "../room_operation/errors.js";
import {retainInternalFailureCause} from "../internal_failure_cause.js";
export class SharedRoomOperationV2Error extends Error{
 constructor(readonly code:"room_v2_policy"|"room_v2_exists"|"room_v2_missing"|"room_v2_diverged"|"room_v2_storage"|"room_v2_in_use"|"room_v2_closed"|"room_v2_aborted"|"room_v2_authority"|"room_v2_admission"){
  super("Mixed room operation requires genuine retained native owners, exact original files and current host policy");this.name="SharedRoomOperationV2Error";
 }
}
export const v2Failure=(code:SharedRoomOperationV2Error["code"]="room_v2_storage")=>new SharedRoomOperationV2Error(code);
export function v2Known(error:unknown):SharedRoomOperationV2Error{
 if(error instanceof SharedRoomOperationV2Error)return error;
 if(error instanceof SharedRoomOperationError){if(error.code==="room_operation_storage")return v2Failure("room_v2_storage");if(error.code==="room_operation_closed")return v2Failure("room_v2_closed");if(error.code==="room_operation_in_use")return v2Failure("room_v2_in_use");}
 if(error instanceof SharedParticipantRecoveryError&&error.code==="recovery_in_use"||error instanceof SharedParticipantOperationError&&error.code==="operation_in_use"||error instanceof SharedGenerationParticipantError&&error.code==="generation_participant_busy"||error instanceof SharedGenerationOperationError&&error.code==="generation_operation_busy"||error instanceof SharedRoomRecoveryCatalogError&&error.code==="catalog_in_use")return v2Failure("room_v2_in_use");
 if(error instanceof SharedRoomRecoveryCatalogError&&error.code==="catalog_closed")return v2Failure("room_v2_closed");if(error instanceof SharedRoomRecoveryCatalogError&&error.code==="catalog_policy")return v2Failure("room_v2_policy");return retainInternalFailureCause(v2Failure("room_v2_admission"),error);
}
export function v2Signal(signal?:AbortSignal):void{if(signal?.aborted)throw v2Failure("room_v2_aborted");}
export function v2Authority(check:()=>void):()=>void{let actual:()=>void;try{actual=participantAuthority(check);}catch(error){throw retainInternalFailureCause(v2Failure("room_v2_authority"),error);}return()=>{try{actual();}catch(error){throw retainInternalFailureCause(v2Failure("room_v2_authority"),error);}};}
