/** Fixed read-only room diagnostics; no journal, host callback or packet bodies are exposed. */
export class SharedRoomReplayError extends Error{
 constructor(readonly code:"room_replay_policy"|"room_replay_native"|"room_replay_closed"|"room_replay_continuity"|"room_replay_aborted"|"room_replay_authority"){
  super({room_replay_policy:"Select the genuine catalog and an explicit original policy for every retained copy",room_replay_native:"A retained copy did not match its actual native sources or original registration inventory",room_replay_closed:"The room replay or its borrowed catalog is closed or no longer current",room_replay_continuity:"The selected current native owner does not retain this original copy's journals",room_replay_aborted:"Room replay work was cancelled",room_replay_authority:"The current host room-replay authority did not hold synchronously"}[code]);this.name="SharedRoomReplayError";
 }
}
import {SharedParticipantReplayError} from "../participant_replay/errors.js";
export function roomReplayFailure(error:unknown,fallback:SharedRoomReplayError["code"]):SharedRoomReplayError{
 if(error instanceof SharedRoomReplayError)return error;
 if(error instanceof SharedParticipantReplayError){if(error.code==="participant_replay_aborted")return new SharedRoomReplayError("room_replay_aborted");if(error.code==="participant_replay_authority")return new SharedRoomReplayError("room_replay_authority");}
 return new SharedRoomReplayError(fallback);
}
