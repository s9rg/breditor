/** Separate staging failures. Native files, authority and an editable room are different capabilities. */
export const MAX_PHYSICAL_ROOM_STAGE_PARTICIPANTS=1024;
export const MAX_PHYSICAL_ROOM_STAGE_PLAN_BYTES=16*1024*1024;
export class SharedPhysicalRoomParticipantStageError extends Error {
 constructor(readonly code:"physical_stage_policy"|"physical_stage_budget"|"physical_stage_storage"|"physical_stage_exists"|"physical_stage_missing"|"physical_stage_diverged"|"physical_stage_in_use"|"physical_stage_closed"|"physical_stage_aborted"|"physical_stage_authority"|"physical_stage_source"|"physical_stage_restore",message:string){super(message);this.name="SharedPhysicalRoomParticipantStageError";}
}
export function physicalStageFailure(code:SharedPhysicalRoomParticipantStageError["code"]="physical_stage_storage"):SharedPhysicalRoomParticipantStageError{return new SharedPhysicalRoomParticipantStageError(code,{
 physical_stage_policy:"Select an admitted physical catalog, explicit independent selection and native recovery factories",
 physical_stage_budget:"The explicit physical participant stage exceeds its fixed envelope",
 physical_stage_storage:"The physical participant staging transaction did not complete",
 physical_stage_exists:"A physical participant stage never overwrites an occupied destination",
 physical_stage_missing:"A selected staging record or completed native participant is absent",
 physical_stage_diverged:"Retained source files or staging intent differ from the selected physical catalog",
 physical_stage_in_use:"The catalog, stage or actual native writer is already held",
 physical_stage_closed:"Physical participant staging is closed or its actual custody changed",
 physical_stage_aborted:"Physical participant staging was cancelled",
 physical_stage_authority:"The current synchronous host recovery authority did not hold",
 physical_stage_source:"The selected genuine native histories do not match the physical source",
 physical_stage_restore:"A private read-only native participant could not be restored and verified"
}[code]);}
export function physicalStageKnown(error:unknown,fallback:SharedPhysicalRoomParticipantStageError["code"]="physical_stage_storage"):SharedPhysicalRoomParticipantStageError{
 if(error instanceof SharedPhysicalRoomParticipantStageError)return error;
 try{const code=error&&typeof error==="object"&&"code"in error?String(error.code):"";
  if(["catalog_in_use","recovery_in_use","writer_in_use","review_writer_in_use"].includes(code))return physicalStageFailure("physical_stage_in_use");
  if(code==="catalog_source")return physicalStageFailure("physical_stage_source");
  if(code==="catalog_policy"||code==="archive_capability")return physicalStageFailure("physical_stage_policy");
  if(code==="catalog_budget")return physicalStageFailure("physical_stage_budget");
  if(code==="catalog_exists")return physicalStageFailure("physical_stage_exists");
  if(code==="catalog_missing")return physicalStageFailure("physical_stage_missing");
  if(code==="catalog_closed")return physicalStageFailure("physical_stage_closed");
  if(code==="catalog_aborted"||code==="archive_aborted")return physicalStageFailure("physical_stage_aborted");
  if(["archive_authority","catalog_authority","participant_authority","recovery_authority"].includes(code))return physicalStageFailure("physical_stage_authority");
  if(code==="catalog_diverged"||code==="catalog_integrity"||code==="archive_integrity")return physicalStageFailure("physical_stage_diverged");
 }catch{/* Never leak foreign getters, native payloads or host exception text. */}
 return physicalStageFailure(fallback);
}
