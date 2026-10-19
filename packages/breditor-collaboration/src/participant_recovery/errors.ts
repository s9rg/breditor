export class SharedParticipantRecoveryError extends Error {
 constructor(readonly code:"recovery_policy"|"recovery_storage"|"recovery_exists"|"recovery_missing"|"recovery_diverged"|"recovery_in_use"|"recovery_closed"|"recovery_aborted"|"recovery_authority",message:string){super(message);this.name="SharedParticipantRecoveryError";}
}
export const recoveryFailure=(code:SharedParticipantRecoveryError["code"]="recovery_storage")=>new SharedParticipantRecoveryError(code,{
 recovery_policy:"Explicit compatible participant recovery policies are required",recovery_storage:"The recovery transaction did not complete",recovery_exists:"Recovery never replaces an existing destination",recovery_missing:"The selected recovery attempt or completed component is missing",recovery_diverged:"Retained recovery state differs from the selected original cut",recovery_in_use:"This recovery or destination is already held",recovery_closed:"The recovery handle is closed or transferred",recovery_aborted:"Participant recovery was cancelled",recovery_authority:"The host recovery authority check did not hold synchronously"
}[code]);
