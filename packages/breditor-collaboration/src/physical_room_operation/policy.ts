/** Closed client-operation errors. Archive integrity and live activation remain separate contracts. */
import {retainInternalFailureCause} from "../internal_failure_cause.js";
export class SharedPhysicalRoomClientOperationError extends Error {
 constructor(readonly code:"physical_operation_policy"|"physical_operation_budget"|"physical_operation_storage"|"physical_operation_exists"|"physical_operation_missing"|"physical_operation_diverged"|"physical_operation_in_use"|"physical_operation_closed"|"physical_operation_aborted"|"physical_operation_authority"|"physical_operation_restore",message:string){super(message);this.name="SharedPhysicalRoomClientOperationError";}
}
export function physicalOperationFailure(code:SharedPhysicalRoomClientOperationError["code"]="physical_operation_storage"):SharedPhysicalRoomClientOperationError{return new SharedPhysicalRoomClientOperationError(code,{
 physical_operation_policy:"Select genuine physical staging custody and explicit matching client destinations",
 physical_operation_budget:"The physical client-operation input exceeds its fixed component envelope",
 physical_operation_storage:"The physical client-operation transaction did not complete",
 physical_operation_exists:"A physical client operation never overwrites an occupied destination",
 physical_operation_missing:"A selected retained database or completed native client is absent",
 physical_operation_diverged:"Physical client-operation intent or actual source differs from the selected pin",
 physical_operation_in_use:"A retained source, client operation or native writer is already held",
 physical_operation_closed:"Physical client-operation custody is closed or its actual storage changed",
 physical_operation_aborted:"Physical client-operation recovery was cancelled",
 physical_operation_authority:"The current synchronous host recovery authority did not hold",
 physical_operation_restore:"An actual native client operation could not be reopened and verified"
}[code]);}
export function physicalOperationKnown(error:unknown,fallback:SharedPhysicalRoomClientOperationError["code"]="physical_operation_storage"):SharedPhysicalRoomClientOperationError {
 if(error instanceof SharedPhysicalRoomClientOperationError)return error;
 try{const code=error&&typeof error==="object"&&"code"in error?String(error.code):"";
  for(const suffix of ["policy","budget","storage","exists","missing","diverged","in_use","closed","aborted","authority","restore"] as const)if(["physical_stage_"+suffix,"catalog_"+suffix,"room_v2_"+suffix,"room_operation_"+suffix].includes(code))return physicalOperationFailure(`physical_operation_${suffix}`);
  if(["recovery_in_use","writer_in_use","review_writer_in_use","generation_participant_busy"].includes(code))return physicalOperationFailure("physical_operation_in_use");
  if(["archive_authority","recovery_authority","participant_authority"].includes(code))return physicalOperationFailure("physical_operation_authority");
  if(code==="archive_aborted"||code==="recovery_aborted")return physicalOperationFailure("physical_operation_aborted");
  if(["archive_integrity","catalog_integrity","physical_stage_source","catalog_source"].includes(code))return physicalOperationFailure("physical_operation_diverged");
  if(code==="archive_capability")return physicalOperationFailure("physical_operation_policy");
 }catch{/* Foreign getters and host payloads are never exposed. */}
 return retainInternalFailureCause(physicalOperationFailure(fallback),error);
}
