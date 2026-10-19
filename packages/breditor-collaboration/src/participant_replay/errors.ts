/** Fixed public diagnostics; native journals, packet bodies and host errors stay private. */
export class SharedParticipantReplayError extends Error{
 constructor(readonly code:"participant_replay_policy"|"participant_replay_native"|"participant_replay_closed"|"participant_replay_continuity"|"participant_replay_authority"|"participant_replay_aborted"){
  super({participant_replay_policy:"Select a genuine participant backup and matching explicit replay policy",participant_replay_native:"Matching native replay did not admit the complete original participant sources",participant_replay_closed:"The participant replay or its borrowed source is closed or no longer current",participant_replay_continuity:"The current native owner does not retain this participant's original journals",participant_replay_authority:"The current host replay authority did not hold synchronously",participant_replay_aborted:"Participant replay work was cancelled"}[code]);this.name="SharedParticipantReplayError";
 }
}
import {SharedParticipantRecoveryError} from "../participant_recovery/errors.js";
export function participantReplayFailure(error:unknown,fallback:SharedParticipantReplayError["code"]):SharedParticipantReplayError{
 if(error instanceof SharedParticipantReplayError)return error;
 if(error instanceof SharedParticipantRecoveryError){if(error.code==="recovery_aborted")return new SharedParticipantReplayError("participant_replay_aborted");if(error.code==="recovery_authority")return new SharedParticipantReplayError("participant_replay_authority");}
 return new SharedParticipantReplayError(fallback);
}
